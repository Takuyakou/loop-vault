import { Volume2, VolumeX } from "lucide-react";

export function MasterVolumeKnob({ value, onChange, label }: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const normalized = Math.min(100, Math.max(0, Math.round(value)));
  const angle = -135 + normalized * 2.7;
  const valueLabel = `${label}: ${normalized}%`;

  return (
    <label
      className="relative grid h-9 w-9 shrink-0 cursor-ew-resize place-items-center rounded-full focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--lv-accent)]"
      title={valueLabel}
    >
      <span
        aria-hidden="true"
        className="relative grid h-8 w-8 place-items-center rounded-full border border-[var(--lv-border-strong)] bg-[var(--lv-surface-raised)] text-[var(--lv-text-secondary)] shadow-inner"
        data-volume-knob="true"
      >
        <span
          className="absolute inset-[3px]"
          data-volume-indicator="true"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span className="mx-auto block h-1.5 w-0.5 rounded-full bg-[var(--lv-accent)]" />
        </span>
        {normalized === 0
          ? <VolumeX size={16} strokeWidth={1.8} />
          : <Volume2 size={16} strokeWidth={1.8} />}
      </span>
      <input
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        type="range"
        min="0"
        max="100"
        step="1"
        value={normalized}
        aria-label={label}
        aria-valuetext={`${normalized}%`}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
