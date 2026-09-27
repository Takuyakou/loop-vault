// P8.9 unified notifications: one bottom-right stack for toasts and Undo.
// Replaces the top-right Toast and the bottom-left UndoToast.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type { UndoableAction } from "../../hooks/useUndoQueue";
import { useReservedBottomSpace } from "./bottomReservations";
import { useAnyModalOpen } from "../Modal";
import { CloseIcon, ErrorIcon, InfoIcon, SuccessIcon, UndoIcon, WarningIcon, type IconComponent } from "../icons";
import type { NotificationItem, NotificationStore, NotificationTone, NotifyInput } from "./notificationStore";

const NotificationContext = createContext<NotificationStore | null>(null);

/** notify({ tone, message, action?, durationMs? }) from anywhere under the Provider. */
export function useNotify(): (input: NotifyInput) => number {
  const store = useContext(NotificationContext);
  if (!store) throw new Error("useNotify must be used inside NotificationProvider");
  return store.notify;
}

export interface UndoBinding {
  actions: UndoableAction[];
  onUndo: (id: string) => void;
  label: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export interface NotificationProviderProps {
  store: NotificationStore;
  children?: ReactNode;
  undo?: UndoBinding;
  closeLabel?: string;
}

export function NotificationProvider({ children, closeLabel = "閉じる", store, undo }: NotificationProviderProps) {
  return (
    <NotificationContext.Provider value={store}>
      {children}
      <NotificationViewport store={store} undo={undo} closeLabel={closeLabel} />
    </NotificationContext.Provider>
  );
}

const toneIcons: Record<NotificationTone, IconComponent> = {
  success: SuccessIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
};

function NotificationViewport({ closeLabel, store, undo }: { store: NotificationStore; undo?: UndoBinding; closeLabel: string }) {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const undoActions = undo?.actions ?? [];
  const announcement = useUndoFocusAndAnnouncement(undoActions, undo?.fallbackFocusRef);
  const buttonRefs = announcement.buttonRefs;
  const reservedBottom = useReservedBottomSpace();
  // While a dialog is open the stack moves to the top center, clear of the dialog's buttons.
  const dialogOpen = useAnyModalOpen();

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement.current ? (
          <span key={announcement.current.nonce} data-live-announcement={announcement.current.nonce}>
            {announcement.current.text}
          </span>
        ) : null}
      </span>
      <div
        data-undo-toast-stack
        data-notification-stack
        className={`lv-toast-stack overflow-y-auto overscroll-contain${dialogOpen ? " lv-toast-stack-dialog" : ""}`}
        style={{
          bottom: `calc(var(--lv-toast-offset-bottom) + ${reservedBottom}px + var(--lv-sticky-inspector-height, 0px) + env(safe-area-inset-bottom, 0px))`,
          maxHeight: "calc(100vh - var(--lv-sticky-inspector-height, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)",
        }}
      >
        <div className="lv-toast-list" aria-live="polite" aria-relevant="additions text">
          {items.filter((item) => item.tone !== "error").map((item) => (
            <NotificationToast key={item.id} item={item} store={store} closeLabel={closeLabel} />
          ))}
        </div>
        {items.filter((item) => item.tone === "error").map((item) => (
          <NotificationToast key={item.id} item={item} store={store} closeLabel={closeLabel} />
        ))}
        {undoActions.map((action) => (
          <div key={action.id} className="lv-toast" data-tone="info" data-toast-kind="undo">
            <span className="lv-toast-icon" aria-hidden="true"><UndoIcon size={14} /></span>
            <p className="lv-toast-message">{action.label}</p>
            <button
              ref={(element) => {
                if (element) buttonRefs.current.set(action.id, element);
                else buttonRefs.current.delete(action.id);
              }}
              type="button"
              data-undo-action-id={action.id}
              className="lv-toast-action"
              onClick={() => undo?.onUndo(action.id)}
            >
              {undo?.label}
            </button>
            {/* The undo window is a fixed timer in useUndoQueue, so this bar does not pause on hover. */}
            <UndoTimeBar expiresAt={action.expiresAt} />
          </div>
        ))}
      </div>
    </>
  );
}

