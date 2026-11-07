import * as Tone from "tone";
import { voiceChordForPreview } from "../domain/chordVoicing";
import type { ChordSymbol, ChordTimelineItem } from "../domain/types";
import { createFreepatsBassInstrument } from "../features/bass-practice/application/freepatsBass";
import { MAX_FADING_INSTRUMENTS, PREVIEW_STOP_FADE_SECONDS, PREVIEW_STOP_RETIRE_MS, rampOutputGain } from "./outputFade";

const bundledPianoSamples = import.meta.glob(
  "./assets/salamander-piano/*.mp3",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

export interface PreviewInstrument {
  /** Optional sustained attack for a caller that owns musical release boundaries. */
  triggerAttack?(notes: string | string[], time?: number, velocity?: number): void;
  triggerRelease?(notes: string | string[], time?: number): void;
  triggerAttackRelease(
    notes: string | string[],
    duration: number,
    time?: number,
    velocity?: number,
  ): void;
  releaseAll(time?: number): void;
  dispose(): void;
}

export type PreviewSound = "piano" | "electric-piano";

export async function createPreviewInstrument(sound: PreviewSound, output?: Tone.ToneAudioNode): Promise<PreviewInstrument> {
  return sound === "piano"
    ? createPianoInstrument(output)
    : createElectricPianoInstrument(output);
}

export type MidiPreviewSound = PreviewSound | "clean-bass" | "singing-reference" | "freepats-finger-bass" | "freepats-picked-bass";

export type PreviewEndReason = "completed" | "stopped";

export interface PreviewLifecycleCallbacks {
  onStarted?(): void;
  onEnded?(reason: PreviewEndReason): void;
}

export interface MidiPreviewNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface PreviewAudioClock {
  now(): number;
}

const PREVIEW_RELEASE_TAIL_MS = 1_100;

const PIANO_SAMPLE_FILES = {
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
let instrumentSound: MidiPreviewSound | undefined;
let instrumentHasScheduledAudioEvents = false;
const retiringInstruments = new Map<
  PreviewInstrument,
  ReturnType<typeof globalThis.setTimeout>
>();
/** The gain at the very end of each instrument's chain (after its effects): what is brought down when the instrument is stopped. */
const instrumentOutputs = new WeakMap<PreviewInstrument, Tone.Gain>();
/** Instruments that have been stopped and are fading out before they are thrown away (at most MAX_FADING_INSTRUMENTS). */
const fadingInstruments: Array<{ instrument: PreviewInstrument; timer: ReturnType<typeof globalThis.setTimeout> }> = [];
let scheduledTimers: ReturnType<typeof globalThis.setTimeout>[] = [];
let previewGeneration = 0;
let activeSession: PreviewSession | undefined;
let activeDynamicTempo: { session: PreviewSession; setBpm: (bpm: number) => void } | undefined;

interface PreviewSession {
  id: number;
  callbacks: PreviewLifecycleCallbacks;
  ended: boolean;
}

export async function previewChord(
  symbol: ChordSymbol,
  sound: PreviewSound = "electric-piano",
  callbacks: PreviewLifecycleCallbacks = {},
  explicitMidiNotes?: readonly number[],
): Promise<void> {
  const session = beginPreview(callbacks);
  const target = await preparePreviewAudio(sound, session);
  if (!target || !isActive(session)) {
    return;
  }

  const notes = (explicitMidiNotes ?? voiceChordForPreview(symbol).notes).map(midiToNoteName);
  callbacks.onStarted?.();
  target.triggerAttackRelease(notes, 1.35, undefined, 0.72);
  scheduledTimers.push(
    globalThis.setTimeout(() => finishPreview(session, "completed"), 1_350 + PREVIEW_RELEASE_TAIL_MS),
  );
}

export async function previewChordTimeline(
  timeline: readonly ChordTimelineItem[],
  bpm = 96,
  sound: PreviewSound = "electric-piano",
  callbacks: PreviewLifecycleCallbacks = {},
  beatsPerBar = 4,
  explicitMidiNotesByEventId?: Readonly<Record<string, readonly number[]>>,
): Promise<void> {
  const ordered = [...timeline].sort(
    (left, right) =>
      absoluteBeat(left.bar, left.beat, beatsPerBar) - absoluteBeat(right.bar, right.beat, beatsPerBar),
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

  const firstBeat = absoluteBeat(ordered[0].bar, ordered[0].beat, beatsPerBar);
  let completionDelayMs = 0;
  for (const item of ordered) {
    const delayMs = Math.max(
      0,
      (absoluteBeat(item.bar, item.beat, beatsPerBar) - firstBeat) * beatSeconds * 1000,
    );
    const durationSeconds = Math.max(0.4, item.durationBeats * beatSeconds * 0.9);
    completionDelayMs = Math.max(completionDelayMs, delayMs + durationSeconds * 1000);
    const explicit = item.eventId
      ? explicitMidiNotesByEventId?.[item.eventId]
      : undefined;
    const notes = (explicit ?? voiceChordForPreview(item.chord).notes).map(midiToNoteName);
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
      completionDelayMs + PREVIEW_RELEASE_TAIL_MS,
    ),
  );
}

export async function previewMidiNotes(
  notes: readonly MidiPreviewNote[],
  bpm = 96,
  sound: MidiPreviewSound = "electric-piano",
  callbacks: PreviewLifecycleCallbacks = {},
  audioClock: PreviewAudioClock = toneAudioClock,
  options: { readonly dynamicTempo?: boolean } = {},
): Promise<void> {
  const ordered = [...notes]
    .filter((note) =>
      Number.isFinite(note.startBeat)
      && Number.isFinite(note.durationBeats)
      && note.durationBeats > 0)
    .sort((left, right) =>
      left.startBeat - right.startBeat
      || left.pitch - right.pitch
      || left.durationBeats - right.durationBeats);
  const session = beginPreview(callbacks);
  if (!ordered.length) {
    finishPreview(session, "completed");
    return;
  }
  const target = await preparePreviewAudio(sound, session);
  if (!target || !isActive(session)) return;
  if (options.dynamicTempo) {
    scheduleDynamicMidiNotes(ordered, bpm, target, session, callbacks, audioClock);
    return;
  }

  const beatSeconds = 60 / Math.max(1, bpm);
  const startedAt = audioClock.now();
  const lookAheadSeconds = 1.5;
  const schedulerIntervalMs = 200;
  let nextIndex = 0;
  callbacks.onStarted?.();

  const scheduleWindow = () => {
    if (!isActive(session)) return;
    const elapsedSeconds = Math.max(0, audioClock.now() - startedAt);
    const horizonSeconds = elapsedSeconds + lookAheadSeconds;
    while (
      nextIndex < ordered.length
      && ordered[nextIndex].startBeat * beatSeconds <= horizonSeconds
    ) {
      const note = ordered[nextIndex];
      nextIndex += 1;
      target.triggerAttackRelease(
        midiToNoteName(note.pitch),
        Math.max(0.05, note.durationBeats * beatSeconds),
        startedAt + note.startBeat * beatSeconds,
        normalizeMidiVelocity(note.velocity),
      );
      instrumentHasScheduledAudioEvents = true;
    }
    if (nextIndex < ordered.length) {
      scheduledTimers.push(globalThis.setTimeout(
        scheduleWindow,
        schedulerIntervalMs,
      ));
      return;
    }
    const lastEndSeconds = ordered.reduce(
      (maximum, note) => Math.max(
        maximum,
        (note.startBeat + note.durationBeats) * beatSeconds,
      ),
      0,
    );
    scheduledTimers.push(globalThis.setTimeout(
      () => finishPreview(session, "completed"),
      Math.max(0, (startedAt + lastEndSeconds - audioClock.now()) * 1000) + PREVIEW_RELEASE_TAIL_MS,
    ));
  };
  scheduleWindow();
}

/** Text-only live BPM changes preserve the current instrument and sounding notes. */
export function setPreviewMidiNotesBpm(bpm: number): boolean {
  if (!Number.isFinite(bpm) || bpm <= 0 || !activeDynamicTempo
    || !isActive(activeDynamicTempo.session)) return false;
  activeDynamicTempo.setBpm(bpm);
  return true;
}

function scheduleDynamicMidiNotes(
  ordered: readonly MidiPreviewNote[], initialBpm: number, target: PreviewInstrument,
  session: PreviewSession, callbacks: PreviewLifecycleCallbacks, audioClock: PreviewAudioClock,
): void {
  let bpm = Math.max(1, initialBpm);
  let anchorSeconds = audioClock.now();
  let anchorBeat = 0;
  let nextIndex = 0;
  const canReleaseByNote = Boolean(target.triggerAttack && target.triggerRelease);
  const events = canReleaseByNote ? ordered.flatMap(note => [
    { beat: note.startBeat, kind: "attack" as const, note },
    { beat: note.startBeat + note.durationBeats, kind: "release" as const, note },
  ]).sort((left, right) => left.beat - right.beat
    || (left.kind === "release" ? -1 : 1) - (right.kind === "release" ? -1 : 1)
    || left.note.pitch - right.note.pitch) : ordered.map(note => ({
      beat: note.startBeat, kind: "attack" as const, note,
    }));
  const lastEndBeat = ordered.reduce((latest, note) => Math.max(latest,
    note.startBeat + note.durationBeats), 0);
  const beatAt = (seconds: number) => anchorBeat + Math.max(0, seconds - anchorSeconds) * bpm / 60;
  activeDynamicTempo = {
    session,
    setBpm(next) {
      const seconds = audioClock.now();
      anchorBeat = beatAt(seconds);
      anchorSeconds = seconds;
      bpm = Math.max(1, next);
    },
  };
  callbacks.onStarted?.();
  const scheduleWindow = () => {
    if (!isActive(session)) return;
    const seconds = audioClock.now();
    const currentBeat = beatAt(seconds);
    const horizonBeat = currentBeat + 0.09 * bpm / 60;
    while (nextIndex < events.length && events[nextIndex]!.beat <= horizonBeat) {
      const event = events[nextIndex++]!;
      const scheduledSeconds = anchorSeconds + (event.beat - anchorBeat) * 60 / bpm;
      const noteName = midiToNoteName(event.note.pitch);
      if (event.kind === "release") {
        target.triggerRelease?.(noteName, scheduledSeconds);
      } else if (canReleaseByNote) {
        target.triggerAttack?.(noteName, scheduledSeconds, normalizeMidiVelocity(event.note.velocity));
        instrumentHasScheduledAudioEvents = true;
      } else {
        target.triggerAttackRelease(noteName,
          Math.max(0.05, event.note.durationBeats * 60 / bpm), scheduledSeconds,
          normalizeMidiVelocity(event.note.velocity));
        instrumentHasScheduledAudioEvents = true;
      }
    }
    if (currentBeat >= lastEndBeat) {
      scheduledTimers.push(globalThis.setTimeout(
        () => finishPreview(session, "completed"), PREVIEW_RELEASE_TAIL_MS));
      return;
    }
    const timer = globalThis.setTimeout(() => {
      const index = scheduledTimers.indexOf(timer);
      if (index >= 0) scheduledTimers.splice(index, 1);
      scheduleWindow();
    }, 30);
    scheduledTimers.push(timer);
  };
  scheduleWindow();
}

export function stopPreview(): void {
  activeDynamicTempo = undefined;
  previewGeneration += 1;
  clearScheduledTimers();
  if (instrumentHasScheduledAudioEvents) {
    fadeOutPreviewInstrument();
  } else {
    releasePreviewInstrument();
  }
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
  if (activeDynamicTempo?.session === session) activeDynamicTempo = undefined;
  if (reason === "completed") {
    clearScheduledTimers();
    disposePreviewInstrument();
  }
  session.ended = true;
  if (activeSession === session) {
    activeSession = undefined;
  }
  session.callbacks.onEnded?.(reason);
}

function clearScheduledTimers(): void {
  for (const timer of scheduledTimers) {
    globalThis.clearTimeout(timer);
  }
  scheduledTimers = [];
}

function disposePreviewInstrument(): void {
  if (!instrument) return;
  cancelInstrumentRetirement(instrument);
  instrument.releaseAll();
  disposeWithOutput(instrument);
  instrument = undefined;
  instrumentSound = undefined;
  instrumentHasScheduledAudioEvents = false;
}

/** The instrument and the gain at the end of its chain, which this module made for it. */
function disposeWithOutput(target: PreviewInstrument): void {
  target.dispose();
  instrumentOutputs.get(target)?.dispose();
  instrumentOutputs.delete(target);
}

/**
 * A stop that has to throw the instrument away (notes are scheduled for later, and nothing but disposing cancels them) must not
 * cut a sounding note in the middle of its wave: that is heard as a click. The output gain is brought to zero over
 * PREVIEW_STOP_FADE_SECONDS, the instrument is let go of at once (the next preview starts with a new one), and a timer
 * (not the audio clock, which may have stopped) throws the old one away PREVIEW_STOP_RETIRE_MS later.
 */
function fadeOutPreviewInstrument(): void {
  if (!instrument) return;
  const retired = instrument;
  cancelInstrumentRetirement(retired);
  instrument = undefined;
  instrumentSound = undefined;
  instrumentHasScheduledAudioEvents = false;
  const output = instrumentOutputs.get(retired);
  if (!output) {
    retired.releaseAll();
    disposeWithOutput(retired);
    return;
  }
  const now = Tone.immediate();
  rampOutputGain(output, 0, now, now + PREVIEW_STOP_FADE_SECONDS, true);
  retired.releaseAll(now);
  const fading = {
    instrument: retired,
    timer: globalThis.setTimeout(() => disposeFadingInstrument(fading), PREVIEW_STOP_RETIRE_MS),
  };
  fadingInstruments.push(fading);
  // a burst of stops: only so many may be fading at once
  while (fadingInstruments.length > MAX_FADING_INSTRUMENTS) disposeFadingInstrument(fadingInstruments[0]!);
}

function disposeFadingInstrument(fading: { instrument: PreviewInstrument; timer: ReturnType<typeof globalThis.setTimeout> }): void {
  globalThis.clearTimeout(fading.timer);
  const index = fadingInstruments.indexOf(fading);
  if (index >= 0) fadingInstruments.splice(index, 1);
  disposeWithOutput(fading.instrument);
}

function releasePreviewInstrument(): void {
  if (!instrument || retiringInstruments.has(instrument)) return;
  const releasedInstrument = instrument;
  releasedInstrument.releaseAll();
  retiringInstruments.set(
    releasedInstrument,
    globalThis.setTimeout(() => {
      retiringInstruments.delete(releasedInstrument);
      disposeWithOutput(releasedInstrument);
      if (instrument === releasedInstrument) {
        instrument = undefined;
        instrumentSound = undefined;
        instrumentHasScheduledAudioEvents = false;
      }
    }, PREVIEW_RELEASE_TAIL_MS),
  );
}

function cancelInstrumentRetirement(target: PreviewInstrument): void {
  const timer = retiringInstruments.get(target);
  if (timer === undefined) return;
  globalThis.clearTimeout(timer);
  retiringInstruments.delete(target);
}

async function preparePreviewAudio(
  sound: MidiPreviewSound,
  session: PreviewSession,
): Promise<PreviewInstrument | undefined> {
  try {
    await Tone.start();
    if (!isActive(session)) {
      return undefined;
    }

    if (instrument && instrumentSound === sound && sound !== "piano") {
      cancelInstrumentRetirement(instrument);
      return instrument;
    }

    const output = new Tone.Gain(1).toDestination();
    let nextInstrument: PreviewInstrument;
    try {
      nextInstrument = sound === "piano" || sound === "electric-piano"
        ? await createPreviewInstrument(sound, output)
        : sound === "clean-bass"
          ? createCleanBassInstrument(output)
          : sound === "singing-reference"
            ? createSingingReferenceInstrument(output)
            : sound === "freepats-finger-bass"
              ? await createFreepatsBassInstrument("finger", { output })
              : sound === "freepats-picked-bass"
                ? await createFreepatsBassInstrument("pick", { output })
                : createElectricPianoInstrument(output);
    } catch (error) {
      output.dispose();
      throw error;
    }
    if (!isActive(session)) {
      nextInstrument.dispose();
      output.dispose();
      return undefined;
    }

    instrumentOutputs.set(nextInstrument, output);
    instrument = nextInstrument;
    instrumentSound = sound;
    instrumentHasScheduledAudioEvents = false;
    return instrument;
  } catch (error) {
    if (isActive(session)) {
      stopPreview();
    }
    throw error;
  }
}

// The module owns one immutable decoded sample set, not an idle instrument. A
// stopped view may finish warming it; it cannot adopt a cancelled preview session.
const PIANO_CACHE_MAX_BYTES = 50 * 1024 * 1024;
type PianoBuffers = Record<string, AudioBuffer>;
type PianoContext = ReturnType<typeof Tone.getContext>;
let pianoCache: { context: PianoContext; key: string; buffers: PianoBuffers } | undefined;
let pianoLoading: {
  context: PianoContext;
  key: string;
  result: Promise<PianoBuffers>;
  settled: Promise<void>;
} | undefined;
let pianoCacheContext: PianoContext | undefined;

function clearClosedPianoCache(): void {
  if (pianoCacheContext?.state === "closed") pianoCache = undefined;
}

async function getPianoBuffers(context: PianoContext): Promise<PianoBuffers> {
  const urls = Object.fromEntries(
    Object.entries(PIANO_SAMPLE_FILES).map(([note, fileName]) => {
      const url = bundledPianoSamples[`./assets/salamander-piano/${fileName}`];
      if (!url) {
        throw new Error(`Bundled Salamander piano sample is missing: ${fileName}`);
      }
      return [note, url];
    }),
  );
  // Vite's asset URLs include the content version in production. Context identity
  // and rate are explicit: never publish a decode from a replaced context.
  const key = JSON.stringify([context.sampleRate, urls]);
  const isCurrent = () => Tone.getContext() === context && context.state !== "closed";
  if (!isCurrent()) throw new Error("Piano audio context changed during loading.");
  if (pianoCacheContext !== context) {
    pianoCacheContext?.off("statechange", clearClosedPianoCache);
    pianoCacheContext = context;
    context.on("statechange", clearClosedPianoCache);
    pianoCache = undefined;
  }
  if (pianoCache?.context === context && pianoCache.key === key) return pianoCache.buffers;
  if (pianoLoading) {
    if (pianoLoading.context === context && pianoLoading.key === key) return pianoLoading.result;
    // decodeAudioData is not abortable. Serialize replacement/retry against the
    // actual work, including work remaining after a public timeout.
    await waitForPianoLoadRetirement(pianoLoading.settled);
    return getPianoBuffers(context);
  }
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof globalThis.setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = globalThis.setTimeout(() => {
      expired = true;
      controller.abort();
      reject(new Error("Piano samples did not load before timeout."));
    }, 6_000);
  });
  const work = (async () => {
    // allSettled prevents a failed sample from releasing the single-flight slot
    // while other decodes are still in progress.
    const results = await Promise.allSettled(Object.entries(urls).map(async ([note, url]) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Bundled piano sample could not be loaded.");
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) throw new Error("Piano sample loading cancelled.");
      return [note, await context.decodeAudioData(bytes)] as const;
    }));
    const buffers: PianoBuffers = {};
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      buffers[result.value[0]] = result.value[1];
    }
    if (expired || !isCurrent()) throw new Error("Piano audio context changed during loading.");
    const bytes = Object.values(buffers).reduce((sum, buffer) =>
      sum + buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT, 0);
    // At 48 kHz the existing assets use 47.2 MiB. Higher-rate contexts may
    // exceed the cache budget: keep legacy playback working without retaining
    // an oversized idle cache. Active Sampler memory is separately owned.
    if (bytes <= PIANO_CACHE_MAX_BYTES) pianoCache = { context, key, buffers };
    return buffers;
  })();
  const result = Promise.race([work, timeout]);
  const loading = { context, key, result, settled: Promise.resolve() };
  loading.settled = work.then(() => {}, () => {}).finally(() => {
    globalThis.clearTimeout(timer);
    if (pianoLoading === loading) pianoLoading = undefined;
  });
  pianoLoading = loading;
  return result;
}

