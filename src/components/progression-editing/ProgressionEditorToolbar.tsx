import type { AppLanguage } from "../../i18n";

interface ProgressionEditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetAll: () => void;
  language: AppLanguage;
}

export function ProgressionEditorToolbar({
  canUndo,
  canRedo,
  dirty,
  onUndo,
  onRedo,
  onResetAll,
  language,
}: ProgressionEditorToolbarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] disabled:opacity-40"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={language === "ja" ? "元に戻す" : "Undo"}
          title={language === "ja" ? "元に戻す" : "Undo"}
        >
          ↶
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] disabled:opacity-40"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={language === "ja" ? "やり直す" : "Redo"}
          title={language === "ja" ? "やり直す" : "Redo"}
        >
          ↷
        </button>
      </div>
      {dirty ? (
        <button
          type="button"
          className="px-2 py-1 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
          onClick={onResetAll}
        >
          {language === "ja" ? "すべて元に戻す" : "Reset all"}
        </button>
      ) : null}
    </div>
  );
}
