import { useEffect, useId, useRef, useState } from "react";

const options = [{ value: "teacher", label: "基本" }, { value: "core", label: "骨組み" }] as const;
export function GeneratedTypeSelector({ value, disabled, onChange, onOpen }: {
  value: "teacher" | "core" | "advanced";
  disabled: boolean;
  onChange: (value: "teacher" | "core") => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const label = options.find(option => option.value === value)?.label ?? "詳細の形";
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    items.current[value === "core" ? 1 : 0]?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, value]);
  return <div ref={root} className="relative shrink-0">
    <button ref={trigger} type="button" role="combobox" aria-label="生成タイプ" aria-expanded={open}
      aria-haspopup="listbox" aria-controls={open ? id : undefined} disabled={disabled} value={value}
      className="lv-field-control flex min-h-9 w-20 items-center justify-between px-2 text-xs disabled:opacity-50"
      onClick={() => { if (open) close(); else { onOpen(); setOpen(true); } }}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); event.stopPropagation();
          if (!open) { onOpen(); setOpen(true); }
          else items.current[event.key === "ArrowDown" ? 0 : 1]?.focus();
        }
      }}>
      <span>{label}</span><span aria-hidden="true">▾</span>
    </button>
    {open ? <div id={id} role="listbox" aria-label="生成タイプ候補"
      className="absolute left-0 top-full z-50 mt-1 min-w-24 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-1 shadow-xl"
      onBlur={event => { if (!root.current?.contains(event.relatedTarget)) close(); }}
      onKeyDown={event => {
        const index = items.current.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + 2) % 2;
          items.current[next]?.focus();
        }
      }}>
      {options.map((option, index) => <button type="button" role="option" key={option.value}
        ref={node => { items.current[index] = node; }} aria-selected={value === option.value}
        className="block min-h-9 w-full rounded px-2 text-left text-xs hover:bg-[var(--lv-accent-soft)] focus:bg-[var(--lv-accent-soft)]"
        onClick={() => { close(true); onChange(option.value); }}>{option.label}</button>)}
    </div> : null}
  </div>;
}
