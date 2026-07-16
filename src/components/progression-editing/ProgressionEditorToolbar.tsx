import { progressionEditorCopy, type AppLanguage } from "../../i18n";
import { Redo2, Undo2 } from "lucide-react";

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
  const text = progressionEditorCopy[language];
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] disabled:opacity-40"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={text.undo}
          title={text.undo}
        >
          <Undo2 aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] disabled:opacity-40"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={text.redo}
          title={text.redo}
        >
          <Redo2 aria-hidden="true" size={16} />
        </button>
      </div>
      {dirty ? (
        <button
          type="button"
          className="px-2 py-1 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
          onClick={onResetAll}
        >
          {text.resetAll}
        </button>
      ) : null}
    </div>
  );
}
