/**
 * P23-39 Stage 0 (v2) — the frozen input/sealing contract for one guided course trial.
 *
 * This module is a *design harness*, not product code: nothing under `src/` imports it. It re-states the
 * contract in executable form so the counterexamples in `inputContract.test.ts` are deterministic and
 * `judgingCorrespondence.test.ts` can map it onto the existing product adapter (`ChordEntry`).
 *
 * Captured thing: pressed keys (Note On / Note Off per channel), not "sounding" notes. SUSTAIN (CC64) does
 * not extend the capture: a key that is released is gone from the candidate even while the pedal holds its
 * sound. That is the semantics the existing judging adapter has; the sounding display is a different view.
 *
 * Timeline: monotonic milliseconds from the same clock as `performance.now()` (the product assigns
 * `at = performance.now() - (lastEvent.timestampMs - event.timestampMs)` inside a batch). Absolute device
 * timestamps and physical latency are not observable and are never claimed.
 *
 * Three separate durations (they are never one number):
 * 1. response wait — `armedAt` → the first Note On. A learner may look at the prompt for a while; the
 *    accelerated 3 s condition is *not* a response deadline.
 * 2. capture window — the first Note On → `CAPTURE_WINDOW_MS`. This bounds how long one answer may keep
 *    collecting notes; it starts at the first key, never at arming, so a correct chord struck after 1.5 s
 *    is not erased by the capture bound.
 * 3. settle — the last Note On → `SETTLE_MS`. It closes the natural finger spread of one gesture. It is
 *    armed for every Note On, not only when the required count is already reached, so a partial chord
 *    settles neutrally too (the classification decides `incomplete`).
 *
 * Frozen values (P23-39 v2):
 * - settle window 60 ms (the Dojo's default `settleMs`; the range stays 0–1000).
 * - capture window 1500 ms measured from the first Note On (a P23-40 implementation requirement; the
 *   current guided view has no maximum, which is recorded as a delta).
 * - response timeout 10000 ms from arming with no Note On at all. It only produces `no-input`; it is not a
 *   speed condition and it does not shorten the capture window.
 * - seal instant = the earliest of the settle deadline, the capture-window end and the response timeout.
 *   The seal is recorded at that boundary, not at the poll that notices it, so a delayed poll cannot
 *   extend the captured set or the measured speed.
 * - speed = `completionAt - armedAt` (prompt ready, not the seal), and the 3 s condition is
 *   `completionAt - armedAt <= 3000` for completed *correct* attempts of the Lv3 name-recall block only.
 *   Ear prompts arm at the audio-ended callback; a Note On before that callback is not an answer.
 */
export const SETTLE_MS = 60;
export const CAPTURE_WINDOW_MS = 1500;
export const RESPONSE_TIMEOUT_MS = 10000;
export const SPEED_LIMIT_MS = 3000;
export const BPM_MIN = 30;
export const BPM_MAX = 240;

/** The product polls the capture every 10 ms; this is the frozen driver cadence. */
export const POLL_INTERVAL_MS = 10;
/** A poll gap longer than this means the main thread stalled at least once inside the trial. */
export const STALL_MS = 250;
/** A monotonic/wall clock disagreement larger than this (or any backwards monotonic step) is a clock jump. */
export const CLOCK_JUMP_TOLERANCE_MS = 100;

export type CaptureEvent =
  | { readonly kind: "note-on"; readonly channel: number; readonly note: number; readonly at: number }
  | { readonly kind: "note-off"; readonly channel: number; readonly note: number; readonly at: number };

/**
 * `stall` and `hidden` are added in v2: a main-thread stall beyond the detectable threshold and a tab that
 * stops being visible invalidate the trial for speed and scoring. They are deterministic detections, not a
 * claim that the user was slow. Undetected OS/physical latency is still never claimed.
 */
export type InvalidReason =
  | "disconnected"
  | "prepare-failed"
  | "clock-jump"
  | "capability"
  | "stall"
  | "hidden";

export interface CaptureConfig {
  /** Distinct MIDI notes the trial needs (a triad is 3, a four-note voicing 4). */
  readonly requiredCount: number;
  readonly settleMs?: number;
  readonly captureWindowMs?: number;
  readonly responseTimeoutMs?: number;
}

