import {
  previewChord,
  previewChordTimeline,
  previewMidiNotes,
  stopPreview,
  type MidiPreviewNote,
  type MidiPreviewSound,
  type PreviewLifecycleCallbacks,
  type PreviewSound,
} from "./chordPreview";
import type { ChordSymbol, ChordTimelineItem } from "../domain/types";

export type PlaybackSourceKind = "home" | "capture" | "vault" | "detail" | "practice";

export interface PlayingSource {
  kind: PlaybackSourceKind;
  id: string;
}

export type PlaybackRequest =
  | {
      type: "chord";
      chord: ChordSymbol;
      sound?: PreviewSound;
      explicitMidiNotes?: readonly number[];
    }
  | {
      type: "timeline";
      timeline: readonly ChordTimelineItem[];
      bpm?: number;
      sound?: PreviewSound;
      beatsPerBar?: number;
      explicitMidiNotesByEventId?: Readonly<Record<string, readonly number[]>>;
    }
  | {
      type: "notes";
      notes: readonly MidiPreviewNote[];
      bpm: number;
      sound: MidiPreviewSound;
    };

export interface PlaybackLifecycleCallbacks {
  onStarted?(): void;
  onEnded?(reason: PlaybackEndReason): void;
}

export type PlaybackEndReason = "completed" | "stopped" | "replaced";

export type PlaybackStatus = "idle" | "starting" | "playing";

export interface PlaybackState {
  status: PlaybackStatus;
  source?: PlayingSource;
  request?: PlaybackRequest;
  startedAt?: number;
}

export interface PlaybackController {
  getState(): PlaybackState;
  play(
    source: PlayingSource,
    request: PlaybackRequest,
    lifecycle?: PlaybackLifecycleCallbacks,
  ): Promise<void>;
  stop(): void;
  toggle(source: PlayingSource, request: PlaybackRequest): Promise<void>;
  isPlaying(source: PlayingSource): boolean;
  subscribe(listener: () => void): () => void;
}

export interface PlaybackAudioDriver {
  playChord(
    chord: ChordSymbol,
    sound: PreviewSound | undefined,
    callbacks: PreviewLifecycleCallbacks,
    explicitMidiNotes?: readonly number[],
  ): Promise<void>;
  playTimeline(
    timeline: readonly ChordTimelineItem[],
    bpm: number | undefined,
    sound: PreviewSound | undefined,
    callbacks: PreviewLifecycleCallbacks,
    beatsPerBar?: number,
    explicitMidiNotesByEventId?: Readonly<Record<string, readonly number[]>>,
  ): Promise<void>;
  playNotes?(
    notes: readonly MidiPreviewNote[],
    bpm: number,
    sound: MidiPreviewSound,
    callbacks: PreviewLifecycleCallbacks,
  ): Promise<void>;
  stop(): void;
}

const idleState: PlaybackState = { status: "idle" };

const defaultAudioDriver: PlaybackAudioDriver = {
  playChord(chord, sound, callbacks, explicitMidiNotes) {
    return previewChord(chord, sound, callbacks, explicitMidiNotes);
  },
  playTimeline(timeline, bpm, sound, callbacks, beatsPerBar, explicitMidiNotesByEventId) {
    return previewChordTimeline(
      timeline,
      bpm,
      sound,
      callbacks,
      beatsPerBar,
      explicitMidiNotesByEventId,
    );
  },
  playNotes(notes, bpm, sound, callbacks) {
    return previewMidiNotes(notes, bpm, sound, callbacks);
  },
  stop: stopPreview,
};

export function createPlaybackController(
  driver: PlaybackAudioDriver = defaultAudioDriver,
  now: () => number = defaultNow,
): PlaybackController {
  let state = idleState;
  let generation = 0;
  let activeLifecycle: {
    readonly generation: number;
    readonly callbacks: PlaybackLifecycleCallbacks;
  } | undefined;
  const listeners = new Set<() => void>();

  function setState(next: PlaybackState): void {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function stop(): void {
    cancelActivePlayback("stopped");
  }

  function cancelActivePlayback(reason: "stopped" | "replaced"): void {
    generation += 1;
    const outgoing = activeLifecycle;
    activeLifecycle = undefined;
    driver.stop();
    setState(idleState);
    outgoing?.callbacks.onEnded?.(reason);
  }

  async function play(
    source: PlayingSource,
    request: PlaybackRequest,
    lifecycle: PlaybackLifecycleCallbacks = {},
  ): Promise<void> {
    cancelActivePlayback("replaced");
    const requestGeneration = generation + 1;
    generation = requestGeneration;
    activeLifecycle = { generation: requestGeneration, callbacks: lifecycle };
    setState({ status: "starting", source, request });

    const callbacks: PreviewLifecycleCallbacks = {
      onStarted() {
        if (generation !== requestGeneration) return;
        setState({ status: "playing", source, request, startedAt: now() });
        lifecycle.onStarted?.();
      },
      onEnded(reason) {
        if (
          generation !== requestGeneration
          || activeLifecycle?.generation !== requestGeneration
        ) return;
        generation += 1;
        const completed = activeLifecycle;
        activeLifecycle = undefined;
        setState(idleState);
        completed.callbacks.onEnded?.(reason);
      },
    };

    try {
      if (request.type === "chord") {
        if (request.explicitMidiNotes === undefined) {
          await driver.playChord(request.chord, request.sound, callbacks);
        } else {
          await driver.playChord(
            request.chord,
            request.sound,
            callbacks,
            request.explicitMidiNotes,
          );
        }
      } else if (request.type === "timeline") {
        if (request.beatsPerBar === undefined) {
          if (request.explicitMidiNotesByEventId === undefined) {
            await driver.playTimeline(request.timeline, request.bpm, request.sound, callbacks);
          } else {
            await driver.playTimeline(
              request.timeline,
              request.bpm,
              request.sound,
              callbacks,
              undefined,
              request.explicitMidiNotesByEventId,
            );
          }
        } else {
          if (request.explicitMidiNotesByEventId === undefined) {
            await driver.playTimeline(
              request.timeline,
              request.bpm,
              request.sound,
              callbacks,
              request.beatsPerBar,
            );
          } else {
            await driver.playTimeline(
              request.timeline,
              request.bpm,
              request.sound,
              callbacks,
              request.beatsPerBar,
              request.explicitMidiNotesByEventId,
            );
          }
        }
      } else {
        if (!driver.playNotes) {
          throw new Error("The playback driver does not support note-event requests.");
        }
        await driver.playNotes(request.notes, request.bpm, request.sound, callbacks);
      }
    } catch (error) {
      if (generation !== requestGeneration) return;

      generation += 1;
      activeLifecycle = undefined;
      driver.stop();
      setState(idleState);
      throw error;
    }
  }

  return {
    getState: () => state,
    play,
    stop,
    async toggle(source, request) {
      if (state.status !== "idle" && samePlaybackSource(state.source, source)) {
        stop();
        return;
      }
      await play(source, request);
    },
    isPlaying(source) {
      return state.status !== "idle" && samePlaybackSource(state.source, source);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function samePlaybackSource(
  left: PlayingSource | undefined,
  right: PlayingSource | undefined,
): boolean {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id);
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export const playbackController = createPlaybackController();
