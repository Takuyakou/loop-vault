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

export type PreviewEndReason = "completed" | "stopped";

export interface PreviewLifecycleCallbacks {
  onStarted?(): void;
  onEnded?(reason: PreviewEndReason): void;
}

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
let scheduledTimers: ReturnType<typeof globalThis.setTimeout>[] = [];
let previewGeneration = 0;
let activeSession: PreviewSession | undefined;

interface PreviewSession {
  id: number;
  callbacks: PreviewLifecycleCallbacks;
  ended: boolean;
}

export async function previewChord(
  symbol: ChordSymbol,
  sound: PreviewSound = "electric-piano",
  callbacks: PreviewLifecycleCallbacks = {},
): Promise<void> {
  const session = beginPreview(callbacks);
  const target = await preparePreviewAudio(sound, session);
  if (!target || !isActive(session)) {
    return;
  }

  const notes = voiceChordForPreview(symbol).notes.map(midiToNoteName);
  callbacks.onStarted?.();
  target.triggerAttackRelease(notes, 1.35, undefined, 0.72);
  scheduledTimers.push(
    globalThis.setTimeout(() => finishPreview(session, "completed"), 1_350),
  );
}

export async function previewChordTimeline(
  timeline: readonly ChordTimelineItem[],
  bpm = 96,
  sound: PreviewSound = "electric-piano",
  callbacks: PreviewLifecycleCallbacks = {},
): Promise<void> {
  const ordered = [...timeline].sort(
    (left, right) =>
      absoluteBeat(left.bar, left.beat) - absoluteBeat(right.bar, right.beat),
  );
  const session = beginPreview(callbacks);
  if (ordered.length === 0) {
    finishPreview(session, "completed");
    return;
  }

  const target = await preparePreviewAudio(sound, session);
  if (!target || !isActive(session)) {
    return;
  }

  const beatSeconds = 60 / bpm;
  callbacks.onStarted?.();

  const firstBeat = absoluteBeat(ordered[0].bar, ordered[0].beat);
  let completionDelayMs = 0;
  for (const item of ordered) {
    const delayMs = Math.max(
      0,
      (absoluteBeat(item.bar, item.beat) - firstBeat) * beatSeconds * 1000,
    );
    const durationSeconds = Math.max(0.4, item.durationBeats * beatSeconds * 0.9);
    completionDelayMs = Math.max(completionDelayMs, delayMs + durationSeconds * 1000);
    const notes = voiceChordForPreview(item.chord).notes.map(midiToNoteName);
    scheduledTimers.push(
      globalThis.setTimeout(() => {
        if (isActive(session)) {
          target.triggerAttackRelease(notes, durationSeconds, undefined, 0.7);
        }
      }, delayMs),
    );
  }
  scheduledTimers.push(
    globalThis.setTimeout(
      () => finishPreview(session, "completed"),
      completionDelayMs,
    ),
  );
}

export function stopPreview(): void {
  previewGeneration += 1;
  for (const timer of scheduledTimers) {
    globalThis.clearTimeout(timer);
  }
  scheduledTimers = [];
  instrument?.releaseAll();
  if (activeSession) {
    finishPreview(activeSession, "stopped", true);
  }
}

function beginPreview(callbacks: PreviewLifecycleCallbacks): PreviewSession {
  stopPreview();
  const session = { id: previewGeneration, callbacks, ended: false };
  activeSession = session;
  return session;
}

function isActive(session: PreviewSession): boolean {
  return activeSession === session
    && previewGeneration === session.id
    && !session.ended;
}

function finishPreview(
  session: PreviewSession,
  reason: PreviewEndReason,
  forced = false,
): void {
  if (session.ended || (!forced && !isActive(session))) {
    return;
  }
  session.ended = true;
  if (activeSession === session) {
    activeSession = undefined;
  }
  session.callbacks.onEnded?.(reason);
}

async function preparePreviewAudio(
  sound: PreviewSound,
  session: PreviewSession,
): Promise<PreviewInstrument | undefined> {
  try {
    await Tone.start();
    if (!isActive(session)) {
      return undefined;
    }

    if (instrument && instrumentSound === sound) {
      return instrument;
    }

    const nextInstrument = sound === "piano"
      ? await createPianoInstrument()
      : createElectricPianoInstrument();
    if (!isActive(session)) {
      nextInstrument.dispose();
      return undefined;
    }

    instrument?.dispose();
    instrument = nextInstrument;
    instrumentSound = sound;
    return instrument;
  } catch (error) {
    if (isActive(session)) {
      stopPreview();
    }
    throw error;
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
