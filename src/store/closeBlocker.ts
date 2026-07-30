export interface CloseBlocker {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

const blockers = new Map<symbol, CloseBlocker>();

export function registerCloseBlocker(blocker: CloseBlocker): () => void {
  const id = Symbol("close-blocker");
  blockers.set(id, blocker);
  return () => {
    blockers.delete(id);
  };
}

export function firstCloseBlocker(): CloseBlocker | undefined {
  return blockers.values().next().value;
}

export function hasCloseBlockers(): boolean {
  return blockers.size > 0;
}
