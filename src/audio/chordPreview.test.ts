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
    triggerAttack = vi.fn();
    triggerRelease = vi.fn();
    connect = vi.fn(() => this);

    chain = vi.fn((..._nodes: AudioNode[]) => this);

    start() {
      return this;
    }

    toDestination() {
      return this;
    }
  }

  const gains: Gain[] = [];
  const voices: unknown[] = [];
  const samplers: AudioNode[] = [];
  const samplerOptions: unknown[] = [];
  const polySynths: AudioNode[] = [];
  let audioNow = 0;

  /** The gain at the end of an instrument's chain: what is brought down when a preview is stopped. */
  class Gain extends AudioNode {
    gain = {
      getValueAtTime: vi.fn(() => 1),
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };

    constructor() {
      super();
      gains.push(this);
    }
  }

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

  const buffer = { length: 100, numberOfChannels: 2, sampleRate: 48000 };
  const newContext = () => ({
    sampleRate: 48000,
    state: "running",
    decodeAudioData: vi.fn().mockImplementation(async () => ({ ...buffer })),
    on: vi.fn(), off: vi.fn(),
  });
  let context = newContext();

  return {
    AudioNode,
    FMSynth,
    Gain,
    gains,
    PolySynth,
    Sampler,
    Synth,
    immediate: vi.fn(() => audioNow),
    loaded: vi.fn().mockResolvedValue(undefined),
    now: vi.fn(() => audioNow),
    polySynths,
    samplers,
    samplerOptions,
    getContext: () => context,
    newContext,
    setContext(next: typeof context) { context = next; },
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
  Gain: tone.Gain,
  PolySynth: tone.PolySynth,
  Sampler: tone.Sampler,
  Synth: tone.Synth,
  getDestination: vi.fn(() => new tone.AudioNode()),
  immediate: tone.immediate,
  loaded: tone.loaded,
  now: tone.now,
  start: tone.start,
  getContext: tone.getContext,
}));

