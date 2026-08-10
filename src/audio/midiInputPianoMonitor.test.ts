import { beforeEach, describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => {
  class Synth {}
  class AudioNode {
    wet = { value: 0 };
    volume = { value: 0 };
    dispose = vi.fn();
    releaseAll = vi.fn();
    triggerAttack = vi.fn();
    triggerRelease = vi.fn();
    chain() { return this; }
  }
  const polySynths: AudioNode[] = [];
  class PolySynth extends AudioNode {
    constructor(_voice: unknown, _options: unknown) {
      super();
      polySynths.push(this);
    }
  }
  return {
    AudioNode,
    PolySynth,
    Synth,
    polySynths,
    start: vi.fn(async () => undefined),
  };
});

vi.mock("tone", () => ({
  Compressor: tone.AudioNode,
  Filter: tone.AudioNode,
  Freeverb: tone.AudioNode,
  PolySynth: tone.PolySynth,
  Synth: tone.Synth,
  getDestination: vi.fn(() => new tone.AudioNode()),
  start: tone.start,
}));

import { createMidiInputPianoMonitor } from "./midiInputPianoMonitor";

beforeEach(() => {
  tone.polySynths.length = 0;
  tone.start.mockClear();
});

describe("MIDI input piano monitor", () => {
  it("tracks note-on and note-off without retriggering held notes", async () => {
    const monitor = await createMidiInputPianoMonitor();
    const synth = tone.polySynths[0]!;

    monitor.updateNotes([60, 64, 64, -1, 128]);
    expect(tone.start).toHaveBeenCalledOnce();
    expect(synth.triggerAttack.mock.calls).toEqual([
      ["C4", undefined, 0.68],
      ["E4", undefined, 0.68],
    ]);

    monitor.updateNotes([64, 67]);
    expect(synth.triggerRelease).toHaveBeenCalledWith("C4");
    expect(synth.triggerAttack).toHaveBeenLastCalledWith("G4", undefined, 0.68);
    expect(synth.triggerAttack).toHaveBeenCalledTimes(3);

    monitor.stop();
    expect(synth.releaseAll).toHaveBeenCalledOnce();
    monitor.dispose();
    expect(synth.releaseAll).toHaveBeenCalledTimes(2);
    expect(synth.dispose).toHaveBeenCalledOnce();

    monitor.updateNotes([72]);
    expect(synth.triggerAttack).toHaveBeenCalledTimes(3);
  });
});
