import { describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => {
  class Synth {}
  class FMSynth {}

  class AudioNode {
    wet = { value: 0 };
    volume = { value: 0 };
    dispose = vi.fn();
    releaseAll = vi.fn();
    triggerAttackRelease = vi.fn();

    chain() {
      return this;
    }

    start() {
      return this;
    }

    toDestination() {
      return this;
    }
  }

  const voices: unknown[] = [];
  const samplers: AudioNode[] = [];

  class PolySynth extends AudioNode {
    constructor(voice: unknown) {
      super();
      voices.push(voice);
    }
  }

  class Sampler extends AudioNode {
    constructor() {
      super();
      samplers.push(this);
    }
  }

  return {
    AudioNode,
    FMSynth,
    PolySynth,
    Sampler,
    Synth,
    loaded: vi.fn().mockResolvedValue(undefined),
    samplers,
    start: vi.fn().mockResolvedValue(undefined),
    voices,
  };
});

vi.mock("tone", () => ({
  Chebyshev: tone.AudioNode,
  Chorus: tone.AudioNode,
  Compressor: tone.AudioNode,
  FMSynth: tone.FMSynth,
  Filter: tone.AudioNode,
  Freeverb: tone.AudioNode,
  PolySynth: tone.PolySynth,
  Sampler: tone.Sampler,
  Synth: tone.Synth,
  getDestination: vi.fn(() => new tone.AudioNode()),
  loaded: tone.loaded,
  start: tone.start,
}));

import { previewChord } from "./chordPreview";

const chord = {
  root: 0,
  quality: "maj7" as const,
  tensions: [],
  label: "Cmaj7",
};

describe("chord preview instruments", () => {
  it("creates the selected sampled piano and electric-piano synth", async () => {
    await previewChord(chord, "piano");
    await previewChord(chord, "electric-piano");

    expect(tone.start).toHaveBeenCalledTimes(2);
    expect(tone.samplers).toHaveLength(1);
    expect(tone.voices).toEqual([tone.FMSynth]);

    tone.loaded.mockRejectedValueOnce(new Error("offline"));
    await previewChord(chord, "piano");

    expect(tone.samplers).toHaveLength(2);
    expect(tone.voices).toEqual([tone.FMSynth, tone.Synth]);
  });
});
