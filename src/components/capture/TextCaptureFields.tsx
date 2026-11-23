import { Fragment, useEffect, useRef, useState } from "react";
/**
 * P8.9-09b: the fields both text readers (通常 and 拡張) share, so they look and behave
 * the same. A field a reader cannot use is shown disabled with the reason as its tooltip.
 */

export const TEXT_CAPTURE_DEFAULT_NAME = "テキスト進行";

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
  .flatMap((root) => [`${root} major`, `${root} minor`]);

/**
 * P24-07-fix-1 item 3: the visible key name uses the accidental symbols and one half-width space
 * (`E♭ メジャー`). The value itself stays "Eb major".
 */
export function formatTextKeyLabel(key: string): string {
  const match = /^([A-G])([#b])?\s*(major|minor)$/i.exec(key.trim());
  if (match === null) return key;
  const accidental = match[2] === "b" ? "♭" : match[2] === "#" ? "♯" : "";
  return `${match[1]}${accidental} ${match[3]!.toLowerCase() === "minor" ? "マイナー" : "メジャー"}`;
}

/** Values stay "C major" (the parser's form); labels are Japanese. */
export function TextKeySelect({ testId, value, suggestions = [], disabled, allowAuto = false, autoLabel, onChange }: {
  readonly testId: string;
  readonly value: string | undefined;
  /** Keys inferred from the text: listed first, never applied until chosen. */
  readonly suggestions?: readonly string[];
  readonly disabled: boolean;
  /** P23-33: the 「自動」and「未設定」choices above the key list (the automatic key is the default). */
  readonly allowAuto?: boolean;
  /** The automatic state's own label (`自動: Cメジャー` / `自動: 未確定`), display only. */
  readonly autoLabel?: string;
  readonly onChange: (key: string | undefined) => void;
}) {
  const options: SettingOption[] = [
    ...(allowAuto ? [{ value: "auto", label: autoLabel ?? "自動" }] : [{ value: "", label: "未確定" }]),
    ...(allowAuto ? [{ value: "unset", label: "未設定" }] : []),
    ...suggestions.map(key => ({ value: key, label: formatTextKeyLabel(key), group: "推定" })),
    ...KEYS.map(key => ({ value: key, label: formatTextKeyLabel(key), group: suggestions.length ? "すべて" : undefined })),
  ];
  const shown = value === "auto" ? (autoLabel ?? "自動")
    : value === "unset" ? "未設定"
      : value === undefined || value === "" ? "未確定"
        : formatTextKeyLabel(value);
  return <TextSettingMenu testId={testId} name="キー" valueLabel={shown} value={value ?? ""} options={options}
    disabled={disabled} onChange={(next) => onChange(next || undefined)} />;
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
  return <TextSettingMenu testId={testId} name="拍子" valueLabel={value} value={value}
    options={options.map(option => ({ value: option, label: option }))}
    disabled={disabled} title={reason} onChange={onChange} />;
}

interface SettingOption {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}

/**
 * P24-07 item 1: the band's meter/key pickers are a button (name, value, arrow) and a small window
 * below it — the design's `Main.dc.html`. The old native select is gone; the name and the options stay
 * the same (Enter/Space opens, arrows move, Enter picks, Esc closes, an outside press closes).
 */
export function TextSettingMenu({ testId, name, value, valueLabel, options, disabled, title, onChange }: {
  readonly testId: string;
  readonly name: string;
  readonly value?: string;
  readonly valueLabel: string;
  readonly options: readonly SettingOption[];
  readonly disabled: boolean;
  readonly title?: string;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = `${testId}-list`;
  const optionId = (index: number) => `${testId}-option-${index}`;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    const index = options.findIndex(option => option.value === value);
    setActive(index < 0 ? 0 : index);
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (option === undefined) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(options.length - 1, current + 1)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
  }

  return (
    <div ref={rootRef} style={{ position: "relative", flex: "none" }}>
      <button ref={buttonRef} type="button" data-testid={testId} data-value={value}
        className="lv-text-setting-button" aria-label={name}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        disabled={disabled} title={title} onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}>
        <span className="lv-text-setting-name">{name}</span>
        <span className="lv-text-setting-value" data-testid={`${testId}-value`}>{valueLabel}</span>
        <span className="lv-text-setting-arrow" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div id={listId} data-testid={listId} role="listbox" aria-label={name} className="lv-text-setting-menu"
          aria-activedescendant={optionId(active)}>
          {options.map((option, index) => (
            <Fragment key={`${option.value}-${index}`}>
              {option.group !== undefined && option.group !== options[index - 1]?.group ? (
                <div role="presentation" className="lv-text-setting-group">{option.group}</div>
              ) : null}
              <div role="option" id={optionId(index)}
                data-value={option.value} aria-selected={index === active}
                className="lv-text-setting-option"
                onClick={() => choose(index)}
                onMouseEnter={() => setActive(index)}>
                {option.label}
              </div>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
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
