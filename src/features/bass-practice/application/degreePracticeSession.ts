import {
  playbackController,
  type PlaybackController,
  type PlayingSource,
} from "../../../audio/playbackController";
import {
  createDegreePracticeState,
  reduceDegreePractice,
  type DegreePracticeState,
  type PracticeAction,
  type PracticeExercise,
  type PracticeTransitionResult,
  type SingingReferenceMode,
} from "../domain";
import {
  DEGREE_ECHO_LISTEN_LIMIT,
  degreePhraseDurationMs,
  degreeSingingReferencePlaybackRequest,
  degreeTargetPlaybackRequest,
} from "./degreePlayback";

export interface DegreePracticeClock {
  now(): number;
}

export interface DegreePracticeTimer {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface DegreePracticeSessionOptions {
  readonly exercise: PracticeExercise;
  readonly singEnabled: boolean;
  readonly controller?: PlaybackController;
  readonly clock?: DegreePracticeClock;
  readonly timer?: DegreePracticeTimer;
}

export interface DegreePracticeSessionSnapshot {
  readonly revision: number;
  readonly state: DegreePracticeState;
  readonly exercise: PracticeExercise;
  readonly transferPlaybackActive: boolean;
}

export class DegreePracticeSession {
  private exercise: PracticeExercise;
  private readonly controller: PlaybackController;
  private readonly clock: DegreePracticeClock;
  private readonly timer: DegreePracticeTimer;
  private source: PlayingSource;
  private readonly listeners = new Set<() => void>();
  private state: DegreePracticeState;
  private snapshot: DegreePracticeSessionSnapshot;
  private dwellTimer: unknown;
  private playbackGeneration = 0;
  private revision = 0;
  private transferPlaybackActive = false;
  private disposed = false;

  constructor(options: DegreePracticeSessionOptions) {
    this.exercise = options.exercise;
    this.controller = options.controller ?? playbackController;
    this.clock = options.clock ?? browserClock;
    this.timer = options.timer ?? browserTimer;
    this.source = Object.freeze({
      kind: "practice",
      id: `degree-echo:${options.exercise.id}`,
    });
    this.state = createDegreePracticeState({
      singEnabled: options.singEnabled,
      listenLimit: Math.min(
        DEGREE_ECHO_LISTEN_LIMIT,
        options.exercise.difficulty.listenLimit,
      ),
      maximumHintLevel: options.exercise.difficulty.hintAvailability,
    });
    this.snapshot = this.createSnapshot();
  }

  getState(): DegreePracticeState {
    return this.state;
  }

  getPlaybackSource(): PlayingSource {
    return this.source;
  }

  getExercise(): PracticeExercise {
    return this.exercise;
  }

  getSnapshot(): DegreePracticeSessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  configure(): PracticeTransitionResult {
    return this.transition({ type: "CONFIGURE" });
  }

  async startListen(): Promise<PracticeTransitionResult> {
    return this.startTargetPlayback({ type: "START_LISTEN" });
  }

  async replay(): Promise<PracticeTransitionResult> {
    return this.startTargetPlayback({ type: "REPLAY" });
  }

  stopPlayback(): PracticeTransitionResult {
    if (this.disposed) {
      return { ok: true, state: this.state };
    }
    if (this.controller.isPlaying(this.source)) this.controller.stop();
    return { ok: true, state: this.state };
  }

  async playSingingReference(
    mode: SingingReferenceMode,
  ): Promise<PracticeTransitionResult> {
    if (this.disposed || this.state.status !== "recall") {
      return applicationFailure(
        "invalid-transition",
        `Singing reference is unavailable while practice is ${this.state.status}.`,
      );
    }
    const generation = this.nextPlaybackGeneration();
    await this.controller.play(
      this.source,
      degreeSingingReferencePlaybackRequest(this.exercise, mode),
      {
        onEnded: () => {
          if (this.disposed || generation !== this.playbackGeneration) return;
          this.notify();
        },
      },
    );
    return { ok: true, state: this.state };
  }

