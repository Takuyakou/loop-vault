import {
  createRecorderState,
  reduceRecorder,
  type RecorderAction,
  type RecorderState,
} from "../domain/recorderStateMachine";
import { resolveChannel, type AutoResolution } from "../domain/channelRouting";
import type { ChannelMode, ResolvedChannel } from "../domain/types";
import type {
  CaptureDeviceRepository,
  KeepContext,
  PracticeRecorder,
  RecordingCapability,
  RecordingTake,
  RecordingTakeRepository,
} from "./ports";

/**
 * Orchestrates the recorder state machine and the ports (brief §11.1). The UI
 * calls these intents; the controller drives the reducer, invokes the recorder
 * and repository, and — crucially — releases capture resources on every exit
 * (retake, discard, error, dispose) so repeated re-records never leak.
 *
 * A recording failure disables only recording; it never abandons the Practice
 * session (that concern lives in the session reducer, wired in P5.17-02).
 */

export interface RecordingControllerDeps {
  readonly capability: RecordingCapability;
  readonly devices: CaptureDeviceRepository;
  readonly recorder: PracticeRecorder;
  readonly takes: RecordingTakeRepository;
}

export class RecordingSessionController {
  private state: RecorderState;
  private readonly listeners = new Set<(state: RecorderState) => void>();
  private pendingTake?: RecordingTake;
  /** Invalidates delayed recorder starts after Stop/cancel/device teardown. */
  private captureGeneration = 0;
  private unsubscribeDevices?: () => void;

  constructor(private readonly deps: RecordingControllerDeps, channelMode: ChannelMode = "auto") {
    this.state = createRecorderState(channelMode);
  }

  getState(): RecorderState {
    return this.state;
  }

  /** The current ephemeral take (for Listen Back), if one exists. */
  currentTake(): RecordingTake | undefined {
    return this.pendingTake;
  }

