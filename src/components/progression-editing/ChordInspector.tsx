import { useEffect, useState } from "react";
import { parseChordLabel } from "../../domain/chords";
import type {
  EditableChordSlot,
  ProgressionEditSource,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import type { PreviewSound } from "../../audio/chordPreview";
import {
  playbackController,
  type PlaybackController,
  type PlayingSource,
} from "../../audio/playbackController";
import { PlayToggle } from "../PlayToggle";
import { ChordAlternativeList } from "./ChordAlternativeList";
import { ChordStructureEditor } from "./ChordStructureEditor";

interface ChordInspectorProps {
  slot?: EditableChordSlot;
  language: AppLanguage;
  onPreview: (chord: ChordSymbol) => void;
  playbackSource?: PlayingSource;
  previewSound?: PreviewSound;
  stopLabel?: string;
  onPreviewError?: (error: unknown) => void;
  controller?: PlaybackController;
  onApply: (
    chord: ChordSymbol,
    source: Extract<ProgressionEditSource, "manual-label" | "alternative" | "structure-editor">,
  ) => void;
  onReset: () => void;
  canSplit?: boolean;
  canMergePrevious?: boolean;
  canMergeNext?: boolean;
  canDelete?: boolean;
  onSplit?: () => void;
  onMergePrevious?: () => void;
  onMergeNext?: () => void;
  onDelete?: () => void;
  onEditStart?: () => void;
}

export function ChordInspector({
  slot,
  language,
  onPreview,
  playbackSource,
  previewSound,
  stopLabel = language === "ja" ? "停止" : "Stop",
  onPreviewError,
  controller = playbackController,
  onApply,
  onReset,
  canSplit = false,
  canMergePrevious = false,
  canMergeNext = false,
  canDelete = false,
  onSplit,
  onMergePrevious,
  onMergeNext,
  onDelete,
  onEditStart,
}: ChordInspectorProps) {
  const text = progressionEditorCopy[language];
  const [draftLabel, setDraftLabel] = useState(slot?.currentChord.label ?? "");
  const [draftChord, setDraftChord] = useState<ChordSymbol | undefined>(slot?.currentChord);
  const [draftSource, setDraftSource] = useState<"manual-label" | "alternative" | "structure-editor">("manual-label");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraftLabel(slot?.currentChord.label ?? "");
    setDraftChord(slot?.currentChord);
    setDraftSource("manual-label");
    setError(undefined);
  }, [slot?.id, slot?.currentChord]);

  if (!slot) {
    return (
      <aside className="border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4">
        <p className="text-sm text-[var(--lv-text-muted)]">
          {text.selectPrompt}
        </p>
      </aside>
    );
  }

  const sourceBase = playbackSource ?? { kind: "capture", id: "chord-inspector" };

  function updateLabel(label: string) {
    onEditStart?.();
    setDraftLabel(label);
    setDraftSource("manual-label");
    const parsed = parseChordLabel(label.trim());
    setDraftChord(parsed ?? undefined);
    setError(parsed || label.trim().length === 0 ? undefined : text.invalidChord);
  }

  function selectAlternative(chord: ChordSymbol) {
    onEditStart?.();
    setDraftLabel(chord.label);
    setDraftChord(chord);
    setDraftSource("alternative");
    setError(undefined);
    onPreview(chord);
  }

  return (
    <aside className="h-fit border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 xl:sticky xl:top-4">
      <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
        {text.selectedChord}
      </p>
      <p className="mt-2 text-sm text-[var(--lv-text-secondary)]">
        {text.position(slot.position.bar, slot.position.beat)}
      </p>
      <dl className="mt-4 grid gap-3">
        <InspectorValue
          label={text.original}
          value={slot.originalChord.label}
          preview={{
            source: inspectorPlaybackSource(sourceBase, slot.id, "original"),
            chord: slot.originalChord,
            playLabel: text.previewOriginal,
            stopLabel,
            sound: previewSound,
            onError: onPreviewError,
            controller,
          }}
        />
        <InspectorValue
          label={text.current}
          value={slot.currentChord.label}
          emphasized
          preview={{
            source: inspectorPlaybackSource(sourceBase, slot.id, "current"),
            chord: slot.currentChord,
            playLabel: text.previewCurrent,
            stopLabel,
            sound: previewSound,
            onError: onPreviewError,
            controller,
          }}
        />
        {slot.confidence !== undefined ? (
          <InspectorValue
            label={text.confidence}
            value={`${Math.round(slot.confidence * 100)}%`}
          />
        ) : null}
      </dl>

      {slot.warnings.length > 0 ? (
        <div className="mt-4 border-l-2 border-amber-300 pl-3 text-xs text-amber-100">
          {slot.warnings.join(" / ")}
        </div>
      ) : null}

      <div className="mt-5 border-t border-[var(--lv-border)] pt-4">
        <ChordAlternativeList
          alternatives={slot.alternatives}
          selected={draftSource === "alternative" ? draftChord : undefined}
          onSelect={selectAlternative}
          language={language}
        />
        <label className="mt-4 block text-xs text-[var(--lv-text-muted)]" htmlFor={`chord-label-${slot.id}`}>
          {text.chordLabel}
        </label>
        <input
          id={`chord-label-${slot.id}`}
          className="mt-2 w-full border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm outline-none focus:border-teal-300"
          value={draftLabel}
          onFocus={onEditStart}
          onChange={(event) => updateLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draftChord) {
              onApply(draftChord, draftSource);
            }
            if (event.key === "Escape") {
              updateLabel(slot.currentChord.label);
            }
          }}
          aria-invalid={Boolean(error)}
        />
        {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
        {draftChord ? (
          <ChordStructureEditor
            chord={draftChord}
            language={language}
            onChange={(chord) => {
              onEditStart?.();
              setDraftChord(chord);
              setDraftLabel(chord.label);
              setDraftSource("structure-editor");
              setError(undefined);
            }}
          />
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {draftChord ? (
            <PlayToggle
              source={inspectorPlaybackSource(sourceBase, slot.id, "draft")}
              request={{ type: "chord", chord: draftChord, sound: previewSound }}
              playLabel={text.preview}
              stopLabel={stopLabel}
              className="inline-flex items-center gap-2 border border-[var(--lv-border-strong)] px-3 py-2 text-sm"
              onError={onPreviewError}
              controller={controller}
            />
          ) : (
            <button
              type="button"
              className="border border-[var(--lv-border-strong)] px-3 py-2 text-sm opacity-40"
              disabled
            >
              {text.preview}
            </button>
          )}
          <button
            type="button"
            className="bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
            disabled={!draftChord || draftChord.label === slot.currentChord.label}
            onClick={() => draftChord && onApply(draftChord, draftSource)}
          >
            {text.apply}
          </button>
          {slot.edited ? (
            <button
              type="button"
              className="px-2 py-2 text-sm text-[var(--lv-text-secondary)]"
              onClick={onReset}
            >
              {text.reset}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-5 border-t border-[var(--lv-border)] pt-4">
        <p className="text-xs text-[var(--lv-text-muted)]">
          {text.timing}
        </p>
        <div className="mt-2 grid gap-2">
          <button type="button" className="border border-[var(--lv-border-strong)] px-3 py-2 text-left text-sm disabled:opacity-40" disabled={!canSplit} onClick={onSplit}>
            {text.split}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="border border-[var(--lv-border-strong)] px-2 py-2 text-sm disabled:opacity-40" disabled={!canMergePrevious} onClick={onMergePrevious}>
              {text.mergePrevious}
            </button>
            <button type="button" className="border border-[var(--lv-border-strong)] px-2 py-2 text-sm disabled:opacity-40" disabled={!canMergeNext} onClick={onMergeNext}>
              {text.mergeNext}
            </button>
          </div>
          <button type="button" className="px-3 py-2 text-left text-sm text-red-200 disabled:opacity-40" disabled={!canDelete} onClick={onDelete}>
            {text.deleteChord}
          </button>
        </div>
      </div>
    </aside>
  );
}

function InspectorValue({
  label,
  value,
  emphasized = false,
  preview,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  preview?: InspectorPreview;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--lv-text-muted)]">{label}</dt>
      <dd className="mt-1 flex items-center justify-between gap-2">
        <span className={emphasized ? "text-lg font-semibold text-teal-100" : "text-sm text-[var(--lv-text)]"}>
          {value}
        </span>
        {preview ? (
          <PlayToggle
            source={preview.source}
            request={{ type: "chord", chord: preview.chord, sound: preview.sound }}
            playLabel={preview.playLabel}
            stopLabel={preview.stopLabel}
            className="grid h-8 w-8 place-items-center border border-[var(--lv-border-strong)] text-xs"
            showLabel={false}
            onError={preview.onError}
            controller={preview.controller}
          />
        ) : null}
      </dd>
    </div>
  );
}

interface InspectorPreview {
  source: PlayingSource;
  chord: ChordSymbol;
  playLabel: string;
  stopLabel: string;
  sound?: PreviewSound;
  onError?: (error: unknown) => void;
  controller: PlaybackController;
}

export function inspectorPlaybackSource(
  base: PlayingSource,
  slotId: string,
  control: "original" | "current" | "draft",
): PlayingSource {
  return {
    kind: base.kind,
    id: `${base.id}:inspector:${slotId}:${control}`,
  };
}
