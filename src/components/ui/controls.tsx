// P8.9 shared controls. Styles: src/styles/components.css.
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDownIcon } from "../icons";

/** Hover / keyboard-focus tooltip (0.12 s). The child is described by the tip. */
export function Tooltip({ content, children }: { content: string; children: ReactElement<{ "aria-describedby"?: string }> }) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children, { "aria-describedby": id }) : children;
  return (
    <span className="lv-tooltip-anchor">
      {child}
      <span id={id} role="tooltip" className="lv-tooltip">{content}</span>
    </span>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Single-choice radio group; ←→ (and ↑↓, Home, End) move and select. */
export function SegmentedControl<T extends string>({ className = "", label, onChange, options, value }: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | undefined>();
  const enabled = options.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0);

  const measure = useCallback(() => {
    const idx = options.findIndex((option) => option.value === value);
    const active = idx >= 0 ? refs.current[idx] : null;
    if (!active) { setPill(undefined); return; }
    const left = active.offsetLeft;
    const width = active.offsetWidth;
    setPill((prev) => (prev && prev.left === left && prev.width === width ? prev : { left, width }));
  }, [options, value]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(group);
    return () => observer.disconnect();
  }, [measure]);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const position = enabled.indexOf(index);
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = enabled[(position + 1) % enabled.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = enabled[(position - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  const pillStyle: CSSProperties | undefined = pill && pill.width > 0
    ? { width: `${pill.width}px`, transform: `translateX(${pill.left}px)` }
    : undefined;

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} className={`lv-segmented ${className}`} data-has-pill={pillStyle ? "true" : undefined}>
      {pillStyle ? <span aria-hidden="true" data-segment-pill className="lv-segment-pill" style={pillStyle} /> : null}
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => { refs.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled}
            title={option.title}
            data-value={option.value}
            className="lv-segment"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

/** Native <select> with the P8.9 look (keyboard and screen-reader behavior stay native). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", wrapperClassName = "", children, ...props },
  ref,
) {
  return (
    <span className={`lv-select ${wrapperClassName}`}>
      <select ref={ref} {...props} className={className}>{children}</select>
      <ChevronDownIcon size={14} />
    </span>
  );
});

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggle chips set this; it maps to aria-pressed and the teal selected look. */
  selected?: boolean;
}

/** Tag / filter chip. Selected chips are teal. */
export function Chip({ className = "", selected, type = "button", ...props }: ChipProps) {
  return <button {...props} type={type} aria-pressed={selected} className={`lv-chip ${className}`} />;
}

export interface ProgressBarProps {
  label: string;
  value: number;
  max?: number;
  /** `accent` for progress, `record` (logo yellow) for practice records. */
  tone?: "accent" | "record";
  className?: string;
}

export function ProgressBar({ className = "", label, max = 100, tone = "accent", value }: ProgressBarProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const percent = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      data-tone={tone}
      className={`lv-progress ${className}`}
    >
      <div className="lv-progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

export interface PopoverProps {
  /** Renders the trigger; spread the given props onto a button. */
  trigger: (props: { "aria-expanded": boolean; "aria-controls": string; onClick: () => void }) => ReactNode;
  children: ReactNode;
  label: string;
  className?: string;
  defaultOpen?: boolean;
}

/** One button opens a small panel (e.g. volume). Esc or an outside click closes it and focus returns to the trigger. */
export function Popover({ children, className = "", defaultOpen = false, label, trigger }: PopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
    anchorRef.current?.querySelector<HTMLElement>("[aria-controls]")?.focus();
  }

  return (
    <span ref={anchorRef} className="lv-popover-anchor" onKeyDown={onKeyDown}>
      {trigger({ "aria-expanded": open, "aria-controls": id, onClick: () => setOpen((current) => !current) })}
      {open ? (
        <div id={id} role="dialog" aria-label={label} className={`lv-popover ${className}`}>
          {children}
        </div>
      ) : null}
    </span>
  );
}

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "aria-checked"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name. Use `aria-labelledby` instead when a visible label sits beside the switch. */
  label?: string;
}

/** On / off switch (role="switch"). Space and Enter toggle it, as on any button. */
export function Switch({ checked, onChange, label, className = "", type = "button", onClick, ...props }: SwitchProps) {
  return (
    <button
      {...props}
      type={type}
      role="switch"
      aria-checked={checked}
      aria-label={label ?? props["aria-label"]}
      className={`lv-switch ${className}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onChange(!checked);
      }}
    />
  );
}

/** A key cap, e.g. <Kbd>Ctrl K</Kbd>. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`lv-kbd ${className}`}>{children}</kbd>;
}

/** The one "this is sounding now" mark: three bars. Decorative; the caller supplies the text. */
export function PlayingMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`lv-playing-mark ${className}`} data-testid="playing-mark">
      <i /><i /><i />
    </span>
  );
}
