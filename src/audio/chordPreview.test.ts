import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  previewChordTimeline,
  previewMidiNotes,
  stopPreview,
} from "./chordPreview";
import { voiceChordForPreview } from "../domain/chordVoicing";

const chord = {
  root: 0,
  quality: "maj7" as const,
  tensions: [],
  label: "Cmaj7",
};

describe("chord preview instruments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    stopPreview();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

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
  });

  it.each(["piano", "electric-piano"] as const)(
    "reuses the %s instrument when chord cards are clicked rapidly",
    async (sound) => {
      const ended = vi.fn();
      const instruments = sound === "piano" ? tone.samplers : tone.polySynths;
      const instrumentCount = instruments.length;

      await previewChord(chord, sound, { onEnded: ended });
      const active = instruments[instrumentCount]!;
      await previewChord(
        { ...chord, root: 2, label: "Dm7" },
        sound,
      );

      expect(instruments).toHaveLength(instrumentCount + 1);
      expect(active.triggerAttackRelease).toHaveBeenCalledTimes(2);
      expect(active.releaseAll).toHaveBeenCalledOnce();
      expect(active.dispose).not.toHaveBeenCalled();
      expect(ended).toHaveBeenCalledOnce();
      expect(ended).toHaveBeenCalledWith("stopped");

      await vi.advanceTimersByTimeAsync(PREVIEW_RELEASE_TAIL_MS_FOR_TEST);
      expect(active.dispose).not.toHaveBeenCalled();
    },
  );

  it("uses explicit notes per timeline event and preserves generated fallback", async () => {
    const fallbackChord = {
      root: 2,
      quality: "min7" as const,
      tensions: [],
      label: "Dm7",
    };
    const timeline = [
      {
        eventId: "source",
        bar: 1,
        beat: 1,
        durationBeats: 2,
        chord,
        confidence: 1,
        alternatives: [],
        warnings: [],
      },
      {
        eventId: "fallback",
        bar: 1,
        beat: 3,
        durationBeats: 2,
        chord: fallbackChord,
        confidence: 1,
        alternatives: [],
        warnings: [],
      },
    ];
    const sourceNotes = [40, 52, 56, 59, 63];
    const synthCount = tone.polySynths.length;

    await previewChordTimeline(
      timeline,
      120,
      "electric-piano",
      {},
      4,
      { source: sourceNotes },
    );
    const electric = tone.polySynths[synthCount]!;
    await vi.advanceTimersByTimeAsync(0);
    expect(electric.triggerAttackRelease).toHaveBeenNthCalledWith(
      1,
      sourceNotes.map(midiNoteName),
      0.9,
      undefined,
      0.7,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(electric.triggerAttackRelease).toHaveBeenNthCalledWith(
      2,
      voiceChordForPreview(fallbackChord).notes.map(midiNoteName),
      0.9,
      undefined,
      0.7,
    );
  });

  it("plays raw MIDI notes in bounded windows and releases them on stop", async () => {
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
    expect(electric.dispose).toHaveBeenCalledOnce();
    const triggerCount = electric.triggerAttackRelease.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(electric.triggerAttackRelease).toHaveBeenCalledTimes(triggerCount);
  });

  it("keeps note offsets on the audio clock when the rolling timer stalls", async () => {
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
    expect(bass.dispose).toHaveBeenCalledOnce();
  });

  it("replaces the active practice timbre without leaving a second graph sounding", async () => {
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
  });
});

function midiNoteName(note: number): string {
  const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitchClass = pitchClasses[((note % 12) + 12) % 12]!;
  const octave = Math.floor(note / 12) - 1;
  return `${pitchClass}${octave}`;
}

const PREVIEW_RELEASE_TAIL_MS_FOR_TEST = 1_100;
