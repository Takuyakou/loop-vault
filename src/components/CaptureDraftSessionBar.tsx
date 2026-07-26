import { Play, Square, Trash2 } from "lucide-react";
import type { AppLanguage } from "../i18n";

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
            <span className="border border-amber-300/60 px-2 py-0.5 text-xs text-amber-200">
              {ja ? "未保存" : "Unsaved"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ja ? "A/B試聴" : "A/B preview"}>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 border border-[var(--lv-border-strong)] px-3 text-sm disabled:opacity-40"
            disabled={!sourceAvailable}
            aria-pressed={playing === "source"}
            onClick={onPreviewSource}
            data-preview-side="source"
          >
            <Play aria-hidden="true" size={16} />
            {ja ? "A: 元MIDI" : "A: Source MIDI"}
          </button>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 border border-teal-300 px-3 text-sm text-teal-100"
            aria-pressed={playing === "edited"}
            onClick={onPreviewEdited}
            data-preview-side="edited"
          >
            <Play aria-hidden="true" size={16} />
            {ja ? "B: 編集後" : "B: Edited Draft"}
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)]"
            onClick={onStop}
            aria-label={ja ? "試聴を停止" : "Stop preview"}
            title={ja ? "試聴を停止" : "Stop preview"}
          >
            <Square aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center border border-red-400/50 text-red-200"
            onClick={onRequestDiscard}
            aria-label={ja ? "Draftを閉じる" : "Close Draft"}
            title={ja ? "Draftを閉じる" : "Close Draft"}
          >
            <Trash2 aria-hidden="true" size={16} />
          </button>
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
