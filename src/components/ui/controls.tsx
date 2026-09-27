// P8.9 shared controls. Styles: src/styles/components.css.
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0);

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

  return (
    <div role="radiogroup" aria-label={label} className={`lv-segmented ${className}`}>
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
export function Select({ className = "", wrapperClassName = "", children, ...props }: SelectProps) {
  return (
    <span className={`lv-select ${wrapperClassName}`}>
      <select {...props} className={className}>{children}</select>
      <ChevronDownIcon size={14} />
    </span>
  );
}

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
}

/** One button opens a small panel (e.g. volume). Esc or an outside click closes it and focus returns to the trigger. */
export function Popover({ children, className = "", label, trigger }: PopoverProps) {
  const [open, setOpen] = useState(false);
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
