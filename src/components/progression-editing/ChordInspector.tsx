import type { EditableChordSlot } from "../../domain/progressionEditing";
import type { AppLanguage } from "../../i18n";

interface ChordInspectorProps {
  slot?: EditableChordSlot;
  language: AppLanguage;
}

export function ChordInspector({ slot, language }: ChordInspectorProps) {
  if (!slot) {
    return (
      <aside className="border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4">
        <p className="text-sm text-[var(--lv-text-muted)]">
          {language === "ja" ? "コードを選択してください" : "Select a chord"}
        </p>
      </aside>
    );
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
        />
        <InspectorValue
          label={language === "ja" ? "現在のコード" : "Current chord"}
          value={slot.currentChord.label}
          emphasized
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
    </aside>
  );
}

function InspectorValue({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--lv-text-muted)]">{label}</dt>
      <dd className={`mt-1 ${emphasized ? "text-lg font-semibold text-teal-100" : "text-sm text-[var(--lv-text)]"}`}>
        {value}
      </dd>
    </div>
  );
}
