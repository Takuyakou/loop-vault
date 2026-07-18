import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { makeChordSymbol } from "../../domain/chords";
import {
  analyzerQuickCandidates,
  chordsEqual,
  quickCandidateSelectionMetadata,
  type EditableChordSlot,
  type ProgressionEditSource,
  type QuickCandidateSelectionMetadata,
  type QuickChordCandidate,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import {
  quickChordEditorCopy,
  type AppLanguage,
} from "../../i18n";
import { ArrowLeft, ArrowRight, Play, X } from "lucide-react";
import { Modal } from "../Modal";
import { ChordStructureEditor } from "./ChordStructureEditor";

type QuickApplySource = Extract<
  ProgressionEditSource,
  "alternative" | "structure-editor"
>;

interface QuickChordEditorProps {
  slot: EditableChordSlot;
  anchorElement: HTMLElement;
  language: AppLanguage;
  resetLabel?: string;
  candidates?: readonly QuickChordCandidate[];
  onPreview: (chord: ChordSymbol) => void;
  onApply: (
    chord: ChordSymbol,
    source: QuickApplySource,
    selection?: QuickCandidateSelectionMetadata,
  ) => void;
  onReset: () => void;
  onOpenInspector: () => void;
  onClose: () => void;
}

export function QuickChordEditor({
  slot,
  anchorElement,
  language,
  resetLabel,
  candidates: providedCandidates,
  onPreview,
  onApply,
  onReset,
  onOpenInspector,
  onClose,
}: QuickChordEditorProps) {
  const text = quickChordEditorCopy[language];
  const panelRef = useRef<HTMLDivElement>(null);
  const [draftChord, setDraftChord] = useState(() => cloneChord(slot.currentChord));
  const [source, setSource] = useState<QuickApplySource>("structure-editor");
  const [selectedCandidate, setSelectedCandidate] = useState<QuickChordCandidate>();
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320 });
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const candidates = providedCandidates ?? analyzerQuickCandidates(slot.alternatives);
  const hasDraftChanges = !chordsEqual(draftChord, slot.currentChord);

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorElement.getBoundingClientRect();
      const panelHeight = panelRef.current?.getBoundingClientRect().height || 430;
      const width = Math.min(320, Math.max(240, window.innerWidth - 16));
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
      const below = anchor.bottom + 8;
      const top = below + panelHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, anchor.top - panelHeight - 8);
      setPosition({ left, top, width });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement]);

  useEffect(() => {
    panelRef.current?.focus();
    return () => anchorElement.focus();
  }, [anchorElement]);

  useEffect(() => {
    function handleOutsideMouseDown(event: MouseEvent) {
      if (closeConfirmationOpen || panelRef.current?.contains(event.target as Node)) return;
      if (hasDraftChanges) {
        event.preventDefault();
        event.stopPropagation();
        setCloseConfirmationOpen(true);
        return;
      }
      onClose();
    }

    document.addEventListener("mousedown", handleOutsideMouseDown, true);
    return () => document.removeEventListener("mousedown", handleOutsideMouseDown, true);
  }, [closeConfirmationOpen, hasDraftChanges, onClose]);

  function requestClose() {
    if (hasDraftChanges) {
      setCloseConfirmationOpen(true);
      return;
    }
    onClose();
  }

  function applyAndClose() {
    const selectedIndex = selectedCandidate
      ? candidates.findIndex((candidate) => (
          candidate.normalizedKey === selectedCandidate.normalizedKey
          && candidate.primarySource === selectedCandidate.primarySource
        ))
      : -1;
    const selection = source === "alternative" && selectedCandidate && selectedIndex >= 0
      ? quickCandidateSelectionMetadata(selectedCandidate, selectedIndex, candidates.length)
      : undefined;
    if (selection) onApply(draftChord, source, selection);
    else onApply(draftChord, source);
    onClose();
  }

  function chooseCandidate(candidate: QuickChordCandidate) {
    setDraftChord(cloneChord(candidate.chord));
    setSource("alternative");
    setSelectedCandidate(candidate);
    onPreview(candidate.chord);
  }

  function shiftRoot(direction: -1 | 1) {
    setDraftChord((current) => makeChordSymbol(
      (current.root + direction + 12) % 12,
      current.quality,
      [...current.tensions],
      current.bass,
    ));
    setSource("structure-editor");
    setSelectedCandidate(undefined);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key === "Tab") {
      trapFocus(event, panelRef.current);
      return;
    }
    if (isTextControl(event.target)) return;

    const number = Number(event.key);
    if (number >= 1 && number <= 5) {
      const candidate = candidates[number - 1];
      if (candidate) {
        event.preventDefault();
        chooseCandidate(candidate);
      }
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      onPreview(draftChord);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      shiftRoot(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      shiftRoot(1);
    } else if (event.key.toLowerCase() === "u") {
      event.preventDefault();
      onReset();
      onClose();
    } else if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      onOpenInspector();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      applyAndClose();
    }
  }

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={text.title}
      tabIndex={-1}
      className="fixed z-50 max-h-[calc(100vh-1rem)] overflow-y-auto border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-4 shadow-2xl outline-none"
      style={position}
      onKeyDown={handleKeyDown}
      data-quick-chord-editor
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{text.title}</p>
          <p className="mt-1 truncate text-xl font-semibold text-teal-100">{draftChord.label}</p>
        </div>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center"
          onClick={requestClose}
          aria-label={text.close}
          title={text.close}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      {candidates.length > 0 ? (
        <div className="mt-4">
          <CandidateGroup
            title={text.detectionCandidates}
            candidates={candidates}
            indexes={candidates.flatMap((candidate, index) => (
              candidate.primarySource === "analyzer" ? [index] : []
            ))}
            draftChord={draftChord}
            language={language}
            onChoose={chooseCandidate}
          />
          <CandidateGroup
            title={text.repairSuggestions}
            candidates={candidates}
            indexes={candidates.flatMap((candidate, index) => (
              candidate.primarySource !== "analyzer" ? [index] : []
            ))}
            draftChord={draftChord}
            language={language}
            onChoose={chooseCandidate}
          />
          {!candidates.some((candidate) => candidate.sources.includes("authorReferenceFit")) ? (
            <p className="mt-2 text-xs leading-5 text-[var(--lv-text-muted)]" data-style-candidate-unavailable>
              {text.styleUnavailable}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)]"
          onClick={() => shiftRoot(-1)}
          aria-label={text.previousRoot}
          title={text.previousRoot}
        >
          <ArrowLeft aria-hidden="true" size={16} />
        </button>
        <p className="text-center text-sm font-semibold">{draftChord.label}</p>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)]"
          onClick={() => shiftRoot(1)}
          aria-label={text.nextRoot}
          title={text.nextRoot}
        >
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </div>

      <ChordStructureEditor
        chord={draftChord}
        language={language}
        onChange={(chord) => {
          setDraftChord(chord);
          setSource("structure-editor");
          setSelectedCandidate(undefined);
        }}
      />

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--lv-border)] pt-4">
        <button
          type="button"
          className="lv-button-secondary inline-flex items-center gap-2 px-3 py-2 text-sm"
          onClick={() => onPreview(draftChord)}
        >
          <Play aria-hidden="true" size={16} />
          {text.preview}
        </button>
        <button
          type="button"
          className="lv-button-primary px-3 py-2 text-sm font-semibold"
          onClick={applyAndClose}
        >
          {text.apply}
        </button>
        <button
          type="button"
          className="px-2 py-2 text-sm text-[var(--lv-text-secondary)]"
          onClick={() => {
            onReset();
            onClose();
          }}
        >
          {resetLabel ?? text.reset}
        </button>
        <button
          type="button"
          className="ml-auto px-2 py-2 text-sm text-[var(--lv-text-secondary)]"
          onClick={() => {
            onOpenInspector();
            onClose();
          }}
        >
          {text.detail}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {closeConfirmationOpen ? (
        <Modal
          ariaLabel={text.unsavedTitle}
          onClose={() => setCloseConfirmationOpen(false)}
          panelClassName="w-full max-w-md p-5"
          layerClassName="z-[70]"
        >
          <h2 className="text-xl font-semibold">{text.unsavedTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--lv-text-secondary)]">
            {text.unsavedDescription}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="px-3 py-2 text-sm text-red-200"
              onClick={() => {
                setCloseConfirmationOpen(false);
                onClose();
              }}
            >
              {text.discardAndClose}
            </button>
            <button
              type="button"
              className="lv-button-secondary px-3 py-2 text-sm"
              onClick={() => setCloseConfirmationOpen(false)}
            >
              {text.continueEditing}
            </button>
            <button
              type="button"
              className="lv-button-primary px-3 py-2 text-sm font-semibold"
              onClick={applyAndClose}
            >
              {text.applyAndClose}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function CandidateGroup({
  title,
  candidates,
  indexes,
  draftChord,
  language,
  onChoose,
}: {
  title: string;
  candidates: readonly QuickChordCandidate[];
  indexes: readonly number[];
  draftChord: ChordSymbol;
  language: AppLanguage;
  onChoose: (candidate: QuickChordCandidate) => void;
}) {
  if (indexes.length === 0) return null;
  const text = quickChordEditorCopy[language];
  return (
    <div className="mt-3">
      <p className="text-xs text-[var(--lv-text-muted)]">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {indexes.map((index) => {
          const candidate = candidates[index]!;
          const descriptions = candidate.sources.map((source) => sourceDescription(source, text));
          return (
            <button
              key={`${candidate.normalizedKey}-${index}`}
              type="button"
              data-quick-candidate
              data-candidate-source={candidate.primarySource}
              data-candidate-sources={candidate.sources.join(",")}
              className={`border px-2 py-2 text-left text-sm ${draftChord.label === candidate.chord.label ? "border-teal-300 bg-teal-300/10" : "border-[var(--lv-border-strong)]"}`}
              onClick={() => onChoose(candidate)}
              title={descriptions.join(" / ")}
            >
              <span className="mr-1 text-[var(--lv-text-muted)]">{index + 1}</span>
              {candidate.chord.label}
              <span className="ml-2 text-[10px] text-teal-200">
                {candidate.sources.map((source) => sourceLabel(source, text)).join("+")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function sourceLabel(
  source: QuickChordCandidate["primarySource"],
  text: typeof quickChordEditorCopy[AppLanguage],
): string {
  if (source === "smoothConnection") return text.smoothSource;
  if (source === "authorReferenceFit") return text.styleSource;
  if (source === "harmonicContext") return text.contextSource;
  return text.analyzerSource;
}

function sourceDescription(
  source: QuickChordCandidate["primarySource"],
  text: typeof quickChordEditorCopy[AppLanguage],
): string {
  if (source === "smoothConnection") return text.smoothDescription;
  if (source === "authorReferenceFit") return text.styleDescription;
  if (source === "harmonicContext") return text.contextDescription;
  return text.analyzerDescription;
}

function cloneChord(chord: ChordSymbol): ChordSymbol {
  return { ...chord, tensions: [...chord.tensions] };
}

function isTextControl(target: EventTarget): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement;
}

function trapFocus(
  event: ReactKeyboardEvent<HTMLDivElement>,
  panel: HTMLDivElement | null,
) {
  if (!panel) return;
  const controls = [...panel.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  )];
  if (controls.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
  const nextIndex = event.shiftKey
    ? (activeIndex <= 0 ? controls.length - 1 : activeIndex - 1)
    : (activeIndex < 0 || activeIndex === controls.length - 1 ? 0 : activeIndex + 1);
  event.preventDefault();
  controls[nextIndex]?.focus();
}
