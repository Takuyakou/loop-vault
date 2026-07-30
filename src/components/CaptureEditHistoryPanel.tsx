import type {
  CaptureEditHistoryEntry,
  ManualCandidateDraft,
} from "../domain/midi/manualDraft";
import type { AppLanguage } from "../i18n";

export interface CaptureEditHistoryPanelProps {
  draft: ManualCandidateDraft;
  language: AppLanguage;
  onJump(historyIndex: number): void;
}

export function CaptureEditHistoryPanel({
  draft,
  language,
  onJump,
}: CaptureEditHistoryPanelProps) {
  if (draft.history.length === 0) return null;
  const title = language === "ja" ? "操作履歴" : "Edit history";
  const initial = language === "ja" ? "開始時点" : "Initial state";

  return (
    <section
      className="mt-4 border-t border-[var(--lv-border)] pt-3"
      aria-label={title}
      data-testid="capture-edit-history"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-xs font-semibold text-[var(--lv-text)]">{title}</h5>
        <span className="text-xs text-[var(--lv-text-muted)]">
          {draft.historyIndex + 1}/{draft.history.length}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <HistoryButton
          current={draft.historyIndex === -1}
          label={initial}
          onClick={() => onJump(-1)}
        />
        {draft.history.map((entry, index) => (
          <HistoryButton
            key={entry.id}
            current={draft.historyIndex === index}
            label={`${index + 1}. ${historyLabel(entry, language)}`}
            onClick={() => onJump(index)}
          />
        ))}
      </div>
    </section>
  );
}

function HistoryButton({
  current,
  label,
  onClick,
}: {
  current: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`min-h-9 border px-2 text-xs ${
        current
          ? "border-teal-300 bg-teal-300/10 text-teal-100"
          : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
      }`}
      aria-current={current ? "step" : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function historyLabel(
  entry: CaptureEditHistoryEntry,
  language: AppLanguage,
): string {
  if (language === "en") return entry.label;
  switch (entry.operation.type) {
    case "create-from-range": return "範囲から作成";
    case "edit-progression": return "進行を編集";
    case "extend-start": return "開始を前へ延長";
    case "extend-end": return "終了を後ろへ延長";
    case "trim-start": return "開始を後ろへ移動";
    case "trim-end": return "終了を前へ移動";
    case "reselect-range": return "範囲を再選択";
    case "add-chord": return "コードを追加";
    case "delete-chord": return "コードを削除";
    case "replace-chord": return "コードを置換";
    case "move-event": return "コードを移動";
    case "resize-event": return "コード境界を変更";
    case "split-event": return "コードを分割";
    case "merge-events": return "コードを結合";
    case "change-snap": return "スナップを変更";
    case "undo": return "元に戻す";
    case "redo": return "やり直す";
  }
}
