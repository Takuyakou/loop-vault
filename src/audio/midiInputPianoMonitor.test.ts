import { beforeEach, describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => {
  class AudioNode {
    volume = { value: 0 };
    dispose = vi.fn();
    releaseAll = vi.fn();
    triggerAttack = vi.fn();
    triggerRelease = vi.fn();
    chain() { return this; }
  }
  const samplers: Array<AudioNode & { options: unknown }> = [];
  class Sampler extends AudioNode {
    options: unknown;
    constructor(options: unknown) {
      super();
      this.options = options;
      samplers.push(this);
    }
  }
  return {
    AudioNode,
    Sampler,
    samplers,
    loaded: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  };
});

vi.mock("tone", () => ({
  Compressor: tone.AudioNode,
  Filter: tone.AudioNode,
  Sampler: tone.Sampler,
  getDestination: vi.fn(() => new tone.AudioNode()),
  loaded: tone.loaded,
  start: tone.start,
}));

import { createMidiInputPianoMonitor } from "./midiInputPianoMonitor";

beforeEach(() => {
  tone.samplers.length = 0;
  tone.loaded.mockClear();
  tone.start.mockClear();
});

describe("MIDI input piano monitor", () => {
  it("tracks note-on and note-off without retriggering held notes", async () => {
    const monitor = await createMidiInputPianoMonitor();
    const sampler = tone.samplers[0]!;

    monitor.updateNotes([60, 64, 64, -1, 128]);
    expect(tone.start).toHaveBeenCalledOnce();
    expect(tone.loaded).toHaveBeenCalledOnce();
    expect(sampler.triggerAttack.mock.calls).toEqual([
      ["C4", undefined, 0.68],
      ["E4", undefined, 0.68],
    ]);

    monitor.updateNotes([64, 67]);
    expect(sampler.triggerRelease).toHaveBeenCalledWith("C4");
    expect(sampler.triggerAttack).toHaveBeenLastCalledWith("G4", undefined, 0.68);
    expect(sampler.triggerAttack).toHaveBeenCalledTimes(3);

    monitor.stop();
    expect(sampler.releaseAll).toHaveBeenCalledOnce();
    monitor.dispose();
    expect(sampler.releaseAll).toHaveBeenCalledTimes(2);
    expect(sampler.dispose).toHaveBeenCalledOnce();

    monitor.updateNotes([72]);
    expect(sampler.triggerAttack).toHaveBeenCalledTimes(3);
  });

  it("disposes the sampled graph instead of falling back to an electronic synth when decode fails", async () => {
    tone.loaded.mockRejectedValueOnce(new Error("decode failed"));

    await expect(createMidiInputPianoMonitor()).rejects.toThrow("decode failed");
    expect(tone.samplers[0]?.dispose).toHaveBeenCalledOnce();
  });
  it("loads only bundled Salamander samples and never creates a synth fallback", async () => {
    const monitor = await createMidiInputPianoMonitor();
    const sampler = tone.samplers[0]!;
    const urls = (sampler.options as { urls: Record<string, string> }).urls;

    expect(Object.keys(urls)).toEqual(["A0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
    expect(Object.values(urls)).toHaveLength(8);
    expect(Object.values(urls).every((url) => !/^https?:/u.test(url))).toBe(true);
    monitor.dispose();
  });
});
