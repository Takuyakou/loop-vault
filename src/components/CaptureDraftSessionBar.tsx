import { Play, Square, Trash2 } from "lucide-react";
import { Button, IconButton } from "./ui";

export interface CaptureDraftSessionBarProps {
  dirty: boolean;
  sourceAvailable: boolean;
  playing: "source" | "edited" | null;
  onPreviewSource(): void;
  onPreviewEdited(): void;
  onStop(): void;
  onRequestDiscard(): void;
}

export function CaptureDraftSessionBar({
  dirty,
  sourceAvailable,
  playing,
  onPreviewSource,
  onPreviewEdited,
  onStop,
  onRequestDiscard,
}: CaptureDraftSessionBarProps) {
  return (
    <section
      className="border border-teal-300/50 bg-[var(--lv-surface)] px-4 py-3"
      aria-label={"編集中のDraft"}
      data-testid="capture-draft-session"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-teal-100">
            {"編集中のDraft"}
          </span>
          {dirty ? (
            <span className="border border-amber-300/60 px-2 py-0.5 text-xs text-amber-200" role="status" aria-live="polite">
              {"未保存"}
            </span>
          ) : (
            <span className="text-xs text-[var(--lv-success)]" role="status">
              {"保存済みの状態"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={"A/B試聴"}>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-10"
            disabled={!sourceAvailable}
            aria-pressed={playing === "source"}
            onClick={onPreviewSource}
            data-preview-side="source"
          >
            <Play aria-hidden="true" size={16} />
            {"A: 元MIDI"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-10 border-teal-300 text-teal-100"
            aria-pressed={playing === "edited"}
            onClick={onPreviewEdited}
            data-preview-side="edited"
          >
            <Play aria-hidden="true" size={16} />
            {"B: 編集後"}
          </Button>
          <IconButton
            variant="secondary"
            onClick={onStop}
            label={"試聴を停止"}
          >
            <Square aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            variant="danger"
            onClick={onRequestDiscard}
            label={"Draftを閉じる"}
          >
            <Trash2 aria-hidden="true" size={16} />
          </IconButton>
        </div>
      </div>
      {!sourceAvailable ? (
        <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
          {"元MIDIのVoicingがないため、A試聴は利用できません。"}
        </p>
      ) : null}
      <details className="mt-2 text-xs text-[var(--lv-text-muted)]">
        <summary className="cursor-pointer select-none">
          {"キーボード操作"}
        </summary>
        <p className="mt-1 leading-5">
          {"A/B: 試聴 ・ Esc: 停止 ・ Space: 選択コード ・ Enter: 編集 ・ Shift+F10/Menu: 操作 ・ Ctrl+Z/Y: Undo/Redo ・ G: スナップ"}
        </p>
      </details>
    </section>
  );
}
