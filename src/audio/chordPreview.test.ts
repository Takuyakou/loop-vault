import { describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => {
  class Synth {}
  class FMSynth {}

  class AudioNode {
    wet = { value: 0 };
    volume = { value: 0 };
    dispose = vi.fn();
    cancel = vi.fn();
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
  const samplerOptions: unknown[] = [];
  const polySynths: AudioNode[] = [];
  let audioNow = 0;

  class PolySynth extends AudioNode {
    constructor(voice: unknown) {
      super();
      voices.push(voice);
      polySynths.push(this);
    }
  }

  class Sampler extends AudioNode {
    constructor(options?: unknown) {
      super();
      samplerOptions.push(options);
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
    now: vi.fn(() => audioNow),
    polySynths,
    samplers,
    samplerOptions,
    start: vi.fn().mockResolvedValue(undefined),
    setAudioNow(value: number) {
      audioNow = value;
    },
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
  now: tone.now,
  start: tone.start,
}));

import {
  previewChord,
  previewMidiNotes,
  stopPreview,
} from "./chordPreview";

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
    const pianoUrls = (tone.samplerOptions[0] as { urls: Record<string, string> }).urls;
    expect(Object.keys(pianoUrls)).toEqual(["A0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
    expect(Object.values(pianoUrls)).toHaveLength(8);
    expect(Object.values(pianoUrls).every((url) => !url.startsWith("http"))).toBe(true);
    expect(tone.voices).toEqual([tone.FMSynth]);

    tone.loaded.mockRejectedValueOnce(new Error("offline"));
    await expect(previewChord(chord, "piano")).rejects.toThrow("offline");

    expect(tone.samplers).toHaveLength(2);
    expect(tone.voices).toEqual([tone.FMSynth]);
    stopPreview();
  });

  it("cancels a request while audio startup is pending", async () => {
    let resolveStart: (() => void) | undefined;
    tone.start.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStart = resolve;
    }));
    const started = vi.fn();
    const ended = vi.fn();
    const triggerCount = [...tone.samplers]
      .reduce((count, sampler) => count + sampler.triggerAttackRelease.mock.calls.length, 0);

    const pending = previewChord(chord, "piano", { onStarted: started, onEnded: ended });
    stopPreview();
    resolveStart?.();
    await pending;

    const nextTriggerCount = [...tone.samplers]
      .reduce((count, sampler) => count + sampler.triggerAttackRelease.mock.calls.length, 0);
    expect(started).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledWith("stopped");
    expect(nextTriggerCount).toBe(triggerCount);
  });

  it("notifies natural completion exactly once", async () => {
    vi.useFakeTimers();
    const ended = vi.fn();
    const synthCount = tone.polySynths.length;
    await previewChord(chord, "electric-piano", { onEnded: ended });
    const electric = tone.polySynths[synthCount]!;
    await vi.advanceTimersByTimeAsync(1_350);
    expect(ended).not.toHaveBeenCalled();
    expect(electric.releaseAll).not.toHaveBeenCalled();
    expect(electric.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("completed");
    expect(electric.releaseAll).toHaveBeenCalledOnce();
    expect(electric.dispose).toHaveBeenCalledOnce();
    stopPreview();
    expect(ended).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("plays raw MIDI notes in bounded windows and releases them on stop", async () => {
    vi.useFakeTimers();
    tone.setAudioNow(0);
    const started = vi.fn();
    const ended = vi.fn();
    await previewMidiNotes([
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
      { pitch: 64, startBeat: 8, durationBeats: 1, velocity: 100 },
    ], 120, "electric-piano", { onStarted: started, onEnded: ended });

    await vi.advanceTimersByTimeAsync(10);
    const electric = tone.polySynths[tone.polySynths.length - 1]!;
    expect(started).toHaveBeenCalledOnce();
    expect(electric.triggerAttackRelease).toHaveBeenCalledWith(
      "C4",
      0.5,
      0,
      100 / 127,
    );
    expect(ended).not.toHaveBeenCalled();
    stopPreview();
    expect(ended).toHaveBeenCalledWith("stopped");
    expect(electric.releaseAll).toHaveBeenCalled();
    expect(electric.dispose).toHaveBeenCalled();
    const triggerCount = electric.triggerAttackRelease.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(electric.triggerAttackRelease).toHaveBeenCalledTimes(triggerCount);
    vi.useRealTimers();
  });

  it("keeps note offsets on the audio clock when the rolling timer stalls", async () => {
    vi.useFakeTimers();
    tone.setAudioNow(10);
    await previewMidiNotes([
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
      { pitch: 64, startBeat: 4, durationBeats: 1, velocity: 100 },
    ], 120, "clean-bass");
    const bass = tone.polySynths[tone.polySynths.length - 1]!;

    expect(bass.triggerAttackRelease).toHaveBeenNthCalledWith(
      1,
      "C4",
      0.5,
      10,
      100 / 127,
    );
    tone.setAudioNow(11.2);
    await vi.advanceTimersByTimeAsync(200);
    expect(bass.triggerAttackRelease).toHaveBeenNthCalledWith(
      2,
      "E4",
      0.5,
      12,
      100 / 127,
    );
    stopPreview();
    expect(bass.dispose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("replaces the active practice timbre without leaving a second graph sounding", async () => {
    vi.useFakeTimers();
    const bassEnded = vi.fn();
    const referenceEnded = vi.fn();
    const note = [{ pitch: 40, startBeat: 0, durationBeats: 1, velocity: 96 }];

    await previewMidiNotes(note, 120, "clean-bass", { onEnded: bassEnded });
    const bass = tone.polySynths[tone.polySynths.length - 1]!;
    await previewMidiNotes(note, 120, "singing-reference", { onEnded: referenceEnded });
    const reference = tone.polySynths[tone.polySynths.length - 1]!;

    expect(reference).not.toBe(bass);
    expect(bassEnded).toHaveBeenCalledOnce();
    expect(bassEnded).toHaveBeenCalledWith("stopped");
    expect(bass.releaseAll).toHaveBeenCalled();
    expect(bass.dispose).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(reference.triggerAttackRelease).toHaveBeenCalled();
    expect(referenceEnded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(referenceEnded).toHaveBeenCalledWith("completed");
    stopPreview();
    vi.useRealTimers();
  });
});
