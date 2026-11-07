import * as Tone from "tone";
import {
  createPreviewInstrument,
  previewChord,
  previewMidiNotes,
  stopPreview,
  type MidiPreviewSound,
} from "../audio/chordPreview";

/**
 * A measuring bench for the preview audio (e2e build only, `?previewfade`): it records what the preview sends to the speakers,
 * through an audio worklet that sees every sample in order, and reports how big the jump between neighbouring samples is
 * around the moment a preview is stopped. Never part of a production build.
 */
export interface ClickMetrics {
  sound: string;
  scenario: string;
  sampleRate: number;
  trials: number;
  /** The biggest difference between two neighbouring samples from 1 ms before the stop to 40 ms after it (the worst of the trials). */
  maxStepAtStop: number;
  /** The same, the median of the trials. */
  medianStepAtStop: number;
  /** The same over the 200 ms before the stop (the chord sounding by itself). */
  maxStepWhileSounding: number;
  /** The loudest sample while the chord sounds. */
  peakWhileSounding: number;
  /** How loud it still is 40 ms after the stop (a stop that has done its work is quiet). */
  peakAfterStop: number;
  steps?: number[];
  whileSounding?: number[];
}

const WORKLET = `
class Recorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    this.port.postMessage({ frame: currentFrame, data: channel ? channel.slice() : new Float32Array(128) });
    return true;
  }
}
registerProcessor("preview-fade-recorder", Recorder);
`;

interface Tap {
  connectSource(source: Tone.ToneAudioNode): void;
  stop(): Promise<{ sampleRate: number; firstFrame: number; samples: Float32Array }>;
}

let moduleLoaded = false;

async function startTap(from: "destination" | "none" = "destination"): Promise<Tap> {
  const context = Tone.getContext();
  if (!moduleLoaded) {
    await context.addAudioWorkletModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
    moduleLoaded = true;
  }
  const node = context.createAudioWorkletNode("preview-fade-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const silent = new Tone.Gain(0);
  const chunks: Array<{ frame: number; data: Float32Array }> = [];
  node.port.onmessage = (event: MessageEvent<{ frame: number; data: Float32Array }>) => chunks.push(event.data);
  // the bench measures the signal as the instruments make it: the master volume is put at 0 dB (the app may have it lower)
  Tone.getDestination().mute = false;
  Tone.getDestination().volume.value = 0;
  if (from === "destination") Tone.connect(Tone.getDestination(), node);
  Tone.connect(node, silent);
  // not through the master output: the tap listens to it, and a loop of nodes would be silenced
  Tone.connect(silent, Tone.getContext().rawContext.destination);
  return {
    connectSource(source) { Tone.connect(source, node); },
    async stop() {
      await new Promise((resolve) => setTimeout(resolve, 100));
      node.port.onmessage = null;
      if (from === "destination") { try { Tone.disconnect(Tone.getDestination(), node); } catch { /* already gone */ } }
      node.disconnect();
      silent.dispose();
      chunks.sort((a, b) => a.frame - b.frame);
      const firstFrame = chunks[0]?.frame ?? 0;
      const last = chunks[chunks.length - 1];
      const samples = new Float32Array(last ? last.frame + last.data.length - firstFrame : 0);
      for (const chunk of chunks) samples.set(chunk.data, chunk.frame - firstFrame);
      return { sampleRate: context.sampleRate, firstFrame, samples };
    },
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const CHORD = [48, 55, 60, 64, 67, 71].map((pitch) => ({ pitch, startBeat: 0, durationBeats: 6, velocity: 100 }));
const NEXT = [50, 57, 62, 65, 69, 72].map((pitch) => ({ pitch, startBeat: 0, durationBeats: 6, velocity: 100 }));

function stepAndPeak(samples: Float32Array, from: number, to: number): { step: number; peak: number } {
  let step = 0;
  let peak = 0;
  for (let index = Math.max(1, from); index < Math.min(samples.length, to); index += 1) {
    step = Math.max(step, Math.abs(samples[index]! - samples[index - 1]!));
    peak = Math.max(peak, Math.abs(samples[index]!));
  }
  return { step, peak };
}

/**
 * A chord sounds, and a little over half a second in, either the preview is stopped or the next chord is started. The size of the
 * jump depends on where in its wave the sound is cut, so the run is repeated with the stop moved by a few milliseconds each time
 * (`trials` times), and the worst and the median are reported.
 */
async function click(sound: MidiPreviewSound, scenario: "next-chord" | "stop", trials = 12): Promise<ClickMetrics> {
  await Tone.start();
  stopPreview();
  await wait(1500);
  const rate = Tone.getContext().sampleRate;
  const steps: number[] = [];
  const whileSounding: number[] = [];
  const peaks: number[] = [];
  const afters: number[] = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const tap = await startTap();
    await previewMidiNotes(CHORD, 60, sound);
    await wait(620 + trial * 7);
    const stopFrame = Math.round(Tone.immediate() * rate);
    if (scenario === "stop") stopPreview();
    else await previewMidiNotes(NEXT, 60, sound);
    await wait(500);
    stopPreview();
    const recorded = await tap.stop();
    // the recording begins at `firstFrame` of the context: the frame of the stop counted from there
    const at = stopFrame - recorded.firstFrame;
    steps.push(stepAndPeak(recorded.samples, at - Math.round(0.001 * rate), at + Math.round(0.04 * rate)).step);
    const before = stepAndPeak(recorded.samples, at - Math.round(0.2 * rate), at - Math.round(0.005 * rate));
    whileSounding.push(before.step);
    peaks.push(before.peak);
    afters.push(stepAndPeak(recorded.samples, at + Math.round(0.04 * rate), at + Math.round(0.044 * rate)).peak);
    await wait(1200);
  }
  const median = (values: number[]) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)]!;
  return {
    sound, scenario, sampleRate: rate, trials,
    maxStepAtStop: Math.max(...steps), medianStepAtStop: median(steps),
    maxStepWhileSounding: Math.max(...whileSounding), peakWhileSounding: Math.max(...peaks), peakAfterStop: Math.max(...afters), steps, whileSounding,
  };
}

