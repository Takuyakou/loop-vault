import {
  CAPTURE_WINDOW_MS,
  CLOCK_JUMP_TOLERANCE_MS,
  RESPONSE_TIMEOUT_MS,
  SETTLE_MS,
  SPEED_LIMIT_MS,
  STALL_MS,
} from "./bank";

/**
 * P23-40 product capture for one course trial. It is the executable form of `input-contract.md` v3:
 * response wait, capture window, settle, boundary seal, neutral partial seal, speed from `armedAt`.
 * `src/courseDesign/` is never imported by product code; `capture.test.ts` checks this implementation
 * against the contract harness on the same injected-clock fixtures.
 */
export type CourseCaptureEvent =
  | { readonly kind: "note-on"; readonly channel: number; readonly note: number; readonly at: number }
  | { readonly kind: "note-off"; readonly channel: number; readonly note: number; readonly at: number };

export type CourseInvalidReason =
  | "disconnected"
  | "prepare-failed"
  | "clock-jump"
  | "capability"
  | "stall"
  | "hidden";

export interface CourseSealed {
  readonly notes: readonly number[];
  readonly firstOnAt?: number;
  readonly completionAt?: number;
  readonly lastOnAt?: number;
  readonly sealedAt: number;
  readonly reason: "settled" | "capture-window" | "response-timeout";
  readonly noInput: boolean;
  readonly speedMs?: number;
}

export type CourseCaptureState =
  | { readonly kind: "idle" }
  | { readonly kind: "armed"; readonly armedAt: number; readonly priorHeld: readonly number[] }
  | { readonly kind: "capturing"; readonly armedAt: number; readonly firstOnAt: number }
  | { readonly kind: "sealed"; readonly sealed: CourseSealed }
  | { readonly kind: "invalid"; readonly reason: CourseInvalidReason };

export interface CourseCaptureConfig {
  readonly requiredCount: number;
  readonly settleMs?: number;
  readonly captureWindowMs?: number;
  readonly responseTimeoutMs?: number;
  /** P23-44-fix-1: Lv1/2 wait until the learner plays, instead of sealing an empty response after 10s. */
  readonly waitForInput?: boolean;
}

export class CourseCapture {
  private state: CourseCaptureState = { kind: "idle" };
  private held = new Map<string, number>();
  private candidate: number[] = [];
  private lastOnAt?: number;
  private firstOnAt?: number;
  private completionAt?: number;
  private settleDeadlineMs?: number;
  private armedAt = 0;
  private priorHeld = new Set<number>();
  private readonly settleMs: number;
  private readonly captureWindowMs: number;
  private readonly responseTimeoutMs: number;
  private readonly requiredCount: number;
  private readonly waitForInput: boolean;

  constructor(config: CourseCaptureConfig) {
    this.requiredCount = config.requiredCount;
    this.settleMs = config.settleMs ?? SETTLE_MS;
    this.captureWindowMs = config.captureWindowMs ?? CAPTURE_WINDOW_MS;
    this.responseTimeoutMs = config.responseTimeoutMs ?? RESPONSE_TIMEOUT_MS;
    this.waitForInput = config.waitForInput ?? false;
  }

  get current(): CourseCaptureState {
    return this.state;
  }

  /** Arm at `at`. `held` is the set of sounding notes at that moment (all must be released first). */
  arm(at: number, held: readonly number[] = []): void {
    this.state = { kind: "armed", armedAt: at, priorHeld: [...new Set(held)].sort((a, b) => a - b) };
    this.armedAt = at;
    this.priorHeld = new Set(held);
    this.held.clear();
    this.candidate = [];
    this.lastOnAt = undefined;
    this.firstOnAt = undefined;
    this.completionAt = undefined;
    this.settleDeadlineMs = undefined;
  }

  invalidate(reason: CourseInvalidReason): void {
    if (this.state.kind === "sealed") return;
    this.state = { kind: "invalid", reason };
    this.held.clear();
    this.candidate = [];
    this.settleDeadlineMs = undefined;
  }

