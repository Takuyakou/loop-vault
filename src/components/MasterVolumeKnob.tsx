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
      className="group relative h-9 w-9 shrink-0 cursor-pointer bg-transparent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--lv-accent)]"
      title={valueLabel}
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-[3px] h-[25px] w-[25px] -translate-x-1/2 rounded-full border border-[#aab2ba] bg-[#171d23] shadow-[inset_0_0_0_2px_#0b0f13,0_1px_2px_#000] transition-colors group-hover:border-white"
        data-volume-knob="true"
      >
        <span
          className="absolute inset-[2px]"
          data-volume-indicator="true"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span className="mx-auto mt-px block h-[7px] w-[2px] rounded-full bg-white shadow-[0_0_2px_#fff]" />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="absolute bottom-[3px] left-[5px] h-px w-2 bg-[var(--lv-border-strong)] group-hover:bg-[var(--lv-text-secondary)]"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 right-0 h-[7px] w-[7px] bg-[var(--lv-accent)] [clip-path:polygon(100%_0,100%_100%,0_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--lv-border-strong)] bg-[var(--lv-surface-raised)] px-2 py-1 text-[11px] font-medium text-[var(--lv-text)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        data-volume-tooltip="true"
      >
        {valueLabel}
      </span>
      <input
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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
