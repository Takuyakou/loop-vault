import type { UndoableAction } from "../hooks/useUndoQueue";
import { useEffect, useRef, useState, type RefObject } from "react";

export function UndoToast({
  actions,
  undoLabel,
  onUndo,
  fallbackFocusRef,
}: {
  actions: UndoableAction[];
  undoLabel: string;
  onUndo: (id: string) => void;
  fallbackFocusRef?: RefObject<HTMLElement>;
}) {
  const announcedIds = useRef(new Set<string>());
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousActions = useRef<UndoableAction[]>([]);
  const announcementNonce = useRef(0);
  const [announcement, setAnnouncement] = useState<{
    text: string;
    nonce: number;
  }>();

  useEffect(() => {
    const previous = previousActions.current;
    const previousNewest = previous[previous.length - 1];
    const newActions = actions.filter(
      (action) => !announcedIds.current.has(action.id),
    );
    if (newActions.length > 0) {
      for (const action of newActions) announcedIds.current.add(action.id);
      setAnnouncement({
        text: newActions.map((action) => action.label).join(". "),
        nonce: ++announcementNonce.current,
      });
      const newest = newActions[newActions.length - 1];
      buttonRefs.current.get(newest!.id)?.focus();
    } else if (
      previousNewest &&
      !actions.some((action) => action.id === previousNewest.id)
    ) {
      const nextNewest = actions[actions.length - 1];
      if (nextNewest) {
        buttonRefs.current.get(nextNewest.id)?.focus();
      } else {
        const focusTarget = previousNewest.focusTarget?.isConnected
          ? previousNewest.focusTarget
          : fallbackFocusRef?.current;
        focusTarget?.focus();
      }
    }
    previousActions.current = actions;
  }, [actions, fallbackFocusRef]);

  if (actions.length === 0 && !announcement) return null;

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement ? (
          <span key={announcement.nonce} data-live-announcement={announcement.nonce}>
            {announcement.text}
          </span>
        ) : null}
      </span>
      {actions.length > 0 ? (
        <div
          data-undo-toast-stack
          className="fixed left-1/2 z-40 flex w-[min(92vw,480px)] -translate-x-1/2 flex-col gap-2 overflow-y-auto overscroll-contain xl:left-4 xl:w-[min(36vw,480px)] xl:translate-x-0"
          style={{
            bottom: "calc(var(--lv-sticky-inspector-height, 0px) + env(safe-area-inset-bottom, 0px) + 1rem)",
            maxHeight: "calc(100vh - var(--lv-sticky-inspector-height, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)",
          }}
        >
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between gap-3 border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-3 shadow-2xl"
            >
              <p className="min-w-0 text-sm text-[var(--lv-text-secondary)]">
                {action.label}
              </p>
              <button
                ref={(element) => {
                  if (element) buttonRefs.current.set(action.id, element);
                  else buttonRefs.current.delete(action.id);
                }}
                type="button"
                data-undo-action-id={action.id}
                className="shrink-0 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950"
                onClick={() => onUndo(action.id)}
              >
                {undoLabel}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
