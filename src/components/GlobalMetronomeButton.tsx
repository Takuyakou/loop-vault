import { useMetronome } from "./MetronomeProvider";

export function GlobalMetronomeButton() {
  const { enabled, toggle } = useMetronome();
  const label = "メトロノーム：" + (enabled ? "ON" : "OFF");
  return <button type="button" onClick={toggle} title={label} aria-label={label}
    aria-pressed={enabled} data-testid="global-metronome"
    className={"lv-global-metronome inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] "
      + (enabled ? "lv-global-metronome-on" : "lv-global-metronome-off")}>
    <span className="lv-metronome-icon" aria-hidden="true" /><span>メトロノーム</span>
  </button>;
}
