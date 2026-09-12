import type { LiveMidiStoreState } from "./liveMidiStore";
import { defaultLiveMidiStore } from "./defaultLiveMidiStore";

export interface LiveMidiActivationLease {
  readonly ready: Promise<void>;
  ensureActive(): Promise<void>;
  release(): void;
}

interface LiveMidiActivationStore {
  getState(): Pick<LiveMidiStoreState, "active" | "activate" | "deactivate">;
}

/** Serializes shared Practice-mode activation and defers final release by one
 * microtask so sibling tab unmount/mount cannot race deactivate against activate. */
export class LiveMidiActivationLeaseManager {
  private leaseCount = 0;
  private releaseEpoch = 0;
  private operation = Promise.resolve();
  private activatedByManager = false;
  private activationReady = false;
  private activationError: unknown;

  constructor(private readonly store: LiveMidiActivationStore) {}

  acquire(): LiveMidiActivationLease {
    let released = false;
    this.leaseCount += 1;
    this.releaseEpoch += 1;
    const ensureActive = () => this.enqueue(async () => {
      if (this.activatedByManager && !this.activationReady && this.store.getState().active) {
        throw this.activationError ?? new Error("Live MIDI activation did not complete");
      }
      if (this.leaseCount > 0 && !this.store.getState().active) {
        this.activatedByManager = true;
        this.activationReady = false;
        this.activationError = undefined;
        try {
          await this.store.getState().activate();
          if (!this.store.getState().active) throw new Error("Live MIDI activation did not become active");
          this.activationReady = true;
        } catch (error) {
          this.activationError = error;
          try {
            if (this.store.getState().active) await this.store.getState().deactivate();
          } catch {
            // Keep failed ownership so final release can retry cleanup.
          }
          if (!this.store.getState().active) {
            this.activatedByManager = false;
            this.activationError = undefined;
          }
          throw error;
        }
      }
    });
    const ready = ensureActive();
    return {
      ready,
      ensureActive,
      release: () => {
        if (released) return;
        released = true;
        this.leaseCount = Math.max(0, this.leaseCount - 1);
        const epoch = ++this.releaseEpoch;
        queueMicrotask(() => {
          if (this.leaseCount > 0 || epoch !== this.releaseEpoch) return;
          void this.enqueue(async () => {
            if (this.leaseCount === 0 && this.activatedByManager) {
              if (this.store.getState().active) await this.store.getState().deactivate();
              if (!this.store.getState().active) {
                this.activatedByManager = false;
                this.activationReady = false;
                this.activationError = undefined;
              }
            }
          });
        });
      },
    };
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.then(operation, operation);
    this.operation = next.catch(() => undefined);
    return next;
  }
}

/** Deduplicates one async mini-mode open and invalidates late work before close. */
export class LiveMidiOpenGate {
  private generation = 0;
  private pending?: Promise<void>;
  private closing?: Promise<void>;

  enter(operation: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    if (this.closing) return this.closing;
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const pending = Promise.resolve().then(() => operation(() => generation === this.generation));
    this.pending = pending;
    void pending.finally(() => {
      if (this.pending === pending) this.pending = undefined;
    }).catch(() => undefined);
    return pending;
  }

  close(operation: () => Promise<void>): Promise<void> {
    if (this.closing) return this.closing;
    this.generation += 1;
    const pendingOpen = this.pending;
    const closing = (async () => {
      await pendingOpen?.catch(() => undefined);
      await operation();
    })();
    this.closing = closing;
    void closing.finally(() => {
      if (this.closing === closing) this.closing = undefined;
    }).catch(() => undefined);
    return closing;
  }

  invalidate(): void {
    this.generation += 1;
  }
}

export const liveMidiActivation = new LiveMidiActivationLeaseManager(defaultLiveMidiStore);