async function waitForPianoLoadRetirement(settled: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    await Promise.race([settled, new Promise<never>((_, reject) => {
      timer = globalThis.setTimeout(() => reject(new Error("Previous piano decode did not finish before timeout.")), 6_000);
    })]);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function createPianoInstrument(output?: Tone.ToneAudioNode): Promise<PreviewInstrument> {
  const context = Tone.getContext();
  const buffers = await getPianoBuffers(context);
  if (Tone.getContext() !== context || context.state === "closed") {
    throw new Error("Piano audio context changed during loading.");
  }
  const sampler = new Tone.Sampler({
    context,
    urls: buffers,
    release: 1,
  });
  try {
    if (output) sampler.connect(output);
    else sampler.toDestination();
    return wrapInstrument(sampler);
  } catch (error) {
    sampler.dispose();
    throw error;
  }
}

function wrapInstrument(source: {
  triggerAttack?(notes: string | string[], time?: number, velocity?: number): unknown;
  triggerRelease?(notes: string | string[], time?: number): unknown;
  triggerAttackRelease(
    notes: string | string[],
    duration: number,
    time?: number,
    velocity?: number,
  ): unknown;
  releaseAll?(time?: number): unknown;
  dispose(): unknown;
}): PreviewInstrument {
  return {
    triggerAttack: source.triggerAttack ? (notes, time, velocity) => { source.triggerAttack!(notes, time, velocity); } : undefined,
    triggerRelease: source.triggerRelease ? (notes, time) => { source.triggerRelease!(notes, time); } : undefined,
    triggerAttackRelease(notes, duration, time, velocity) {
      source.triggerAttackRelease(notes, duration, time, velocity);
    },
    releaseAll(time) {
      source.releaseAll?.(time);
    },
    dispose() {
      source.dispose();
    },
  };
}

function createElectricPianoInstrument(output?: Tone.ToneAudioNode): PreviewInstrument {
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
  }).chain(highpass, saturation, lowpass, chorus, reverb, output ?? Tone.getDestination());
  synth.volume.value = -8;

  return {
    triggerAttack(notes, time, velocity) {
      synth.triggerAttack(notes, time, velocity);
    },
    triggerRelease(notes, time) {
      synth.triggerRelease(notes, time);
    },
    triggerAttackRelease(notes, duration, time, velocity) {
      synth.triggerAttackRelease(notes, duration, time, velocity);
    },
    releaseAll(time) {
      synth.releaseAll(time);
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

function createCleanBassInstrument(output?: Tone.ToneAudioNode): PreviewInstrument {
  const highpass = new Tone.Filter({ frequency: 32, type: "highpass" });
  const lowpass = new Tone.Filter({
    frequency: 1700,
    type: "lowpass",
    Q: 0.8,
    rolloff: -24,
  });
  const compressor = new Tone.Compressor({ threshold: -20, ratio: 4 });
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: 0.8,
    oscillator: { type: "sine" },
    modulation: { type: "triangle" },
    envelope: {
      attack: 0.004,
      decay: 0.18,
      sustain: 0.58,
      release: 0.22,
    },
    modulationEnvelope: {
      attack: 0.002,
      decay: 0.1,
      sustain: 0.12,
      release: 0.12,
    },
  }).chain(highpass, lowpass, compressor, output ?? Tone.getDestination());
  synth.volume.value = -6;

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
    },
  };
}

function createSingingReferenceInstrument(output?: Tone.ToneAudioNode): PreviewInstrument {
  const highpass = new Tone.Filter({ frequency: 110, type: "highpass" });
  const lowpass = new Tone.Filter({
    frequency: 4200,
    type: "lowpass",
    Q: 0.45,
    rolloff: -24,
  });
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: {
      attack: 0.025,
      decay: 0.12,
      sustain: 0.72,
      release: 0.18,
    },
  }).chain(highpass, lowpass, output ?? Tone.getDestination());
  synth.volume.value = -10;

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
    },
  };
}

function midiToNoteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pc = ((Math.trunc(note) % 12) + 12) % 12;
  const octave = Math.floor(note / 12) - 1;
  return `${names[pc]}${octave}`;
}

function normalizeMidiVelocity(value: number): number {
  return Math.max(0.05, Math.min(1, value > 1 ? value / 127 : value));
}

const toneAudioClock: PreviewAudioClock = {
  now: () => Tone.now(),
};

function absoluteBeat(bar: number, beat: number, beatsPerBar: number): number {
  return (bar - 1) * beatsPerBar + (beat - 1);
}
