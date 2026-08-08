import * as Tone from "tone";
import type {
  ChordContextMix,
  ChordContextPlaybackDriver,
  ChordContextPlaybackLifecycle,
  ChordContextPlayer,
  ChordContextScheduledEvent,
} from "./chordContextPlayback";
import { createFreepatsBassInstrument, type BassPreviewInstrument } from "./freepatsBass";

/**
 * Browser/Tauri driver for the isolated P5.18 Chord Context engine.
 *
 * It deliberately does not use the shared chordPreview singleton: stopping a
 * practice phrase must not interrupt Chord Dojo, Vault preview, or Live MIDI.
 * Every node still ends at Tone's existing destination so the global master
 * volume remains the final volume control.
 */
export interface PreparedChordContextToneDriver extends ChordContextPlaybackDriver {
  prepare(): Promise<void>;
  dispose(): void;
}

export function createChordContextToneDriver(): PreparedChordContextToneDriver {
  let bass: BassPreviewInstrument | undefined;
  let preparePromise: Promise<void> | undefined;
  let disposed = false;

  const prepare = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error("Chord Context audio driver has been disposed."));
    if (!preparePromise) {
      preparePromise = (async () => {
        await Tone.start();
        const instrument = await createFreepatsBassInstrument("finger", { volumeDb: 0 });
        if (disposed) {
          instrument.releaseAll();
          instrument.dispose();
          throw new Error("Chord Context audio driver has been disposed.");
        }
        bass = instrument;
      })();
    }
    return preparePromise;
  };

  return {
    prepare,
    createPlayer(mix, lifecycle) {
      if (disposed || !bass) throw new Error("Chord Context audio must be prepared before playback.");
      return createTonePlayer(bass, mix, lifecycle);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bass?.releaseAll();
      bass?.dispose();
      bass = undefined;
    },
  };
}

function createTonePlayer(
  bass: BassPreviewInstrument,
  mix: ChordContextMix,
  lifecycle: ChordContextPlaybackLifecycle,
): ChordContextPlayer {
  const chordGain = new Tone.Volume(mix.chordsDb);
  const chordSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.008, decay: 0.08, sustain: 0.35, release: 0.12 },
  }).chain(chordGain, Tone.getDestination());
  const metronomeGain = new Tone.Volume(mix.metronomeDb);
  const metronome = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
  }).chain(metronomeGain, Tone.getDestination());
  const timers = new Set<ReturnType<typeof globalThis.setTimeout>>();
  let completionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let stopped = false;
  let nodesDisposed = false;
  let latestEndMs = 0;

  const clearTimers = (): void => {
    for (const timer of timers) globalThis.clearTimeout(timer);
    timers.clear();
    if (completionTimer !== undefined) globalThis.clearTimeout(completionTimer);
    completionTimer = undefined;
  };
  const release = (): void => {
    bass.releaseAll();
    chordSynth.releaseAll();
    metronome.triggerRelease();
  };
  const disposeNodes = (): void => {
    if (nodesDisposed) return;
    nodesDisposed = true;
    chordSynth.dispose();
    chordGain.dispose();
    metronome.dispose();
    metronomeGain.dispose();
  };
  const armCompletion = (): void => {
    if (completionTimer !== undefined) globalThis.clearTimeout(completionTimer);
    completionTimer = globalThis.setTimeout(() => {
      completionTimer = undefined;
      if (stopped) return;
      stopped = true;
      clearTimers();
      release();
      disposeNodes();
      lifecycle.onCompleted();
    }, Math.max(0, latestEndMs) + 32);
  };

  return {
    schedule(event) {
      if (stopped) return;
      const startDelayMs = Math.max(0, Math.round(event.timeSeconds * 1_000));
      latestEndMs = Math.max(latestEndMs, Math.ceil((event.timeSeconds + event.durationSeconds) * 1_000));
      const timer = globalThis.setTimeout(() => {
        timers.delete(timer);
        if (stopped) return;
        triggerEvent(event, bass, chordSynth, metronome);
      }, startDelayMs);
      timers.add(timer);
      armCompletion();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimers();
      release();
    },
    dispose() {
      clearTimers();
      release();
      disposeNodes();
    },
  };
}

function triggerEvent(
  event: ChordContextScheduledEvent,
  bass: BassPreviewInstrument,
  chordSynth: Tone.PolySynth<Tone.Synth>,
  metronome: Tone.Synth,
): void {
  switch (event.layer) {
    case "bass":
      bass.triggerAttackRelease(midiToNoteName(event.pitch), event.durationSeconds, undefined, event.velocity);
      return;
    case "chords":
      chordSynth.triggerAttackRelease(event.notes.map(midiToNoteName), event.durationSeconds);
      return;
    case "metronome":
      metronome.triggerAttackRelease(event.accent ? "C6" : "C5", event.durationSeconds);
      return;
  }
}

function midiToNoteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}