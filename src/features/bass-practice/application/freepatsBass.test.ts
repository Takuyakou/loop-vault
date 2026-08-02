import { describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ loaded: () => Promise.resolve(), disposed: 0, released: 0 }));

vi.mock("tone", () => {
  class Node { chain() { return this; } dispose() { audio.disposed += 1; } }
  class Sampler extends Node { volume = { value: 0 }; triggerAttackRelease() {} releaseAll() { audio.released += 1; } }
  class Filter extends Node {}
  class Compressor extends Node {}
  class PolySynth extends Node { volume = { value: 0 }; triggerAttackRelease() {} releaseAll() { audio.released += 1; } }
  return { Sampler, Filter, Compressor, PolySynth, FMSynth: class {}, getDestination: () => new Node(), loaded: () => audio.loaded() };
});

import { createFreepatsBassInstrument } from "./freepatsBass";

describe("FreePats sample engine", () => {
  it("uses the synth fallback when sample decoding/preload fails", async () => {
    audio.loaded = () => Promise.reject(new Error("decode failed"));
    const instrument = await createFreepatsBassInstrument("finger");
    expect(instrument.source).toBe("synth-fallback");
    instrument.triggerAttackRelease("E1", .2); instrument.releaseAll(); instrument.dispose();
    expect(audio.released).toBeGreaterThan(0);
  });

  it("can rapidly create, release, and dispose preloaded Picked Bass voices without retaining a voice", async () => {
    audio.loaded = () => Promise.resolve(); audio.disposed = 0; audio.released = 0;
    const voices = await Promise.all(Array.from({ length: 5 }, () => createFreepatsBassInstrument("pick")));
    for (const voice of voices) { voice.triggerAttackRelease("C2", .08); voice.releaseAll(); voice.dispose(); }
    expect(voices.every((voice) => voice.source === "freepats")).toBe(true);
    expect(audio.released).toBe(5); expect(audio.disposed).toBeGreaterThanOrEqual(15);
  });
});