  event(event: CourseCaptureEvent): void {
    if (this.state.kind !== "armed" && this.state.kind !== "capturing") return;
    if (event.at < this.armedAt) return;
    const boundary = this.boundaryAt();
    if (boundary !== undefined && event.at >= boundary) {
      this.sealAt(boundary);
      return;
    }
    const key = `${event.channel}:${event.note}`;
    if (event.kind === "note-on") {
      if (this.priorHeld.has(event.note) && !this.held.has(key)) return;
      this.priorHeld.delete(event.note);
      this.held.set(key, event.note);
      this.candidate = [...new Set(this.held.values())].sort((a, b) => a - b);
      this.lastOnAt = event.at;
      if (this.firstOnAt === undefined) this.firstOnAt = event.at;
      const firstOnAt = this.firstOnAt;
      if (this.state.kind === "armed") this.state = { kind: "capturing", armedAt: this.armedAt, firstOnAt };
      // P23-44-fix-1: an octave doubling does not complete a chord. Count distinct pitch classes,
      // and do not start the 60ms settle clock until the required pitch classes are all present.
      const complete = new Set(this.candidate.map((note) => ((note % 12) + 12) % 12)).size >= this.requiredCount;
      if (complete && this.completionAt === undefined) this.completionAt = event.at;
      this.settleDeadlineMs = complete ? event.at + this.settleMs : undefined;
      return;
    }
    this.held.delete(key);
    this.priorHeld.delete(event.note);
  }

  advance(now: number): CourseSealed | undefined {
    if (this.state.kind === "sealed") return this.state.sealed;
    if (this.state.kind !== "armed" && this.state.kind !== "capturing") return undefined;
    const boundary = this.boundaryAt();
    if (boundary === undefined || now < boundary) return undefined;
    return this.sealAt(boundary);
  }

  private boundaryAt(): number | undefined {
    if (this.state.kind === "invalid") return undefined;
    if (this.firstOnAt === undefined) return this.waitForInput ? undefined : this.armedAt + this.responseTimeoutMs;
    const captureEnd = this.firstOnAt + this.captureWindowMs;
    return this.settleDeadlineMs === undefined ? captureEnd : Math.min(this.settleDeadlineMs, captureEnd);
  }

  private sealAt(at: number): CourseSealed {
    const notes = [...this.candidate].sort((left, right) => left - right);
    const captureEnd = this.firstOnAt === undefined ? undefined : this.firstOnAt + this.captureWindowMs;
    const reason: CourseSealed["reason"] = this.firstOnAt === undefined
      ? "response-timeout"
      : at >= captureEnd! && (this.settleDeadlineMs === undefined || at < this.settleDeadlineMs)
        ? "capture-window"
        : "settled";
    const sealed: CourseSealed = {
      notes,
      ...(this.firstOnAt === undefined ? {} : { firstOnAt: this.firstOnAt }),
      ...(this.completionAt === undefined ? {} : { completionAt: this.completionAt }),
      ...(this.lastOnAt === undefined ? {} : { lastOnAt: this.lastOnAt }),
      sealedAt: at,
      reason,
      noInput: notes.length === 0,
      ...(this.completionAt === undefined ? {} : { speedMs: this.completionAt - this.armedAt }),
    };
    this.state = { kind: "sealed", sealed };
    return sealed;
  }
}

export type CourseAttemptOutcome = "played" | "incomplete" | "no-input" | "invalid";

export function courseAttemptOutcome(sealed: CourseSealed | undefined, requiredCount: number): CourseAttemptOutcome {
  if (sealed === undefined) return "invalid";
  if (sealed.noInput) return "no-input";
  if (new Set(sealed.notes).size < requiredCount) return "incomplete";
  return "played";
}

export function withinSpeedLimit(sealed: CourseSealed, limitMs = SPEED_LIMIT_MS): boolean {
  return !sealed.noInput && sealed.speedMs !== undefined && sealed.speedMs <= limitMs;
}

export function pollGapInvalid(gapMs: number): boolean {
  return gapMs > STALL_MS;
}

export function clockJumpDetected(monotonicDeltaMs: number, wallDeltaMs: number): boolean {
  return monotonicDeltaMs < 0 || Math.abs(monotonicDeltaMs - wallDeltaMs) > CLOCK_JUMP_TOLERANCE_MS;
}

export function hiddenInvalid(visibility: "visible" | "hidden" | "prerender"): CourseInvalidReason | undefined {
  return visibility === "visible" ? undefined : "hidden";
}
