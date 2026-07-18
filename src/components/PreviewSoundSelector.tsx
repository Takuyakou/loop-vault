import type { PreviewSound } from "../audio/chordPreview";
import type { AppCopy } from "../i18n";

export function PreviewSoundSelector({
  value,
  onChange,
  copy,
}: {
  value: PreviewSound;
  onChange: (sound: PreviewSound) => void;
  copy: AppCopy;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={copy.capture.previewSound}>
      <span className="mr-2 text-xs font-semibold text-[var(--lv-text-muted)]">
        {copy.capture.previewSound}
      </span>
      {(["piano", "electric-piano"] as const).map((sound) => (
        <button
          key={sound}
          type="button"
          className={`min-h-9 rounded px-3 text-sm ${value === sound ? "bg-[var(--lv-accent)] font-semibold text-stone-950" : "border border-[var(--lv-border-strong)] text-[var(--lv-text-secondary)]"}`}
          aria-pressed={value === sound}
          onClick={() => onChange(sound)}
        >
          {sound === "piano" ? copy.capture.piano : copy.capture.electricPiano}
        </button>
      ))}
    </div>
  );
}
