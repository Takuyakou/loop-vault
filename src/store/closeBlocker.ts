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

/**
 * P10.0-07: the close confirmation inside the app (spec v2.5 §10.2). The App mounts one
 * host that shows it as an in-app dialog; a window without that host (Live MIDI) keeps
 * the OS dialog. A confirm resolves true to close, false to stay.
 */
export type CloseDialogRequest =
  | { kind: "confirm"; blocker: CloseBlocker }
  | { kind: "error"; message: string };

type CloseDialogHost = (request: CloseDialogRequest) => Promise<boolean>;

let host: CloseDialogHost | undefined;

export function registerCloseDialogHost(next: CloseDialogHost): () => void {
  host = next;
  return () => {
    if (host === next) host = undefined;
  };
}

/** The in-app answer, or undefined when no host is mounted in this window. */
export function showCloseDialogInApp(request: CloseDialogRequest): Promise<boolean> | undefined {
  return host?.(request);
}