export interface Sealed {
  /** The candidate at the seal boundary, sorted, distinct by MIDI note. */
  readonly notes: readonly number[];
  /** The first Note On (capture start). */
  readonly firstOnAt?: number;
  /** The Note On that first reached the required distinct count (speed endpoint). */
  readonly completionAt?: number;
  readonly lastOnAt?: number;
  /** The boundary instant, not the poll instant that noticed it. */
  readonly sealedAt: number;
  readonly reason: "settled" | "capture-window" | "response-timeout";
  /** Empty capture within the response timeout: an attempt that was not played (never a device-invalid). */
  readonly noInput: boolean;
  /** Speed only exists when the capture completed; otherwise it is not a slow answer. */
  readonly speedMs?: number;
}

export type CaptureState =
  | { readonly kind: "idle" }
  | { readonly kind: "armed"; readonly armedAt: number; readonly priorHeld: readonly number[]; readonly responseDeadlineAt: number }
  | { readonly kind: "capturing"; readonly armedAt: number; readonly firstOnAt: number }
  | { readonly kind: "sealed"; readonly sealed: Sealed }
  | { readonly kind: "invalid"; readonly reason: InvalidReason };

/**
 * One trial's capture. Order of concerns:
 * 1. Arm at a known instant; keys already held at that instant are not the answer (they must be released
 *    first — the "前回答の release 待ち" state).
 * 2. Every event before arming, after sealing, or from an invalidated trial is ignored.
 * 3. The candidate is the set of held notes at the last Note On; a Note Off before the settle deadline
 *    keeps the candidate (the pre-release candidate the product preserves), so releasing a chord quickly
 *    does not erase it.
 * 4. The seal is neutral: it depends only on the settle deadline, the capture window and the response
 *    timeout, never on the expected answer. A sealed wrong or partial set is never rewritten by a later
 *    correction; that is a new attempt.
 * 5. A late poll does not move the seal: the seal instant is the boundary, and an event at or after the
 *    boundary is ignored even if `advance` has not run yet.
 */
export class CaptureHarness {
  private state: CaptureState = { kind: "idle" };
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

  constructor(config: CaptureConfig) {
    this.requiredCount = config.requiredCount;
    this.settleMs = config.settleMs ?? SETTLE_MS;
    this.captureWindowMs = config.captureWindowMs ?? CAPTURE_WINDOW_MS;
    this.responseTimeoutMs = config.responseTimeoutMs ?? RESPONSE_TIMEOUT_MS;
  }

  get current(): CaptureState {
    return this.state;
  }

  /**
   * Arm at `at`. `held` is the set of sounding notes at that moment (all must be released first).
   *
   * Ear prompts pass the audio-ended callback time here: the answer window and the speed origin start when
   * the prompt is actually available, not when the playback began.
   */
  arm(at: number, held: readonly number[] = []): void {
    const priorHeld = [...new Set(held)].sort((a, b) => a - b);
    this.state = { kind: "armed", armedAt: at, priorHeld, responseDeadlineAt: at + this.responseTimeoutMs };
    this.armedAt = at;
    this.priorHeld = new Set(held);
    this.held.clear();
    this.candidate = [];
    this.lastOnAt = undefined;
    this.firstOnAt = undefined;
    this.completionAt = undefined;
    this.settleDeadlineMs = undefined;
  }

  invalidate(reason: InvalidReason): void {
    if (this.state.kind === "sealed") return;
    this.state = { kind: "invalid", reason };
    this.held.clear();
    this.candidate = [];
    this.settleDeadlineMs = undefined;
  }

  event(event: CaptureEvent): void {
    if (this.state.kind !== "armed" && this.state.kind !== "capturing") return;
    if (event.at < this.armedAt) return;
    const boundary = this.boundaryAt();
    if (boundary !== undefined && event.at >= boundary) {
      // The boundary already passed: seal at the boundary and ignore this late event.
      this.sealAt(boundary);
      return;
    }
    const key = `${event.channel}:${event.note}`;
    if (event.kind === "note-on") {
      // A key that was already down when the trial armed must be released and pressed again.
      if (this.priorHeld.has(event.note) && !this.held.has(key)) return;
      this.priorHeld.delete(event.note);
      this.held.set(key, event.note);
      const distinct = [...new Set(this.held.values())].sort((a, b) => a - b);
      this.candidate = distinct;
      this.lastOnAt = event.at;
      if (this.firstOnAt === undefined) this.firstOnAt = event.at;
      const firstOnAt = this.firstOnAt;
      if (this.state.kind === "armed") this.state = { kind: "capturing", armedAt: this.armedAt, firstOnAt };
      if (this.completionAt === undefined && distinct.length >= this.requiredCount) this.completionAt = event.at;
      // The settle deadline is armed for *every* Note On: a partial gesture settles too (neutral seal).
      this.settleDeadlineMs = event.at + this.settleMs;
      return;
    }
    this.held.delete(key);
    this.priorHeld.delete(event.note);
    // A release keeps the pre-release candidate until the settle deadline. The candidate is rebuilt from
    // the held keys on the next Note On, so an early released key is gone from the final set.
  }

