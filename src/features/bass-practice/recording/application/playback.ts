import type { RecordingTake } from "./ports";

/**
 * Listen Back playback (P5.17-02). Target and My Take are played through small
 * injectable players so the section never depends on jsdom audio in tests and so
 * each mode can supply its own Target synth. Target and My Take never play at
 * once — the section stops one before starting the other (contract 01).
 */

export interface PlaybackHandle {
  stop(): void;
}

/** Plays the exercise Target; each mode builds one from its own primitives. */
export interface TargetPlayer {
  play(onEnded: () => void): PlaybackHandle;
}

/** Plays a recorded take back. */
export interface TakePlayer {
  play(take: RecordingTake, onEnded: () => void): PlaybackHandle;
}

/**
 * Builds a TargetPlayer from a start/stop pair, so all three modes can wire
 * their existing synth (e.g. `previewMidiNotes`/`stopPreview`) as the Target.
 */
export function createTargetPlayer(
  start: (onEnded: () => void) => void,
  stop: () => void,
): TargetPlayer {
  return {
    play(onEnded) {
      start(onEnded);
      return { stop };
    },
  };
}

/** Browser take playback via an Audio element and an object URL that is revoked. */
export class BrowserTakePlayer implements TakePlayer {
  play(take: RecordingTake, onEnded: () => void): PlaybackHandle {
    const blob = take.data instanceof Blob
      ? take.data
      : new Blob([take.data as BlobPart], { type: take.metadata.mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      URL.revokeObjectURL(url);
    };
    audio.onended = () => {
      release();
      onEnded();
    };
    void audio.play().catch(() => {
      release();
      onEnded();
    });
    return {
      stop() {
        audio.pause();
        release();
      },
    };
  }
}

/** Deterministic player for tests: onEnded fires only when `end()` is called. */
export class FakePlayer implements TargetPlayer, TakePlayer {
  playing = false;
  stopCount = 0;
  private ended?: () => void;

  play(_takeOrEnded?: unknown, maybeEnded?: () => void): PlaybackHandle {
    // Supports both TargetPlayer.play(onEnded) and TakePlayer.play(take, onEnded).
    const onEnded = typeof _takeOrEnded === "function"
      ? (_takeOrEnded as () => void)
      : maybeEnded;
    this.playing = true;
    this.ended = onEnded;
    return {
      stop: () => {
        this.stopCount += 1;
        this.playing = false;
      },
    };
  }

  /** Test helper: complete the current playback. */
  end(): void {
    this.playing = false;
    this.ended?.();
  }
}