import {
  createPreviewInstrument,
  previewChord,
  previewChordTimeline,
  previewMidiNotes,
  setPreviewMidiNotesBpm,
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
  it("routes sampled Piano and every Electric Piano effect into the caller-owned output without changing default audition routing", async () => {
    const output = new tone.AudioNode();
    const piano = await createPreviewInstrument("piano", output as never);
    const sampler = tone.samplers[tone.samplers.length - 1]!;
    expect(sampler.connect).toHaveBeenCalledWith(output);
    piano.triggerAttack?.(["C4"], 1, 0.72);
    expect(sampler.triggerAttack).toHaveBeenCalledWith(["C4"], 1, 0.72);
    const ep = await createPreviewInstrument("electric-piano", output as never);
    const synth = tone.polySynths[tone.polySynths.length - 1]!;
    const chain = synth.chain.mock.calls[0]!;
    expect(chain).toHaveLength(6);
    expect(chain[chain.length - 1]).toBe(output);
    // Reverb is the final FX, upstream of the gate (its wet output cannot bypass rest silence).
    expect(chain[chain.length - 2]?.wet.value).toBe(0.12);
    ep.triggerAttack?.(["C4"], 2, 0.72);
    expect(synth.triggerAttack).toHaveBeenCalledWith(["C4"], 2, 0.72);
    ep.dispose();
    piano.dispose();
    expect(output.dispose).not.toHaveBeenCalled();
    tone.samplers.length = 0;
    tone.polySynths.length = 0;
    tone.voices.length = 0;
    tone.samplerOptions.length = 0;
  });
  beforeEach(() => {
    vi.useFakeTimers();
    tone.setContext(tone.newContext());
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ({
      ok: true, arrayBuffer: async () => new ArrayBuffer(4),
    })));
  });

  afterEach(async () => {
    stopPreview();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates the selected sampled piano and electric-piano synth", async () => {
    await previewChord(chord, "piano");
    await previewChord(chord, "electric-piano");

    expect(tone.start).toHaveBeenCalledTimes(2);
    expect(tone.samplers).toHaveLength(1);
    const pianoUrls = (tone.samplerOptions[0] as { urls: Record<string, AudioBuffer> }).urls;
    expect(Object.keys(pianoUrls)).toEqual(["A0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
    expect(Object.values(pianoUrls)).toHaveLength(8);
    expect(Object.values(pianoUrls).every((buffer) => typeof buffer === "object")).toBe(true);
    expect(tone.voices).toEqual([tone.FMSynth]);

    tone.setContext(tone.newContext());
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await expect(previewChord(chord, "piano")).rejects.toThrow("offline");

    expect(tone.samplers).toHaveLength(1);
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

  it("decodes once across concurrent factories and gives each caller an independent disposable Sampler", async () => {
    const before = tone.samplers.length;
    const instruments = await Promise.all(Array.from({ length: 12 }, () => createPreviewInstrument("piano")));
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(tone.getContext().decodeAudioData).toHaveBeenCalledTimes(8);
    const options = tone.samplerOptions.slice(-12) as { urls: Record<string, AudioBuffer>; release: number }[];
    expect(options.every(o => o.urls === options[0]!.urls && o.release === 1)).toBe(true);
    instruments[0]!.dispose();
    instruments[1]!.triggerAttackRelease("C4", 0.7, 2, 0.3);
    expect(tone.samplers[before + 1]!.triggerAttackRelease).toHaveBeenCalledWith("C4", 0.7, 2, 0.3);
    expect(tone.samplers[before + 1]!.dispose).not.toHaveBeenCalled();
    const warm = await createPreviewInstrument("piano");
    expect(fetch).toHaveBeenCalledTimes(8);
    instruments.slice(1).forEach(i => i.dispose());
    warm.dispose();
  });

  it("retries a failed sample set without publishing a partial cache", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await expect(createPreviewInstrument("piano")).rejects.toThrow("offline");
    const next = await createPreviewInstrument("piano");
    expect(fetch).toHaveBeenCalledTimes(16);
    next.dispose();
  });

  it("does not resurrect a stopped or superseded preview when a shared decode finishes", async () => {
    const pending: Array<(buffer: unknown) => void> = [];
    tone.getContext().decodeAudioData.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const oldStarted = vi.fn(), oldEnded = vi.fn(), nextStarted = vi.fn();
    const note = [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 70 }];
    const old = previewMidiNotes(note, 120, "piano", { onStarted: oldStarted, onEnded: oldEnded });
    await vi.advanceTimersByTimeAsync(0);
    stopPreview();
    const next = previewMidiNotes(note, 120, "piano", { onStarted: nextStarted });
    await vi.advanceTimersByTimeAsync(0);
    pending.forEach(resolve => resolve({ length: 100, numberOfChannels: 2 }));
    await Promise.all([old, next]);
    expect(oldStarted).not.toHaveBeenCalled();
    expect(oldEnded).toHaveBeenCalledExactlyOnceWith("stopped");
    expect(nextStarted).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it("serializes context replacement against pending decode and rejects the stale result", async () => {
    const pending: Array<(buffer: unknown) => void> = [];
    const oldContext = tone.getContext();
    oldContext.decodeAudioData.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const old = createPreviewInstrument("piano");
    const rejection = expect(old).rejects.toThrow("context changed");
    await vi.advanceTimersByTimeAsync(0);
    tone.setContext(tone.newContext());
    const next = createPreviewInstrument("piano");
    expect(fetch).toHaveBeenCalledTimes(8);
    pending.forEach(resolve => resolve({ length: 100, numberOfChannels: 2 }));
    await rejection;
    (await next).dispose();
    expect(fetch).toHaveBeenCalledTimes(16);
    expect(tone.getContext().decodeAudioData).toHaveBeenCalledTimes(8);
  });

  it("times out without overlapping an unabortable decode, then allows a clean retry", async () => {
    const pending: Array<(buffer: unknown) => void> = [];
    const context = tone.getContext();
    context.decodeAudioData.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const first = createPreviewInstrument("piano");
    const rejected = expect(first).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(6000);
    await rejected;
    await expect(createPreviewInstrument("piano")).rejects.toThrow("timeout");
    expect(fetch).toHaveBeenCalledTimes(8);
    pending.forEach(resolve => resolve({ length: 100, numberOfChannels: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    context.decodeAudioData.mockImplementation(async () => ({ length: 100, numberOfChannels: 2 }));
    (await createPreviewInstrument("piano")).dispose();
    expect(fetch).toHaveBeenCalledTimes(16);
  });

  it("keeps the cache across suspend/resume, releases it on close, and never retains an oversized set", async () => {
    const context = tone.getContext();
    (await createPreviewInstrument("piano")).dispose();
    context.state = "suspended";
    (await createPreviewInstrument("piano")).dispose();
    context.state = "running";
    (await createPreviewInstrument("piano")).dispose();
    expect(fetch).toHaveBeenCalledTimes(8);
    context.state = "closed";
    context.on.mock.calls[0]![1]();
    await expect(createPreviewInstrument("piano")).rejects.toThrow("context changed");
    const replacement = tone.newContext();
    replacement.sampleRate = 96000;
    replacement.decodeAudioData.mockImplementation(async () => ({ length: 4_000_000, numberOfChannels: 2 }));
    tone.setContext(replacement);
    (await createPreviewInstrument("piano")).dispose();
    (await createPreviewInstrument("piano")).dispose();
    expect(fetch).toHaveBeenCalledTimes(24);
  });

  it("bounds a replacement caller's wait even if the previous decode never settles", async () => {
    const pending: Array<(buffer: unknown) => void> = [];
    tone.getContext().decodeAudioData.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const old = createPreviewInstrument("piano");
    const oldRejected = expect(old).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(0);
    tone.setContext(tone.newContext());
    const next = createPreviewInstrument("piano");
    const nextRejected = expect(next).rejects.toThrow("Previous piano decode");
    await vi.advanceTimersByTimeAsync(6000);
    await Promise.all([oldRejected, nextRejected]);
    expect(fetch).toHaveBeenCalledTimes(8);
    pending.forEach(resolve => resolve({ length: 100, numberOfChannels: 2 }));
    await vi.advanceTimersByTimeAsync(0);
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
    "preserves retirement and %s playback when chord cards are clicked rapidly",
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

      expect(instruments).toHaveLength(instrumentCount + (sound === "piano" ? 2 : 1));
      expect(active.triggerAttackRelease).toHaveBeenCalledTimes(sound === "piano" ? 1 : 2);
      expect(active.releaseAll).toHaveBeenCalledOnce();
      expect(active.dispose).not.toHaveBeenCalled();
      expect(ended).toHaveBeenCalledOnce();
      expect(ended).toHaveBeenCalledWith("stopped");

      await vi.advanceTimersByTimeAsync(PREVIEW_RELEASE_TAIL_MS_FOR_TEST);
      if (sound === "piano") expect(active.dispose).toHaveBeenCalledOnce();
      else expect(active.dispose).not.toHaveBeenCalled();
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
    const output = tone.gains[tone.gains.length - 1]!;
    stopPreview();
    expect(ended).toHaveBeenCalledWith("stopped");
    expect(electric.releaseAll).toHaveBeenCalled();
    // not thrown away on the spot: the gain at the end of the chain is brought to zero over 15 ms, and a timer throws it away 40 ms later
    expect(output.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.015);
    expect(output.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(electric.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(39);
    expect(electric.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(electric.dispose).toHaveBeenCalledOnce();
    expect(output.dispose).toHaveBeenCalledOnce();
    const triggerCount = electric.triggerAttackRelease.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(electric.triggerAttackRelease).toHaveBeenCalledTimes(triggerCount);
  });

  it("retimes future Text attacks and releases without disposing a sounding instrument", async () => {
    tone.setAudioNow(0);
    await previewMidiNotes([
      { pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100 },
      { pitch: 64, startBeat: 4, durationBeats: 1, velocity: 100 },
    ], 120, "electric-piano", {}, undefined, { dynamicTempo: true });
    const electric = tone.polySynths[tone.polySynths.length - 1]!;
    expect(electric.triggerAttack).toHaveBeenCalledWith("C4", 0, 100 / 127);
    expect(electric.triggerRelease).not.toHaveBeenCalled();
    tone.setAudioNow(1);
    expect(setPreviewMidiNotesBpm(60)).toBe(true);
    expect(electric.releaseAll).not.toHaveBeenCalled();
    expect(electric.dispose).not.toHaveBeenCalled();
    tone.setAudioNow(3);
    await vi.advanceTimersByTimeAsync(30);
    expect(electric.triggerRelease).toHaveBeenCalledWith("C4", 3);
    expect(electric.triggerAttack).toHaveBeenCalledWith("E4", 3, 100 / 127);
    expect(electric.triggerAttack).toHaveBeenCalledTimes(2);
    stopPreview();
    expect(setPreviewMidiNotesBpm(90)).toBe(false);
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
    expect(bass.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(bass.dispose).toHaveBeenCalledOnce();
  });

  it("gives every instrument its own gain at the end of its chain, and throws it away with the instrument at the end of a preview", async () => {
    tone.setAudioNow(0);
    const gainsBefore = tone.gains.length;
    await previewMidiNotes([{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 }], 120, "electric-piano");
    expect(tone.gains).toHaveLength(gainsBefore + 1);
    const output = tone.gains[gainsBefore]!;
    const electric = tone.polySynths[tone.polySynths.length - 1]!;
    // the last node of the chain is that gain
    const chained = electric.chain.mock.calls[0]!;
    expect(chained[chained.length - 1]).toBe(output);
    // a natural end is unchanged: after the tail it is released and thrown away on the spot, with its gain
    await vi.advanceTimersByTimeAsync(500 + 1_100);
    expect(electric.releaseAll).toHaveBeenCalledOnce();
    expect(electric.dispose).toHaveBeenCalledOnce();
    expect(output.dispose).toHaveBeenCalledOnce();
    expect(output.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("a stop without scheduled notes is as soft as before: released, kept 1.1 s for the next chord, then thrown away with its gain", async () => {
    const gainsBefore = tone.gains.length;
    await previewChord(chord, "electric-piano");
    const electric = tone.polySynths[tone.polySynths.length - 1]!;
    const output = tone.gains[gainsBefore]!;
    stopPreview();
    expect(electric.releaseAll).toHaveBeenCalledOnce();
    expect(output.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_099);
    expect(electric.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(electric.dispose).toHaveBeenCalledOnce();
    expect(output.dispose).toHaveBeenCalledOnce();
  });

  it("a burst of stops keeps at most two instruments fading: the oldest is thrown away at once, the others by the timer", async () => {
    const note = [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 }];
    const made: Array<InstanceType<typeof tone.AudioNode>> = [];
    for (let index = 0; index < 3; index += 1) {
      await previewMidiNotes(note, 120, "electric-piano");
      made.push(tone.polySynths[tone.polySynths.length - 1]!);
      stopPreview();
    }
    expect(made[0]!.dispose).toHaveBeenCalledOnce();
    expect(made[1]!.dispose).not.toHaveBeenCalled();
    expect(made[2]!.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(made[1]!.dispose).toHaveBeenCalledOnce();
    expect(made[2]!.dispose).toHaveBeenCalledOnce();
    expect(made[0]!.dispose).toHaveBeenCalledOnce();
  });

  it("the next preview starts at once with a new instrument while the old one fades (the audio clock does not have to run)", async () => {
    const note = [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 }];
    await previewMidiNotes(note, 120, "electric-piano");
    const first = tone.polySynths[tone.polySynths.length - 1]!;
    await previewMidiNotes(note, 120, "electric-piano");
    const second = tone.polySynths[tone.polySynths.length - 1]!;
    expect(second).not.toBe(first);
    expect(second.triggerAttackRelease).toHaveBeenCalled();
    expect(first.dispose).not.toHaveBeenCalled();
    // the audio time stays where it is: the timer throws the old one away all the same
    await vi.advanceTimersByTimeAsync(40);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();
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
    // the old graph is fading while the new one starts, and is thrown away by the timer
    expect(bass.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(bass.dispose).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(460);
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