  /** Advance the clock. Returns a seal once a boundary (settle, capture window or response timeout) is reached. */
  advance(now: number): Sealed | undefined {
    if (this.state.kind === "sealed") return this.state.sealed;
    if (this.state.kind !== "armed" && this.state.kind !== "capturing") return undefined;
    const boundary = this.boundaryAt();
    if (boundary === undefined || now < boundary) return undefined;
    return this.sealAt(boundary);
  }

  /** The earliest instant at which the current trial must be sealed. */
  private boundaryAt(): number | undefined {
    if (this.state.kind === "invalid") return undefined;
    if (this.firstOnAt === undefined) return this.armedAt + this.responseTimeoutMs;
    const captureEnd = this.firstOnAt + this.captureWindowMs;
    return this.settleDeadlineMs === undefined ? captureEnd : Math.min(this.settleDeadlineMs, captureEnd);
  }

  private sealAt(at: number): Sealed {
    const notes = [...this.candidate].sort((left, right) => left - right);
    const captureEnd = this.firstOnAt === undefined ? undefined : this.firstOnAt + this.captureWindowMs;
    const reason: Sealed["reason"] = this.firstOnAt === undefined
      ? "response-timeout"
      : at >= captureEnd! && (this.settleDeadlineMs === undefined || at < this.settleDeadlineMs)
        ? "capture-window"
        : "settled";
    const sealed: Sealed = {
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

/**
 * The frozen driver rules for the two detectable environment problems (v2 decided here, not deferred):
 *
 * - `pollGapInvalid`: the capture driver polls every `POLL_INTERVAL_MS`; a gap longer than `STALL_MS`
 *   between two poll callbacks means the main thread stalled inside the trial. The trial is invalidated
 *   with `stall`. This detects only gaps the page can observe; it never infers OS/physical MIDI latency.
 * - `clockJumpDetected`: a backwards monotonic step, or a monotonic delta that disagrees with the wall
 *   clock by more than `CLOCK_JUMP_TOLERANCE_MS`, invalidates the trial with `clock-jump`.
 * - `hiddenInvalid`: the tab stopped being visible (`document.visibilityState !== "visible"`); the trial is
 *   invalidated with `hidden` because the answer window was not actually on screen.
 *
 * In all three cases the invalid trial is excluded from every denominator (see `classifyAttempt` /
 * `storeContract`), and the reason is recorded. A user's own wrong answer is never retried away.
 */
export function pollGapInvalid(gapMs: number): boolean {
  return gapMs > STALL_MS;
}

export function clockJumpDetected(monotonicDeltaMs: number, wallDeltaMs: number): boolean {
  return monotonicDeltaMs < 0 || Math.abs(monotonicDeltaMs - wallDeltaMs) > CLOCK_JUMP_TOLERANCE_MS;
}

export function hiddenInvalid(visibility: "visible" | "hidden" | "prerender"): InvalidReason | undefined {
  return visibility === "visible" ? undefined : "hidden";
}

/** The frozen 3 s condition: a *completed* capture, not a device-invalid or a no-input attempt. */
export function isWithinSpeedLimit(sealed: Sealed, limitMs = SPEED_LIMIT_MS): boolean {
  return !sealed.noInput && sealed.speedMs !== undefined && sealed.speedMs <= limitMs;
}

/**
 * The attempt outcome of one sealed capture. The accuracy policy is a separate layer (a trial's first
 * seal is the answer); this mapping only separates the categories the policy must never mix:
 * - `invalid`: the device/trial was invalid; excluded from every denominator.
 * - `no-input`: the player did not play within the response timeout; an attempt, not a wrong answer.
 * - `incomplete`: the required notes never all sounded together; an attempt with its own reason.
 * - `played`: a complete candidate, whatever its correctness; speed is only defined here.
 */
export type AttemptOutcome = "played" | "incomplete" | "no-input" | "invalid";

export function classifyAttempt(sealed: Sealed | undefined, requiredCount: number): AttemptOutcome {
  if (sealed === undefined) return "invalid";
  if (sealed.noInput) return "no-input";
  if (new Set(sealed.notes).size < requiredCount) return "incomplete";
  return "played";
}
