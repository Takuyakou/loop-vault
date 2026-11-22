
export type CaptureInputMode = "midi" | "text";

interface CaptureInputModeSelectorProps {
  readonly value: CaptureInputMode;
  readonly disabled?: boolean;
  readonly onChange: (value: CaptureInputMode) => void;
}

/**
 * A compact pressed-button group; no incomplete tab keyboard contract.
 * P23-11: each side has a small picture, and one surface slides under the chosen side.
 */
export function CaptureInputModeSelector({
  value,
  disabled = false,
  onChange,
}: CaptureInputModeSelectorProps) {
  return (
    <div
      className="lv-capture-mode"
      role="group"
      aria-label="入力方法"
      data-testid="capture-input-mode"
      data-value={value}
    >
      <span className="lv-capture-mode-thumb" aria-hidden="true" />
      <button
        type="button"
        className="lv-capture-mode-button"
        aria-pressed={value === "midi"}
        disabled={disabled}
        onClick={() => onChange("midi")}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 4v10" />
          <path d="M8 10l4 4 4-4" />
          <path d="M5 17v2h14v-2" />
        </svg>
        MIDI
      </button>
      <button
        type="button"
        className="lv-capture-mode-button"
        aria-pressed={value === "text"}
        disabled={disabled}
        onClick={() => onChange("text")}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M5 7h14M5 12h14M5 17h9" />
        </svg>
        テキスト
      </button>
    </div>
  );
}
