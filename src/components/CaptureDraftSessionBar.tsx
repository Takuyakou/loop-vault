import { Play, Square, Trash2 } from "lucide-react";
import type { AppLanguage } from "../i18n";
import { Button, IconButton } from "./ui";

export interface CaptureDraftSessionBarProps {
  language: AppLanguage;
  dirty: boolean;
  sourceAvailable: boolean;
  playing: "source" | "edited" | null;
  onPreviewSource(): void;
  onPreviewEdited(): void;
  onStop(): void;
  onRequestDiscard(): void;
}

export function CaptureDraftSessionBar({
  language,
  dirty,
  sourceAvailable,
  playing,
  onPreviewSource,
  onPreviewEdited,
  onStop,
  onRequestDiscard,
}: CaptureDraftSessionBarProps) {
  const ja = language === "ja";
  return (
    <section
      className="border border-teal-300/50 bg-[var(--lv-surface)] px-4 py-3"
      aria-label={ja ? "編集中のDraft" : "Active Draft"}
      data-testid="capture-draft-session"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-teal-100">
            {ja ? "編集中のDraft" : "Active Draft"}
          </span>
          {dirty ? (
            <span className="border border-amber-300/60 px-2 py-0.5 text-xs text-amber-200" role="status" aria-live="polite">
              {ja ? "未保存" : "Unsaved"}
            </span>
          ) : (
            <span className="text-xs text-[var(--lv-success)]" role="status">
              {ja ? "保存済みの状態" : "Saved state"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ja ? "A/B試聴" : "A/B preview"}>
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
            {ja ? "A: 元MIDI" : "A: Source MIDI"}
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
            {ja ? "B: 編集後" : "B: Edited Draft"}
          </Button>
          <IconButton
            variant="secondary"
            onClick={onStop}
            label={ja ? "試聴を停止" : "Stop preview"}
          >
            <Square aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            variant="danger"
            onClick={onRequestDiscard}
            label={ja ? "Draftを閉じる" : "Close Draft"}
          >
            <Trash2 aria-hidden="true" size={16} />
          </IconButton>
        </div>
      </div>
      {!sourceAvailable ? (
        <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
          {ja
            ? "元MIDIのVoicingがないため、A試聴は利用できません。"
            : "A preview is unavailable because this Draft has no source MIDI voicing."}
        </p>
      ) : null}
      <details className="mt-2 text-xs text-[var(--lv-text-muted)]">
        <summary className="cursor-pointer select-none">
          {ja ? "キーボード操作" : "Keyboard controls"}
        </summary>
        <p className="mt-1 leading-5">
          {ja
            ? "A/B: 試聴 ・ Esc: 停止 ・ Space: 選択コード ・ Enter: 編集 ・ Shift+F10/Menu: 操作 ・ Ctrl+Z/Y: Undo/Redo ・ G: スナップ"
            : "A/B: preview ・ Esc: stop ・ Space: selected chord ・ Enter: edit ・ Shift+F10/Menu: actions ・ Ctrl+Z/Y: undo/redo ・ G: snap"}
        </p>
      </details>
    </section>
  );
}
