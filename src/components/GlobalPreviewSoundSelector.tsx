import { Piano } from "lucide-react";
import type { AppCopy } from "../i18n";
import { usePreviewSound } from "./PreviewSoundProvider";

export function GlobalPreviewSoundSelector({ copy }: { copy: AppCopy }) {
  const { sound, setSound } = usePreviewSound();
  const currentLabel = sound === "piano"
    ? copy.capture.piano
    : copy.capture.electricPiano;
  const accessibleLabel = `${copy.capture.previewSound}: ${currentLabel}`;

  return (
    <label
      className="inline-flex h-9 shrink-0 items-center gap-1 border-r border-[var(--lv-border)] pr-2 text-[var(--lv-text-secondary)]"
      title={accessibleLabel}
    >
      <Piano aria-hidden="true" size={16} />
      <span className="sr-only">{copy.capture.previewSound}</span>
      <select
        className="h-8 min-w-16 bg-transparent px-1 text-xs text-[var(--lv-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--lv-accent)]"
        aria-label={copy.capture.previewSound}
        value={sound}
        onChange={(event) => setSound(event.target.value as typeof sound)}
      >
        <option value="piano">{copy.capture.piano}</option>
        <option value="electric-piano">{copy.capture.electricPiano}</option>
      </select>
    </label>
  );
}
