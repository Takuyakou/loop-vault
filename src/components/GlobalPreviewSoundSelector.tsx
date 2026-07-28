import { Piano } from "lucide-react";
import type { AppCopy } from "../i18n";
import { usePreviewSound } from "./PreviewSoundProvider";

export function GlobalPreviewSoundSelector({ copy }: { copy: AppCopy }) {
  const { sound, setSound } = usePreviewSound();
  const sounds = [
    { value: "piano", label: copy.capture.piano },
    { value: "electric-piano", label: copy.capture.electricPiano },
  ] as const;

  return (
    <div
      className="inline-flex h-9 shrink-0 items-center gap-1.5 border-r border-[var(--lv-border)] pr-2 text-[var(--lv-text-secondary)]"
      role="group"
      aria-label={copy.capture.previewSound}
    >
      <Piano aria-hidden="true" size={16} />
      <div className="inline-flex rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] p-0.5">
        {sounds.map((option) => {
          const selected = sound === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`h-7 rounded px-2 text-[11px] font-semibold transition-colors ${
                selected
                  ? "bg-[var(--lv-accent)] text-stone-950"
                  : "text-[var(--lv-text-muted)] hover:bg-[var(--lv-surface-raised)] hover:text-[var(--lv-text)]"
              }`}
              aria-label={`${copy.capture.previewSound}: ${option.label}`}
              aria-pressed={selected}
              title={option.label}
              data-preview-sound={option.value}
              onClick={() => setSound(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
