import {
  previewChord,
  previewChordTimeline,
  stopPreview,
  type PreviewLifecycleCallbacks,
  type PreviewSound,
} from "./chordPreview";
import type { ChordSymbol, ChordTimelineItem } from "../domain/types";

export type PlaybackSourceKind = "home" | "capture" | "vault" | "detail";

export interface PlayingSource {
  kind: PlaybackSourceKind;
  id: string;
}

export type PlaybackRequest =
  | {
      type: "chord";
      chord: ChordSymbol;
      sound?: PreviewSound;
    }
  | {
      type: "timeline";
      timeline: readonly ChordTimelineItem[];
      bpm?: number;
      sound?: PreviewSound;
      beatsPerBar?: number;
    };

export type PlaybackStatus = "idle" | "starting" | "playing";

export interface PlaybackState {
  status: PlaybackStatus;
  source?: PlayingSource;
  request?: PlaybackRequest;
  startedAt?: number;
}

export interface PlaybackController {
  getState(): PlaybackState;
  play(source: PlayingSource, request: PlaybackRequest): Promise<void>;
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
  ): Promise<void>;
  playTimeline(
    timeline: readonly ChordTimelineItem[],
    bpm: number | undefined,
    sound: PreviewSound | undefined,
    callbacks: PreviewLifecycleCallbacks,
    beatsPerBar?: number,
  ): Promise<void>;
  stop(): void;
}

const idleState: PlaybackState = { status: "idle" };

const defaultAudioDriver: PlaybackAudioDriver = {
  playChord(chord, sound, callbacks) {
    return previewChord(chord, sound, callbacks);
  },
  playTimeline(timeline, bpm, sound, callbacks, beatsPerBar) {
    return previewChordTimeline(timeline, bpm, sound, callbacks, beatsPerBar);
  },
  stop: stopPreview,
};

export function createPlaybackController(
  driver: PlaybackAudioDriver = defaultAudioDriver,
  now: () => number = defaultNow,
): PlaybackController {
  let state = idleState;
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: PlaybackState): void {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function stop(): void {
    generation += 1;
    driver.stop();
    setState(idleState);
  }

  async function play(
    source: PlayingSource,
    request: PlaybackRequest,
  ): Promise<void> {
    const requestGeneration = generation + 1;
    generation = requestGeneration;
    driver.stop();
    setState({ status: "starting", source, request });

    const callbacks: PreviewLifecycleCallbacks = {
      onStarted() {
        if (generation !== requestGeneration) return;
        setState({ status: "playing", source, request, startedAt: now() });
      },
      onEnded() {
        if (generation !== requestGeneration) return;
        generation += 1;
        setState(idleState);
      },
    };

    try {
      if (request.type === "chord") {
        await driver.playChord(request.chord, request.sound, callbacks);
      } else {
        if (request.beatsPerBar === undefined) {
          await driver.playTimeline(request.timeline, request.bpm, request.sound, callbacks);
        } else {
          await driver.playTimeline(
            request.timeline,
            request.bpm,
            request.sound,
            callbacks,
            request.beatsPerBar,
          );
        }
      }
    } catch (error) {
      if (generation !== requestGeneration) return;

      generation += 1;
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
