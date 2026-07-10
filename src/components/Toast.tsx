export function Toast({ message }: { message: string }) {
  return <div className="fixed right-4 top-4 z-50 max-w-sm border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-100 shadow-xl" role="status">{message}</div>;
}