  subscribe(listener: (state: RecorderState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  probe(): RecorderState {
    const report = this.deps.capability.probe();
    return this.dispatch({ type: "PROBE", available: report.available });
  }

  setChannel(channelMode: ChannelMode): RecorderState {
    return this.dispatch({ type: "SET_CHANNEL", channelMode });
  }

  /** Requests permission — only invoked when the user turns recording on. */
  async enableRecording(): Promise<RecorderState> {
    this.dispatch({ type: "REQUEST_PERMISSION" });
    const permission = await this.deps.devices.requestPermission();
    if (permission !== "granted") {
      return this.dispatch({ type: "PERMISSION_DENIED" });
    }
    const devices = await this.deps.devices.listDevices();
    this.watchDeviceChanges();
    return this.dispatch({ type: "PERMISSION_GRANTED", hasDevice: devices.length > 0 });
  }

  startCountIn(): RecorderState {
    return this.dispatch({ type: "START_COUNT_IN" });
  }

  cancelCountIn(): RecorderState {
    this.captureGeneration += 1;
    return this.dispatch({ type: "CANCEL_COUNT_IN" });
  }

  /**
   * Count-in has elapsed: resolve the channel, start the recorder and enter
   * `recording`. On a start failure the recorder is disposed and the machine
   * moves to `error` without touching the Practice session.
   */
  async beginRecording(options: {
    readonly mimeType: string;
    readonly deviceId?: string;
    readonly autoResolution?: AutoResolution;
  }): Promise<RecorderState> {
    this.dispatch({ type: "COUNT_IN_ELAPSED" });
    const generation = this.captureGeneration + 1;
    this.captureGeneration = generation;
    const resolved = resolveChannel(this.state.channelMode, options.autoResolution);
    if (!resolved) {
      // Auto could not decide; surface as a recorder error so the UI re-picks.
      this.deps.recorder.dispose();
      return this.dispatch({ type: "RECORDER_ERROR", errorCode: "device-missing" });
    }
    try {
      await this.deps.recorder.start({
        deviceId: options.deviceId,
        channelMode: this.state.channelMode,
        resolvedChannel: resolved as ResolvedChannel,
        mimeType: options.mimeType,
      });
    } catch {
      this.deps.recorder.dispose();
      if (generation !== this.captureGeneration || this.state.status !== "starting") return this.state;
      return this.dispatch({ type: "RECORDER_ERROR", errorCode: "recorder-error" });
    }
    if (generation !== this.captureGeneration || this.state.status !== "starting") {
      this.deps.recorder.dispose();
      return this.state;
    }
    return this.dispatch({ type: "RECORDER_STARTED" });
  }

  async stop(): Promise<RecorderState> {
    const wasStarting = this.state.status === "starting";
    this.captureGeneration += 1;
    this.dispatch({ type: "STOP" });
    if (wasStarting) {
      // A delayed getUserMedia/MediaRecorder start may still resolve. The
      // generation check in beginRecording will dispose it before it can enter
      // recording or create a phantom take.
      this.pendingTake = undefined;
      this.deps.recorder.dispose();
      return this.dispatch({ type: "RECORDER_STOPPED" });
    }
    let take: RecordingTake | undefined;
    try {
      take = await this.deps.recorder.stop();
    } catch {
      this.deps.recorder.dispose();
      return this.dispatch({ type: "RECORDER_ERROR", errorCode: "blob-error" });
    }
    this.deps.recorder.dispose(); // capture graph released once stopped
    this.pendingTake = take;
    return this.dispatch({ type: "RECORDER_STOPPED", take: take?.metadata });
  }

  playTarget(): RecorderState {
    return this.dispatch({ type: "PLAY_TARGET" });
  }
  playTake(): RecorderState {
    return this.dispatch({ type: "PLAY_TAKE" });
  }
  playbackEnded(): RecorderState {
    return this.dispatch({ type: "PLAYBACK_ENDED" });
  }

  retake(): RecorderState {
    this.dropPendingTake();
    this.deps.recorder.dispose();
    return this.dispatch({ type: "RETAKE" });
  }

  discard(): RecorderState {
    this.dropPendingTake();
    this.deps.recorder.dispose();
    return this.dispatch({ type: "DISCARD" });
  }

  async keep(context?: KeepContext): Promise<{ readonly state: RecorderState; readonly id?: string }> {
    this.dispatch({ type: "KEEP" });
    if (!this.pendingTake) {
      return { state: this.dispatch({ type: "SAVE_FAILED", errorCode: "save-failed" }) };
    }
    try {
      const id = await this.deps.takes.keep(this.pendingTake, context);
      return { state: this.dispatch({ type: "SAVED" }), id };
    } catch {
      // Save failure keeps the ephemeral take playable (contract 02).
      return { state: this.dispatch({ type: "SAVE_FAILED", errorCode: "save-failed" }) };
    }
  }

  deviceDisconnected(): RecorderState {
    this.captureGeneration += 1;
    this.deps.recorder.dispose();
    return this.dispatch({ type: "DEVICE_DISCONNECTED" });
  }
  permissionRevoked(): RecorderState {
    this.captureGeneration += 1;
    this.deps.recorder.dispose();
    return this.dispatch({ type: "PERMISSION_REVOKED" });
  }

  /** Full teardown: feature-flag OFF, unmount, route leave. */
  dispose(): RecorderState {
    this.captureGeneration += 1;
    this.dropPendingTake();
    this.deps.recorder.dispose();
    this.unsubscribeDevices?.();
    this.unsubscribeDevices = undefined;
    return this.dispatch({ type: "RESET" });
  }

  private watchDeviceChanges(): void {
    this.unsubscribeDevices?.();
    this.unsubscribeDevices = this.deps.devices.onDeviceChange(() => {
      void this.deps.devices.listDevices().then((devices) => {
        if (devices.length === 0 && (this.state.status === "ready" || this.state.status === "counting-in")) {
          this.dispatch({ type: "DEVICE_DISCONNECTED" });
        }
      });
    });
  }

  private dropPendingTake(): void {
    this.pendingTake = undefined;
  }

  private dispatch(action: RecorderAction): RecorderState {
    const result = reduceRecorder(this.state, action);
    if (!result.ok) {
      // Controller intents should only issue valid transitions; make a bug loud.
      throw new Error(`Recorder rejected ${action.type}: ${result.error.message}`);
    }
    this.state = result.state;
    for (const listener of this.listeners) listener(this.state);
    return this.state;
  }
}
