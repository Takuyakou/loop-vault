import { useEffect, useState } from "react";
import { parseChordLabel } from "../../domain/chords";
import type {
  EditableChordSlot,
  ProgressionEditSource,
} from "../../domain/progressionEditing";
import type { ChordSymbol } from "../../domain/types";
import type { AppLanguage } from "../../i18n";
import { ChordAlternativeList } from "./ChordAlternativeList";
import { ChordStructureEditor } from "./ChordStructureEditor";

interface ChordInspectorProps {
  slot?: EditableChordSlot;
  language: AppLanguage;
  onPreview: (chord: ChordSymbol) => void;
  onApply: (
    chord: ChordSymbol,
    source: Extract<ProgressionEditSource, "manual-label" | "alternative" | "structure-editor">,
  ) => void;
  onReset: () => void;
}

export function ChordInspector({
  slot,
  language,
  onPreview,
  onApply,
  onReset,
}: ChordInspectorProps) {
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
          {language === "ja" ? "コードを選択してください" : "Select a chord"}
        </p>
      </aside>
    );
  }

  function updateLabel(label: string) {
    setDraftLabel(label);
    setDraftSource("manual-label");
    const parsed = parseChordLabel(label.trim());
    setDraftChord(parsed ?? undefined);
    setError(parsed || label.trim().length === 0
      ? undefined
      : language === "ja"
        ? "コード名を認識できません。例: Cmaj7, F#m9, G13/B"
        : "Chord name was not recognized. Try Cmaj7, F#m9, or G13/B.");
  }

  function selectAlternative(chord: ChordSymbol) {
    setDraftLabel(chord.label);
    setDraftChord(chord);
    setDraftSource("alternative");
    setError(undefined);
    onPreview(chord);
  }

  return (
    <aside className="h-fit border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 xl:sticky xl:top-4">
      <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
        {language === "ja" ? "選択中のコード" : "Selected chord"}
      </p>
      <p className="mt-2 text-sm text-[var(--lv-text-secondary)]">
        {language === "ja" ? `${slot.position.bar}小節 ${slot.position.beat}拍` : `Bar ${slot.position.bar}, beat ${slot.position.beat}`}
      </p>
      <dl className="mt-4 grid gap-3">
        <InspectorValue
          label={language === "ja" ? "元の検出値" : "Original detection"}
          value={slot.originalChord.label}
          actionLabel={language === "ja" ? "元の検出値を試聴" : "Preview original"}
          onAction={() => onPreview(slot.originalChord)}
        />
        <InspectorValue
          label={language === "ja" ? "現在のコード" : "Current chord"}
          value={slot.currentChord.label}
          emphasized
          actionLabel={language === "ja" ? "現在のコードを試聴" : "Preview current"}
          onAction={() => onPreview(slot.currentChord)}
        />
        {slot.confidence !== undefined ? (
          <InspectorValue
            label={language === "ja" ? "信頼度" : "Confidence"}
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
          {language === "ja" ? "コード名を入力" : "Chord label"}
        </label>
        <input
          id={`chord-label-${slot.id}`}
          className="mt-2 w-full border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm outline-none focus:border-teal-300"
          value={draftLabel}
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
              setDraftChord(chord);
              setDraftLabel(chord.label);
              setDraftSource("structure-editor");
              setError(undefined);
            }}
          />
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="border border-[var(--lv-border-strong)] px-3 py-2 text-sm disabled:opacity-40"
            disabled={!draftChord}
            onClick={() => draftChord && onPreview(draftChord)}
          >
            {language === "ja" ? "試聴" : "Preview"}
          </button>
          <button
            type="button"
            className="bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
            disabled={!draftChord || draftChord.label === slot.currentChord.label}
            onClick={() => draftChord && onApply(draftChord, draftSource)}
          >
            {language === "ja" ? "適用" : "Apply"}
          </button>
          {slot.edited ? (
            <button
              type="button"
              className="px-2 py-2 text-sm text-[var(--lv-text-secondary)]"
              onClick={onReset}
            >
              {language === "ja" ? "元に戻す" : "Reset"}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function InspectorValue({
  label,
  value,
  emphasized = false,
  actionLabel,
  onAction,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--lv-text-muted)]">{label}</dt>
      <dd className="mt-1 flex items-center justify-between gap-2">
        <span className={emphasized ? "text-lg font-semibold text-teal-100" : "text-sm text-[var(--lv-text)]"}>
          {value}
        </span>
        {onAction ? (
          <button
            type="button"
            className="grid h-8 w-8 place-items-center border border-[var(--lv-border-strong)] text-xs"
            onClick={onAction}
            aria-label={actionLabel}
            title={actionLabel}
          >
            ▶
          </button>
        ) : null}
      </dd>
    </div>
  );
}
