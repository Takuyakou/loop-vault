import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  bassTriggers: 0,
  bassReleases: 0,
  bassDisposals: 0,
  chordTriggers: 0,
  nodeDisposals: 0,
  polySynthOptions: [] as unknown[],
}));

vi.mock("tone", () => {
  class Node {
    chain() { return this; }
    dispose() { audio.nodeDisposals += 1; }
  }
  class Volume extends Node {
    constructor(_value: number) { super(); }
  }
  class Synth extends Node {
    triggerAttackRelease() { audio.chordTriggers += 1; }
    triggerRelease() {}
    releaseAll() {}
  }
  class PolySynth extends Synth {
    constructor(_voice: unknown, options: unknown) {
      super();
      audio.polySynthOptions.push(options);
    }
  }
  return {
    Volume,
    Synth,
    PolySynth,
    start: vi.fn(async () => undefined),
    getDestination: () => new Node(),
  };
});

vi.mock("./freepatsBass", () => ({
  createFreepatsBassInstrument: vi.fn(async () => ({
    source: "freepats",
    triggerAttackRelease() { audio.bassTriggers += 1; },
    releaseAll() { audio.bassReleases += 1; },
    dispose() { audio.bassDisposals += 1; },
  })),
}));

import { createChordContextPlaybackEngine } from "./chordContextPlayback";
import { CHORD_CONTEXT_NATURAL_RELEASE_TAIL_MS, createChordContextToneDriver } from "./chordContextToneDriver";

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(audio, { bassTriggers: 0, bassReleases: 0, bassDisposals: 0, chordTriggers: 0, nodeDisposals: 0, polySynthOptions: [] });
});
afterEach(() => vi.useRealTimers());

const chord = { root: 0, quality: "maj7" as const, tensions: [], label: "Cmaj7" };
const source = {
  bpm: 120,
  meter: { numerator: 4 as const, denominator: 4 as const },
  chordEvents: [{ id: "chord:0", chord, startBeat: 0, durationBeats: 4 }],
  bassEvents: [{ id: "bass:late", pitch: 40, startBeat: 2, durationBeats: 1, velocity: .8 }],
};

describe("Chord Context Tone driver", () => {
  it("replaces a pending Listen phrase before it can trigger a bass note and releases every resource", async () => {
    const driver = createChordContextToneDriver();
    await driver.prepare();
    const engine = createChordContextPlaybackEngine(driver);

    expect(engine.start({ ...source, mode: "listen", listenMode: "bass-and-chords" }).ok).toBe(true);
    expect(engine.start({ ...source, mode: "play", playMode: "chords-only" }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(2_100);

    expect(audio.bassTriggers).toBe(0);
    expect(audio.chordTriggers).toBeGreaterThan(0);
    engine.stop();
    engine.dispose();
    driver.dispose();
    expect(audio.bassReleases).toBeGreaterThan(0);
    expect(audio.bassDisposals).toBe(1);
    expect(audio.nodeDisposals).toBeGreaterThan(0);
  });

  it("clears scheduled callbacks on stop so a rapid stop cannot create a stuck note", async () => {
    const driver = createChordContextToneDriver();
    await driver.prepare();
    const engine = createChordContextPlaybackEngine(driver);

    expect(engine.start({ ...source, mode: "listen", listenMode: "bass-only" }).ok).toBe(true);
    engine.stop();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(audio.bassTriggers).toBe(0);
    expect(engine.getActivePlan()).toBeUndefined();
    driver.dispose();
  });
  it("selects the requested offline chord timbre without changing the default", async () => {
    const electric = createChordContextToneDriver();
    await electric.prepare();
    const electricEngine = createChordContextPlaybackEngine(electric);
    expect(electricEngine.start({ ...source, mode: "play", playMode: "chords-only" }).ok).toBe(true);
    expect(audio.polySynthOptions[0]).toMatchObject({ oscillator: { type: "triangle" } });
    electricEngine.dispose();
    electric.dispose();

    const piano = createChordContextToneDriver({ chordTimbre: "piano" });
    await piano.prepare();
    const pianoEngine = createChordContextPlaybackEngine(piano);
    expect(pianoEngine.start({ ...source, mode: "play", playMode: "chords-only" }).ok).toBe(true);
    expect(audio.polySynthOptions[1]).toMatchObject({
      oscillator: { type: "triangle8" },
      envelope: { attack: 0.004, release: 0.45 },
    });
    pianoEngine.dispose();
    piano.dispose();
  });

  it("keeps the audio graph alive through the final release tail before natural disposal", async () => {
    const driver = createChordContextToneDriver({ chordTimbre: "piano" });
    await driver.prepare();
    const engine = createChordContextPlaybackEngine(driver);

    expect(engine.start({ ...source, mode: "play", playMode: "chords-only" }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(engine.getActivePlan()).toBeDefined();
    expect(audio.nodeDisposals).toBe(0);

    await vi.advanceTimersByTimeAsync(CHORD_CONTEXT_NATURAL_RELEASE_TAIL_MS);
    expect(engine.getActivePlan()).toBeUndefined();
    expect(audio.nodeDisposals).toBeGreaterThan(0);
    driver.dispose();
  });
});