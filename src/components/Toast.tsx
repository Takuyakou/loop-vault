export function Toast({ message }: { message: string }) {
  return <div className="fixed right-4 top-4 z-50 max-w-sm border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] px-4 py-3 text-sm text-[var(--lv-text)] shadow-xl" role="status" aria-live="polite" aria-atomic="true">{message}</div>;
}
