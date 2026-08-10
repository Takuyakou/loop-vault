import type { AppLanguage } from "../../i18n";

export type CaptureInputMode = "midi" | "text";

interface CaptureInputModeSelectorProps {
  readonly value: CaptureInputMode;
  readonly language: AppLanguage;
  readonly disabled?: boolean;
  readonly onChange: (value: CaptureInputMode) => void;
}

/** A compact pressed-button group; no incomplete tab keyboard contract. */
export function CaptureInputModeSelector({
  value,
  language,
  disabled = false,
  onChange,
}: CaptureInputModeSelectorProps) {
  const label = language === "ja" ? "\u5165\u529b\u65b9\u6cd5" : "Capture input";
  const buttonClass = (mode: CaptureInputMode) => `min-h-10 border px-4 text-sm ${value === mode
    ? "border-[var(--lv-accent)] bg-teal-950/40 text-[var(--lv-accent)]"
    : "border-[var(--lv-border)] text-[var(--lv-text)]"}`;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label} data-testid="capture-input-mode">
      <button
        type="button"
        className={buttonClass("midi")}
        aria-pressed={value === "midi"}
        disabled={disabled}
        onClick={() => onChange("midi")}
      >
        MIDI
      </button>
      <button
        type="button"
        className={buttonClass("text")}
        aria-pressed={value === "text"}
        disabled={disabled}
        onClick={() => onChange("text")}
      >
        {language === "ja" ? "\u30c6\u30ad\u30b9\u30c8" : "Text"}
      </button>
    </div>
  );
}