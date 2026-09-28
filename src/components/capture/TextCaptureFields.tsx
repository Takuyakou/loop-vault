import { displayKey } from "../../domain/displayLabels";

/**
 * P8.9-09b: the fields both text readers (通常 and 拡張) share, so they look and behave
 * the same. A field a reader cannot use is shown disabled with the reason as its tooltip.
 */

export const TEXT_CAPTURE_DEFAULT_NAME = "テキスト進行";

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
  .flatMap((root) => [`${root} major`, `${root} minor`]);

/** Values stay "C major" (the parser's form); labels are Japanese. */
export function TextKeySelect({ testId, value, suggestions = [], disabled, onChange }: {
  readonly testId: string;
  readonly value: string | undefined;
  /** Keys inferred from the text: listed first, never applied until chosen. */
  readonly suggestions?: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (key: string | undefined) => void;
}) {
  const option = (key: string) => <option key={key} value={key}>{displayKey(key) ?? key}</option>;
  return (
    <label className="lv-text-toolbar-key text-xs">{"キー"}
      <select data-testid={testId} className="lv-field-control min-h-9 w-32 px-1 text-xs"
        value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">{"未確定"}</option>
        {suggestions.length ? <optgroup label={"推定"}>{suggestions.map(option)}</optgroup> : null}
        {suggestions.length ? <optgroup label={"すべて"}>{KEYS.map(option)}</optgroup> : KEYS.map(option)}
      </select>
    </label>
  );
}

export function TextMeterSelect({ testId, value, options, disabled, reason, onChange }: {
  readonly testId: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly disabled: boolean;
  /** Why the meter cannot be changed; shown as the tooltip. */
  readonly reason?: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="lv-text-toolbar-meter text-xs" title={reason}>{"拍子"}
      <select data-testid={testId} className="lv-field-control min-h-9 px-2" value={value} disabled={disabled}
        title={reason} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

/** 「Vaultに保存」 with the same disabled look and reason in both readers. */
export function TextSaveControls({ nameTestId, saveTestId, reasonId, name, blockedReason, disabled, onName, onSave }: {
  readonly nameTestId: string;
  readonly saveTestId: string;
  readonly reasonId: string;
  readonly name: string;
  /** Set when saving is not possible yet (empty or invalid input, empty name). */
  readonly blockedReason?: string;
  readonly disabled: boolean;
  readonly onName: (value: string) => void;
  readonly onSave: () => void;
}) {
  return (
    <div className="lv-text-toolbar-save flex shrink-0 items-center gap-1.5">
      <label className="text-xs">{"名前"}
        <input className="lv-field-control ml-1 min-h-9 w-24 px-2" maxLength={80} data-testid={nameTestId}
          value={name} onChange={(event) => onName(event.target.value)} />
      </label>
      <button type="button" className="lv-button-primary min-h-9 whitespace-nowrap px-2 text-xs" data-testid={saveTestId}
        disabled={disabled || blockedReason !== undefined} title={blockedReason}
        aria-describedby={blockedReason !== undefined ? reasonId : undefined} onClick={onSave}>
        {"Vaultに保存"}
      </button>
      {blockedReason !== undefined ? <span tabIndex={0} role="note" aria-describedby={reasonId} title={blockedReason}
        className="cursor-help text-xs text-[var(--lv-text-secondary)]" data-testid="text-save-blocked-hint">ⓘ</span> : null}
    </div>
  );
}

/** Save blocked reason shared by both readers. */
export function textSaveBlockedReason(canSave: boolean, saveReason: string, name: string): string | undefined {
  if (!canSave) return saveReason;
  if (!name.trim()) return "名前を入れると保存できます";
  return undefined;
}