function NotificationToast({ closeLabel, item, store }: { item: NotificationItem; store: NotificationStore; closeLabel: string }) {
  const [paused, setPaused] = useState(false);
  const hovered = useRef(false);
  const focused = useRef(false);
  const remaining = useRef(item.durationMs);
  const startedAt = useRef(0);
  const Icon = toneIcons[item.tone];

  useEffect(() => {
    if (paused || remaining.current === undefined) return undefined;
    startedAt.current = Date.now();
    const timer = setTimeout(() => store.dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      if (remaining.current !== undefined) {
        remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
      }
    };
  }, [item.id, paused, store]);

  const sync = () => setPaused(hovered.current || focused.current);

  return (
    <div
      className="lv-toast"
      data-tone={item.tone}
      data-toast-tone={item.tone}
      data-paused={paused}
      role={item.tone === "error" ? "alert" : undefined}
      aria-live={item.tone === "error" ? "assertive" : undefined}
      onMouseEnter={() => { hovered.current = true; sync(); }}
      onMouseLeave={() => { hovered.current = false; sync(); }}
      onFocus={() => { focused.current = true; sync(); }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focused.current = false;
        sync();
      }}
    >
      <span className="lv-toast-icon" aria-hidden="true"><Icon size={14} /></span>
      <p className="lv-toast-message">{item.message}</p>
      {item.action ? (
        <button
          type="button"
          className="lv-toast-action"
          onClick={() => {
            item.action?.onClick();
            store.dismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <button type="button" className="lv-toast-close" aria-label={closeLabel} title={closeLabel} onClick={() => store.dismiss(item.id)}>
        <CloseIcon size={12} />
      </button>
      {item.durationMs !== undefined ? (
        <span className="lv-toast-bar" aria-hidden="true" style={{ animationDuration: `${item.durationMs}ms` }} />
      ) : null}
    </div>
  );
}

function UndoTimeBar({ expiresAt }: { expiresAt: number }) {
  const [duration] = useState(() => Math.max(0, expiresAt - Date.now()));
  return <span className="lv-toast-bar" aria-hidden="true" style={{ animationDuration: `${duration}ms` }} />;
}

/**
 * Carried over unchanged from UndoToast: announce new Undo labels once, focus the
 * newest Undo button, and when an action leaves, focus the next newest or return
 * to the deletion source (or the fallback heading if the source is gone).
 */
function useUndoFocusAndAnnouncement(actions: UndoableAction[], fallbackFocusRef?: RefObject<HTMLElement | null>) {
  const announcedIds = useRef(new Set<string>());
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousActions = useRef<UndoableAction[]>([]);
  const announcementNonce = useRef(0);
  const [current, setCurrent] = useState<{ text: string; nonce: number }>();

  useEffect(() => {
    const previous = previousActions.current;
    const previousNewest = previous[previous.length - 1];
    const newActions = actions.filter((action) => !announcedIds.current.has(action.id));
    if (newActions.length > 0) {
      for (const action of newActions) announcedIds.current.add(action.id);
      setCurrent({ text: newActions.map((action) => action.label).join(". "), nonce: ++announcementNonce.current });
      const newest = newActions[newActions.length - 1];
      buttonRefs.current.get(newest!.id)?.focus();
    } else if (previousNewest && !actions.some((action) => action.id === previousNewest.id)) {
      const nextNewest = actions[actions.length - 1];
      if (nextNewest) {
        buttonRefs.current.get(nextNewest.id)?.focus();
      } else {
        const focusTarget = previousNewest.focusTarget?.isConnected ? previousNewest.focusTarget : fallbackFocusRef?.current;
        focusTarget?.focus();
      }
    }
    previousActions.current = actions;
  }, [actions, fallbackFocusRef]);

  return { current, buttonRefs };
}