  beginSinging(): PracticeTransitionResult {
    this.stopOwnedPlayback();
    const result = this.transition({
      type: "CONTINUE_RECALL",
      nowMs: this.clock.now(),
      phraseDurationMs: degreePhraseDurationMs(this.exercise),
    });
    if (result.ok && result.state.status === "singing") {
      this.scheduleDwellNotification(result.state);
    }
    return result;
  }

  completeSinging(): PracticeTransitionResult {
    const result = this.transition({ type: "COMPLETE_SING", nowMs: this.clock.now() });
    if (result.ok) this.clearDwellTimer();
    return result;
  }

  skipSinging(): PracticeTransitionResult {
    const result = this.transition({ type: "SKIP_SING" });
    if (result.ok) this.clearDwellTimer();
    return result;
  }

  nextHint(): PracticeTransitionResult {
    return this.transition({ type: "NEXT_HINT" });
  }

  beginTransfer(exercise: PracticeExercise): PracticeTransitionResult {
    if (this.disposed || this.state.status !== "transfer-offer") {
      return applicationFailure(
        "invalid-transition",
        `Transfer is unavailable while practice is ${this.state.status}.`,
      );
    }
    if (!isValidTransferExercise(this.exercise, exercise)) {
      return applicationFailure(
        "invalid-transition",
        "Transfer exercise must use a different key with the same degree and rhythm sequence.",
      );
    }
    this.stopOwnedPlayback();
    const result = reduceDegreePractice(this.state, { type: "START_TRANSFER" });
    if (!result.ok) return result;
    this.state = result.state;
    this.exercise = exercise;
    this.source = Object.freeze({
      kind: "practice",
      id: `degree-echo:${exercise.id}`,
    });
    this.notify();
    return result;
  }

  async playTransferReference(): Promise<PracticeTransitionResult> {
    if (this.disposed || this.state.status !== "transfer") {
      return applicationFailure(
        "invalid-transition",
        `Transfer reference is unavailable while practice is ${this.state.status}.`,
      );
    }
    const generation = this.nextPlaybackGeneration();
    this.transferPlaybackActive = true;
    this.notify();
    try {
      await this.controller.play(
        this.source,
        degreeTargetPlaybackRequest(this.exercise),
        {
          onEnded: (reason) => {
            if (this.disposed || generation !== this.playbackGeneration) return;
            this.transferPlaybackActive = false;
            if (reason !== "completed") this.playbackGeneration += 1;
            this.notify();
          },
        },
      );
    } catch (error) {
      if (!this.disposed && generation === this.playbackGeneration) {
        this.transferPlaybackActive = false;
        this.notify();
      }
      throw error;
    }
    return { ok: true, state: this.state };
  }

  completeTransferUserAttempt(): PracticeTransitionResult {
    if (this.transferPlaybackActive) {
      return applicationFailure(
        "invalid-transition",
        "Stop the Transfer reference before completing the user attempt.",
      );
    }
    return this.transition({ type: "COMPLETE_TRANSFER" });
  }

  isSingingCompletionAvailable(): boolean {
    return this.state.status === "singing"
      && this.state.singGateAvailableAtMs !== undefined
      && this.clock.now() >= this.state.singGateAvailableAtMs;
  }

  transitionAction(action: Exclude<
    PracticeAction,
    | { readonly type: "CONFIGURE" }
    | { readonly type: "START_LISTEN" }
    | { readonly type: "PLAYBACK_ENDED" }
    | { readonly type: "PLAYBACK_CANCELLED" }
    | { readonly type: "REPLAY" }
    | { readonly type: "CONTINUE_RECALL" }
    | { readonly type: "COMPLETE_SING" }
    | { readonly type: "SKIP_SING" }
    | { readonly type: "NEXT_HINT" }
    | { readonly type: "ABANDON" }
  >): PracticeTransitionResult {
    return this.transition(action);
  }

  abandon(): PracticeTransitionResult {
    if (this.disposed) return { ok: true, state: this.state };
    const result = this.state.status === "completed" || this.state.status === "abandoned"
      ? { ok: true as const, state: this.state }
      : this.transition({ type: "ABANDON" });
    this.releaseResources();
    return result;
  }

