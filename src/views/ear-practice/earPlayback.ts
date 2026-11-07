import * as Tone from "tone";
import type { MidiPreviewNote, MidiPreviewSound } from "../../audio/chordPreview";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import { createAudioToPerformance, type AudioToPerformance, type OutputTimestampSource } from "../../domain/earPractice/earClock";

export interface EarPlayRequest {
  /** Names what is playing for the playback controller (a new request replaces the old one). */
  id: string;
  notes: MidiPreviewNote[];
  bpm: number;
  /** The beat the sound ends at (the end of the last note). */
  endBeat: number;
  sound: MidiPreviewSound;
}

export interface EarPlayHandle {
  /**
   * When the sound begins and ends, as `performance.now()` times (the clock the keys are measured in).
   * `undefined` when it could not be played.
   */
  started: Promise<{ startPerfMs: number; endPerfMs: number } | undefined>;
  ended: Promise<"completed" | "stopped" | "replaced">;
}

export interface EarPlayback {
  play(request: EarPlayRequest): EarPlayHandle;
  stop(): void;
}

export interface EarPlaybackDeps {
  controller?: Pick<PlaybackController, "play" | "stop">;
  /** The audio context's time of the beat 0 of what has just begun to play (seconds). */
  contextNow?: () => number;
  clockSource?: () => OutputTimestampSource;
  /** Called with each new reading of the clock (for the development display). */
  onClock?: (clock: AudioToPerformance) => void;
}

function toneSource(): OutputTimestampSource {
  return Tone.getContext().rawContext as unknown as OutputTimestampSource;
}

/**
 * Plays notes through the app's playback controller, and says when the sound will end in the clock the keys are
 * measured in. The end is computed from the audio time (start + length), not taken from `onended`.
 */
export function createEarPlayback(deps: EarPlaybackDeps = {}): EarPlayback {
  const controller = deps.controller ?? playbackController;
  const contextNow = deps.contextNow ?? (() => Tone.now());
  const clockSource = deps.clockSource ?? toneSource;
  return {
    play(request) {
      let resolveStarted!: (value: { startPerfMs: number; endPerfMs: number } | undefined) => void;
      let resolveEnded!: (value: "completed" | "stopped" | "replaced") => void;
      const started = new Promise<{ startPerfMs: number; endPerfMs: number } | undefined>((resolve) => { resolveStarted = resolve; });
      const ended = new Promise<"completed" | "stopped" | "replaced">((resolve) => { resolveEnded = resolve; });
      controller.play(
        { kind: "practice", id: request.id },
        { type: "notes", notes: request.notes, bpm: request.bpm, sound: request.sound },
        {
          onStarted() {
            // `onStarted` is called as the notes are scheduled: this is the audio time of beat 0.
            const contextStart = contextNow();
            void createAudioToPerformance(clockSource()).then((clock) => {
              deps.onClock?.(clock);
              resolveStarted({
                startPerfMs: clock.toPerformanceMs(contextStart),
                endPerfMs: clock.toPerformanceMs(contextStart + request.endBeat * 60 / request.bpm),
              });
            }, () => resolveStarted(undefined));
          },
          onEnded(reason) {
            resolveStarted(undefined);
            resolveEnded(reason);
          },
        },
      ).catch(() => {
        resolveStarted(undefined);
        resolveEnded("stopped");
      });
      return { started, ended };
    },
    stop() {
      controller.stop();
    },
  };
}
