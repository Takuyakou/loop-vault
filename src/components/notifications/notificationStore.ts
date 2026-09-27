// P8.9 notification store: one queue behind the bottom-right toast stack.
// A plain external store so App (which renders the Provider) can notify too.

export type NotificationTone = "success" | "info" | "warning" | "error";

export interface NotifyInput {
  message: string;
  tone?: NotificationTone;
  /** At most one action, e.g. 「開く」. Clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss delay. Errors never auto-dismiss. */
  durationMs?: number;
}

export interface NotificationItem {
  id: number;
  message: string;
  tone: NotificationTone;
  action?: { label: string; onClick: () => void };
  /** undefined = stays until closed (errors). */
  durationMs?: number;
}

export const MAX_NOTIFICATIONS = 3;
export const DEFAULT_NOTIFICATION_MS = 4000;

export interface NotificationStore {
  notify(input: NotifyInput): number;
  dismiss(id: number): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly NotificationItem[];
}

export function createNotificationStore(): NotificationStore {
  let items: readonly NotificationItem[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  const publish = (next: readonly NotificationItem[]) => {
    items = next;
    for (const listener of listeners) listener();
  };

  return {
    notify(input) {
      const tone = input.tone ?? "info";
      const item: NotificationItem = {
        id: nextId++,
        message: input.message,
        tone,
        action: input.action,
        durationMs: tone === "error" ? undefined : input.durationMs ?? DEFAULT_NOTIFICATION_MS,
      };
      // Keep the newest MAX_NOTIFICATIONS; the oldest drops first.
      publish([...items, item].slice(-MAX_NOTIFICATIONS));
      return item.id;
    },
    dismiss(id) {
      if (items.some((item) => item.id === id)) publish(items.filter((item) => item.id !== id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => items,
  };
}