  handleRouteLeave(): PracticeTransitionResult {
    return this.abandon();
  }

  handleModeLeave(): PracticeTransitionResult {
    return this.abandon();
  }

  handleAppExit(): PracticeTransitionResult {
    return this.abandon();
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.state.status !== "completed" && this.state.status !== "abandoned") {
      this.transition({ type: "ABANDON" });
    }
    this.releaseResources();
  }

  private async startTargetPlayback(
    action: Extract<PracticeAction, { readonly type: "START_LISTEN" | "REPLAY" }>,
  ): Promise<PracticeTransitionResult> {
    const result = this.transition(action);
    if (!result.ok) return result;
    const generation = this.nextPlaybackGeneration();
    try {
      await this.controller.play(
        this.source,
        degreeTargetPlaybackRequest(this.exercise),
        {
          onEnded: (reason) => {
            if (
              this.disposed
              || generation !== this.playbackGeneration
            ) return;
            if (reason !== "completed") this.playbackGeneration += 1;
            this.transition({
              type: reason === "completed" ? "PLAYBACK_ENDED" : "PLAYBACK_CANCELLED",
            });
          },
        },
      );
    } catch (error) {
      if (!this.disposed && generation === this.playbackGeneration) {
        this.transition({ type: "ABANDON" });
      }
      throw error;
    }
    if (generation !== this.playbackGeneration || result.state !== this.state) {
      return { ok: true, state: this.state };
    }
    return result;
  }

  private transition(action: PracticeAction): PracticeTransitionResult {
    if (this.disposed) {
      return applicationFailure("invalid-transition", "Practice session has been disposed.");
    }
    const result = reduceDegreePractice(this.state, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.notify();
    return result;
  }

  private nextPlaybackGeneration(): number {
    this.playbackGeneration += 1;
    return this.playbackGeneration;
  }

  private scheduleDwellNotification(state: DegreePracticeState): void {
    this.clearDwellTimer();
    const deadline = state.singGateAvailableAtMs;
    if (deadline === undefined) return;
    this.dwellTimer = this.timer.set(() => {
      this.dwellTimer = undefined;
      if (!this.disposed && this.state.status === "singing") this.notify();
    }, Math.max(0, deadline - this.clock.now()));
  }

  private clearDwellTimer(): void {
    if (this.dwellTimer === undefined) return;
    this.timer.clear(this.dwellTimer);
    this.dwellTimer = undefined;
  }

  private releaseResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playbackGeneration += 1;
    this.transferPlaybackActive = false;
    this.clearDwellTimer();
    this.stopOwnedPlayback();
    this.listeners.clear();
  }

  private stopOwnedPlayback(): void {
    if (!this.controller.isPlaying(this.source)) return;
    this.playbackGeneration += 1;
    this.controller.stop();
  }

  private notify(): void {
    this.revision += 1;
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createSnapshot(): DegreePracticeSessionSnapshot {
    return Object.freeze({
      revision: this.revision,
      state: this.state,
      exercise: this.exercise,
      transferPlaybackActive: this.transferPlaybackActive,
    });
  }
}

const browserClock: DegreePracticeClock = {
  now: () => globalThis.performance?.now() ?? Date.now(),
};

const browserTimer: DegreePracticeTimer = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function applicationFailure(
  code: "invalid-transition",
  message: string,
): PracticeTransitionResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
  });
}

function isValidTransferExercise(
  source: PracticeExercise,
  target: PracticeExercise,
): boolean {
  if (
    source.tonalContext.key === target.tonalContext.key
    || source.tonalContext.scale !== target.tonalContext.scale
    || source.targetEvents.length !== target.targetEvents.length
  ) return false;
  return source.targetEvents.every((event, index) => {
    const candidate = target.targetEvents[index];
    return candidate.degree.degree === event.degree.degree
      && candidate.degree.accidental === event.degree.accidental
      && candidate.degree.octave === event.degree.octave
      && candidate.startBeat === event.startBeat
      && candidate.durationBeats === event.durationBeats
      && candidate.velocity === event.velocity;
  });
}
