import * as Tone from "tone";
import mapping from "../assets/freepats-bass-yr/mapping.json";
import { readBassPracticeTimbreSetting } from "./freepatsBassSettings";

export type BassTimbre = "finger" | "pick";
export type BassPlaybackSource = "freepats" | "synth-fallback";

export interface BassPreviewInstrument {
  readonly source: BassPlaybackSource;
  triggerAttackRelease(notes: string | string[], duration: number, time?: number, velocity?: number): void;
  releaseAll(): void;
  dispose(): void;
}

interface BassRegion {
  readonly lowKey: number;
  readonly highKey: number;
  readonly rootKey: number;
  readonly samplePath: string;
}

const sampleUrls = import.meta.glob("../assets/freepats-bass-yr/samples/**/*.wav", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export function resolveFreepatsRegion(timbre: BassTimbre, midiKey: number): BassRegion {
  const regions = mapping.instruments[timbre].regions as readonly BassRegion[];
  const exact = regions.find((region) => midiKey >= region.lowKey && midiKey <= region.highKey);
  if (exact) return exact;
  if (midiKey >= 23 && midiKey <= 25) {
    const e1 = regions.find((region) => region.rootKey === 28);
    if (!e1) throw new Error("FreePats Finger/Picked Bass mapping must contain the E1 root sample.");
    return e1;
  }
  return [...regions].sort((left, right) => Math.abs(left.rootKey - midiKey) - Math.abs(right.rootKey - midiKey) || left.rootKey - right.rootKey)[0];
}

export function lowBassPitchOffsetSemitones(midiKey: number): number {
  if (midiKey < 23 || midiKey > 25) return 0;
  return midiKey - 28;
}

export interface FreepatsBassInstrumentOptions {
  /**
   * A caller may set a session-relative gain while retaining the existing
   * global master-volume route. Omitted keeps the established preview level.
   */
  readonly volumeDb?: number;
}

export async function createFreepatsBassInstrument(
  timbre: BassTimbre,
  options: FreepatsBassInstrumentOptions = {},
): Promise<BassPreviewInstrument> {
  if (readBassPracticeTimbreSetting() === "synth") return createSynthFallback(timbre, options);
  try {
    const urls = Object.fromEntries((mapping.instruments[timbre].regions as readonly BassRegion[]).map((region) => {
      const key = `../assets/freepats-bass-yr/${region.samplePath}`;
      const url = sampleUrls[key];
      if (!url) throw new Error(`Bundled FreePats asset is missing from the production graph: ${region.samplePath}`);
      return [midiToNoteName(region.rootKey), url];
    }));
    const sampler = new Tone.Sampler({ urls, release: timbre === "finger" ? 0.5 : 0.12 });
    const highPass = new Tone.Filter({ frequency: 28, type: "highpass", Q: 0.7 });
    const compressor = new Tone.Compressor({ threshold: -10, ratio: 2 });
    sampler.chain(highPass, compressor, Tone.getDestination());
    sampler.volume.value = options.volumeDb ?? -3;
    await waitForSamples();
    return {
      source: "freepats",
      triggerAttackRelease(notes, duration, time, velocity) { sampler.triggerAttackRelease(notes, duration, time, velocity); },
      releaseAll() { sampler.releaseAll(); },
      dispose() { sampler.dispose(); highPass.dispose(); compressor.dispose(); },
    };
  } catch {
    return createSynthFallback(timbre, options);
  }
}

function createSynthFallback(timbre: BassTimbre, options: FreepatsBassInstrumentOptions): BassPreviewInstrument {
  const highPass = new Tone.Filter({ frequency: 28, type: "highpass", Q: 0.7 });
  const lowPass = new Tone.Filter({ frequency: timbre === "finger" ? 1700 : 2200, type: "lowpass", Q: 0.8, rolloff: -24 });
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: timbre === "finger" ? 0.8 : 1.1,
    oscillator: { type: "sine" },
    modulation: { type: "triangle" },
    envelope: { attack: 0.004, decay: timbre === "finger" ? 0.18 : 0.05, sustain: timbre === "finger" ? 0.58 : 0.08, release: timbre === "finger" ? 0.22 : 0.08 },
    modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0.12, release: 0.12 },
  }).chain(highPass, lowPass, Tone.getDestination());
  synth.volume.value = options.volumeDb ?? -6;
  return {
    source: "synth-fallback",
    triggerAttackRelease(notes, duration, time, velocity) { synth.triggerAttackRelease(notes, duration, time, velocity); },
    releaseAll() { synth.releaseAll(); },
    dispose() { synth.dispose(); highPass.dispose(); lowPass.dispose(); },
  };
}

function waitForSamples(timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error("FreePats samples did not preload before timeout.")), timeoutMs);
    Tone.loaded().then(() => { globalThis.clearTimeout(timeout); resolve(); }, (error) => { globalThis.clearTimeout(timeout); reject(error); });
  });
}

function midiToNoteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}