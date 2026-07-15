import * as Tone from "tone";
import { voiceChordForPreview } from "../domain/chordVoicing";
import type { ChordSymbol, ChordTimelineItem } from "../domain/types";

interface PreviewInstrument {
  triggerAttackRelease(
    notes: string | string[],
    duration: number,
    time?: number,
    velocity?: number,
  ): void;
  releaseAll(): void;
  dispose(): void;
}

export type PreviewSound = "piano" | "electric-piano";

const PIANO_SAMPLE_URLS = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  C2: "C2.mp3",
  C3: "C3.mp3",
  C4: "C4.mp3",
  C5: "C5.mp3",
  C6: "C6.mp3",
  C7: "C7.mp3",
} as const;

let instrument: PreviewInstrument | undefined;
let instrumentSound: PreviewSound | undefined;
let scheduledTimers: number[] = [];

export async function previewChord(
  symbol: ChordSymbol,
  sound: PreviewSound = "electric-piano",
): Promise<void> {
  stopPreview();
  await startPreviewAudio(sound);
  const notes = voiceChordForPreview(symbol).notes.map(midiToNoteName);
  instrument?.triggerAttackRelease(notes, 1.35, undefined, 0.72);
}

export async function previewChordTimeline(
  timeline: readonly ChordTimelineItem[],
  bpm = 96,
  sound: PreviewSound = "electric-piano",
): Promise<void> {
  stopPreview();
  await startPreviewAudio(sound);

  const beatSeconds = 60 / bpm;
  const ordered = [...timeline].sort(
    (left, right) =>
      absoluteBeat(left.bar, left.beat) - absoluteBeat(right.bar, right.beat),
  );
  if (ordered.length === 0) {
    return;
  }

  const firstBeat = absoluteBeat(ordered[0].bar, ordered[0].beat);
  for (const item of ordered) {
    const delayMs = Math.max(
      0,
      (absoluteBeat(item.bar, item.beat) - firstBeat) * beatSeconds * 1000,
    );
    const durationSeconds = Math.max(0.4, item.durationBeats * beatSeconds * 0.9);
    const notes = voiceChordForPreview(item.chord).notes.map(midiToNoteName);
    scheduledTimers.push(
      window.setTimeout(() => {
        instrument?.triggerAttackRelease(notes, durationSeconds, undefined, 0.7);
      }, delayMs),
    );
  }
}

export function stopPreview(): void {
  for (const timer of scheduledTimers) {
    window.clearTimeout(timer);
  }
  scheduledTimers = [];
  instrument?.releaseAll();
}

async function startPreviewAudio(sound: PreviewSound): Promise<void> {
  await Tone.start();
  if (instrument && instrumentSound !== sound) {
    instrument.dispose();
    instrument = undefined;
  }

  if (!instrument) {
    instrument = sound === "piano"
      ? await createPianoInstrument()
      : createElectricPianoInstrument();
    instrumentSound = sound;
  }
}

async function createPianoInstrument(): Promise<PreviewInstrument> {
  const sampler = new Tone.Sampler({
    urls: PIANO_SAMPLE_URLS,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    release: 1,
  }).toDestination();

  try {
    await waitForPianoSamples(6_000);
    return wrapInstrument(sampler);
  } catch {
    sampler.dispose();
    return createPianoFallbackInstrument();
  }
}

function createPianoFallbackInstrument(): PreviewInstrument {
  const highpass = new Tone.Filter({ frequency: 55, type: "highpass" });
  const lowpass = new Tone.Filter({
    frequency: 5200,
    type: "lowpass",
    Q: 0.5,
    rolloff: -24,
  });
  const compressor = new Tone.Compressor({ threshold: -18, ratio: 3 });
  const reverb = new Tone.Freeverb(0.18, 3200);
  reverb.wet.value = 0.1;

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: {
      attack: 0.003,
      decay: 1.25,
      sustain: 0.05,
      release: 0.8,
    },
  }).chain(highpass, lowpass, compressor, reverb, Tone.getDestination());
  synth.volume.value = -7;

  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      synth.triggerAttackRelease(notes, duration, time, velocity);
    },
    releaseAll() {
      synth.releaseAll();
    },
    dispose() {
      synth.dispose();
      highpass.dispose();
      lowpass.dispose();
      compressor.dispose();
      reverb.dispose();
    },
  };
}

function wrapInstrument(source: {
  triggerAttackRelease(
    notes: string | string[],
    duration: number,
    time?: number,
    velocity?: number,
  ): unknown;
  releaseAll?(): unknown;
  dispose(): unknown;
}): PreviewInstrument {
  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      source.triggerAttackRelease(notes, duration, time, velocity);
    },
    releaseAll() {
      source.releaseAll?.();
    },
    dispose() {
      source.dispose();
    },
  };
}

function waitForPianoSamples(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(new Error("Piano samples did not load before timeout."));
    }, timeoutMs);

    Tone.loaded().then(
      () => {
        globalThis.clearTimeout(timeout);
        resolve();
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createElectricPianoInstrument(): PreviewInstrument {
  const highpass = new Tone.Filter({ frequency: 75, type: "highpass" });
  const lowpass = new Tone.Filter({
    frequency: 3200,
    type: "lowpass",
    Q: 0.7,
    rolloff: -24,
  });
  const saturation = new Tone.Chebyshev(2);
  saturation.wet.value = 0.12;
  const chorus = new Tone.Chorus(0.7, 3.5, 0.45);
  chorus.wet.value = 0.2;
  chorus.start();
  const reverb = new Tone.Freeverb(0.22, 2800);
  reverb.wet.value = 0.12;

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: 1.8,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: {
      attack: 0.006,
      decay: 1,
      sustain: 0.2,
      release: 1,
    },
    modulationEnvelope: {
      attack: 0.006,
      decay: 0.15,
      sustain: 0.04,
      release: 0.25,
    },
  }).chain(highpass, saturation, lowpass, chorus, reverb, Tone.getDestination());
  synth.volume.value = -8;

  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      synth.triggerAttackRelease(notes, duration, time, velocity);
    },
    releaseAll() {
      synth.releaseAll();
    },
    dispose() {
      synth.dispose();
      highpass.dispose();
      lowpass.dispose();
      saturation.dispose();
      chorus.dispose();
      reverb.dispose();
    },
  };
}

function midiToNoteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pc = ((Math.trunc(note) % 12) + 12) % 12;
  const octave = Math.floor(note / 12) - 1;
  return `${names[pc]}${octave}`;
}

function absoluteBeat(bar: number, beat: number): number {
  return (bar - 1) * 4 + (beat - 1);
}