/**
 * Does `releaseAll(time)` cancel a note that was scheduled for a later time? A note is scheduled 0.6 s ahead, and then
 * (a) nothing is done, (b) `releaseAll()` now, (c) `releaseAll(now + 0.1)`, (d) the instrument is disposed. The loudest
 * sample between 0.6 s and 1.2 s says whether the note was heard.
 */
async function releaseAllProbe(sound: "piano" | "electric-piano"): Promise<Record<string, number>> {
  await Tone.start();
  const result: Record<string, number> = {};
  for (const mode of ["nothing", "releaseAll()", "releaseAll(now+0.1)", "dispose"] as const) {
    const instrument = await createPreviewInstrument(sound);
    await wait(300);
    const tap = await startTap();
    const rate = Tone.getContext().sampleRate;
    const now = Tone.immediate();
    instrument.triggerAttackRelease("C4", 0.4, now + 0.6, 0.9);
    if (mode === "releaseAll()") instrument.releaseAll();
    else if (mode === "releaseAll(now+0.1)") instrument.releaseAll(now + 0.1);
    else if (mode === "dispose") instrument.dispose();
    await wait(1500);
    const recorded = await tap.stop();
    const from = Math.round(now * rate) - recorded.firstFrame + Math.round(0.6 * rate);
    result[mode] = stepAndPeak(recorded.samples, from, from + Math.round(0.6 * rate)).peak;
    if (mode !== "dispose") instrument.dispose();
    await wait(300);
  }
  return result;
}

/** How long a new piano (or electric piano) takes to be ready, and how late a restarted preview begins to sound. */
async function buildProbe(sound: "piano" | "electric-piano"): Promise<{ build: number[]; startLatency: number[]; softStartLatency: number[] }> {
  await Tone.start();
  stopPreview();
  const build: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    const begun = performance.now();
    const instrument = await createPreviewInstrument(sound);
    build.push(Math.round(performance.now() - begun));
    instrument.dispose();
  }
  const startLatency: number[] = [];
  for (let index = 0; index < 10; index += 1) {
    const begun = performance.now();
    await new Promise<void>((resolve) => { void previewMidiNotes(CHORD, 60, sound, { onStarted: () => { startLatency.push(Math.round(performance.now() - begun)); resolve(); } }); });
    await wait(150);
  }
  stopPreview();
  await wait(1500);
  const softStartLatency: number[] = [];
  const symbol = { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" } as never;
  for (let index = 0; index < 10; index += 1) {
    const begun = performance.now();
    await new Promise<void>((resolve) => { void previewChord(symbol, sound, { onStarted: () => { softStartLatency.push(Math.round(performance.now() - begun)); resolve(); } }); });
    await wait(150);
  }
  stopPreview();
  return { build, startLatency, softStartLatency };
}

/** What the recording saw, for finding out why a measurement is empty. */
async function tapState(): Promise<Record<string, unknown>> {
  await Tone.start();
  const result: Record<string, unknown> = {};
  for (const route of ["direct", "destination"] as const) {
    const tap = await startTap(route === "direct" ? "none" : "destination");
    const oscillator = new Tone.Oscillator(440, "sine");
    oscillator.volume.value = -12;
    if (route === "direct") tap.connectSource(oscillator); else oscillator.toDestination();
    oscillator.start();
    await wait(400);
    oscillator.stop();
    oscillator.dispose();
    const recorded = await tap.stop();
    let peak = 0;
    for (const value of recorded.samples) peak = Math.max(peak, Math.abs(value));
    result[route] = { length: recorded.samples.length, peak };
  }
  return result;
}

export interface PreviewFadeLab {
  tapState: typeof tapState;
  click: typeof click;
  releaseAllProbe: typeof releaseAllProbe;
  buildProbe: typeof buildProbe;
}

export function installPreviewFadeLab(): void {
  if (!new URLSearchParams(location.search).has("previewfade")) return;
  (window as unknown as { __previewFadeLab: PreviewFadeLab }).__previewFadeLab = { click, releaseAllProbe, buildProbe, tapState };
}
