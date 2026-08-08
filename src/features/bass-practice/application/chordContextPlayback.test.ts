import { describe, expect, it, vi } from "vitest";
import { chordPitchClasses } from "../../../domain/chordVoicing";
import type { ChordQuality, ChordSymbol } from "../../../domain/types";
import {
  CHORD_CONTEXT_DEFAULT_MIX,
  CHORD_CONTEXT_MAX_COUNT_IN_BEATS,
  CHORD_CONTEXT_MAX_MIDI,
  CHORD_CONTEXT_MAX_SECTION_BEATS,
  CHORD_CONTEXT_MIN_MIDI,
  buildChordContextPlaybackPlan,
  createChordContextPlaybackEngine,
  resolveEnabledLayers,
  voiceChordContext,
  type ChordContextListenInput,
  type ChordContextPlaybackDriver,
  type ChordContextPlaybackLifecycle,
  type ChordContextPlayer,
  type ChordContextScheduledEvent,
} from "./chordContextPlayback";

const cMaj7: ChordSymbol = { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" };
const cMaj7OverE: ChordSymbol = { ...cMaj7, bass: 4, label: "Cmaj7/E" };
const g7OverB: ChordSymbol = { root: 7, bass: 11, quality: "dom7", tensions: ["9"], label: "G9/B" };

function listenInput(overrides: Partial<ChordContextListenInput> = {}): ChordContextListenInput {
  return {
    mode: "listen",
    listenMode: "bass-chords-and-metronome",
    bpm: 120,
    meter: { numerator: 4, denominator: 4 },
    countInBeats: 4,
    chordEvents: [
      { id: "chord:c", chord: cMaj7, startBeat: 0, durationBeats: 4 },
      { id: "chord:g", chord: g7OverB, startBeat: 4, durationBeats: 4 },
    ],
    bassEvents: [
      { id: "bass:c", pitch: 36, startBeat: 0, durationBeats: 1, velocity: 0.88 },
      { id: "bass:g", pitch: 43, startBeat: 4, durationBeats: 1, velocity: 0.72 },
    ],
    ...overrides,
  };
}

function playInput(playMode: "chords-only" | "chords-and-metronome" | "metronome-only" | "no-accompaniment") {
  const base = listenInput();
  return {
    mode: "play" as const,
    playMode,
    bpm: base.bpm,
    meter: base.meter,
    countInBeats: base.countInBeats,
    chordEvents: base.chordEvents,
    bassEvents: base.bassEvents,
  };
}

function pitchClasses(notes: readonly number[]): number[] {
  return [...new Set(notes.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b);
}

class FakePlayer implements ChordContextPlayer {
  readonly scheduled: ChordContextScheduledEvent[] = [];
  readonly stop = vi.fn();
  readonly dispose = vi.fn();
  constructor(private readonly lifecycle: ChordContextPlaybackLifecycle) {}
  schedule(event: ChordContextScheduledEvent): void { this.scheduled.push(event); }
  complete(): void { this.lifecycle.onCompleted(); }
}

function fakeDriver() {
  const players: FakePlayer[] = [];
  const driver: ChordContextPlaybackDriver = {
    createPlayer: vi.fn((_mix, lifecycle) => {
      const player = new FakePlayer(lifecycle);
      players.push(player);
      return player;
    }),
  };
  return { driver, players };
}

describe("Chord Context upper voicing", () => {
  it("uses deterministic chord tones only in the locked upper register", () => {
    const first = voiceChordContext(g7OverB);
    const second = voiceChordContext(structuredClone(g7OverB));

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected a supported voicing.");
    expect(first.notes).toEqual([...first.notes].sort((left, right) => left - right));
    expect(first.notes.every((note) => note >= CHORD_CONTEXT_MIN_MIDI && note <= CHORD_CONTEXT_MAX_MIDI)).toBe(true);
    expect(pitchClasses(first.notes)).toEqual([...chordPitchClasses(g7OverB)].sort((left, right) => left - right));
  });

  it("uses slash-bass metadata for a deterministic upper-structure selection without adding low bass", () => {
    const rootPosition = voiceChordContext(cMaj7);
    const slashPosition = voiceChordContext(cMaj7OverE);
    expect(rootPosition.ok).toBe(true);
    expect(slashPosition.ok).toBe(true);
    if (!rootPosition.ok || !slashPosition.ok) throw new Error("Expected supported voicings.");

    expect(slashPosition.notes).not.toEqual(rootPosition.notes);
    expect(pitchClasses(slashPosition.notes)).toEqual([...chordPitchClasses(cMaj7OverE)].sort((left, right) => left - right));
    expect(slashPosition.notes.every((note) => note >= 57 && note <= 76)).toBe(true);
    expect(slashPosition.notes.some((note) => note < 57)).toBe(false);
  });

  it("keeps deterministic voice leading for a cloned progression", () => {
    const first = buildChordContextPlaybackPlan(listenInput());
    const second = buildChordContextPlaybackPlan(structuredClone(listenInput()));
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("rejects an unsupported chord before it can create an audio session", () => {
    const unsupported = { ...cMaj7, quality: "made-up" as unknown as ChordQuality };
    const result = buildChordContextPlaybackPlan(listenInput({ chordEvents: [{ id: "unsupported", chord: unsupported, startBeat: 0, durationBeats: 1 }] }));
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "unsupported-chord", eventId: "unsupported" }) }));
  });
});

describe("Chord Context deterministic scheduler", () => {
  it("uses one beat time base for count-in, Bass, Chords, and Metronome with the locked mix", () => {
    const result = buildChordContextPlaybackPlan(listenInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a plan.");

    expect(result.plan.mix).toEqual(CHORD_CONTEXT_DEFAULT_MIX);
    expect(result.plan.enabledLayers).toEqual(["bass", "chords", "metronome"]);
    expect(result.plan.events.find((event) => event.id === "chord:c")).toMatchObject({ layer: "chords", timeSeconds: 2, durationSeconds: 2, gainDb: -12 });
    expect(result.plan.events.find((event) => event.id === "bass:c")).toMatchObject({ layer: "bass", timeSeconds: 2, durationSeconds: 0.5, gainDb: 0 });
    const clicks = result.plan.events.filter((event) => event.layer === "metronome");
    expect(clicks).toHaveLength(12);
    expect(clicks[0]).toMatchObject({ beat: -4, timeSeconds: 0, countIn: true, accent: true, gainDb: -9 });
    expect(clicks[4]).toMatchObject({ beat: 0, timeSeconds: 2, countIn: false, accent: true });
  });

  it("keeps Play target-bass silent for every Play layer selection", () => {
    const cases = [
      ["chords-only", ["chords"]],
      ["chords-and-metronome", ["chords", "metronome"]],
      ["metronome-only", ["metronome"]],
      ["no-accompaniment", []],
    ] as const;
    for (const [playMode, expectedLayers] of cases) {
      const result = buildChordContextPlaybackPlan(playInput(playMode));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected a plan.");
      expect(result.plan.enabledLayers).toEqual(expectedLayers);
      expect(result.plan.events.some((event) => event.layer === "bass")).toBe(false);
    }
  });

  it("exposes the documented Listen and Play defaults", () => {
    expect(resolveEnabledLayers({ mode: "listen" })).toEqual(["bass", "chords"]);
    expect(resolveEnabledLayers({ mode: "play" })).toEqual(["chords"]);
  });
});

describe("Chord Context input safety", () => {
  it("validates disabled-layer timing before phrase end and bounds the locked section", () => {
    const disabledBass = buildChordContextPlaybackPlan(playInput("no-accompaniment") as unknown as ChordContextListenInput);
    expect(disabledBass.ok).toBe(true);
    const invalidDisabledBass = buildChordContextPlaybackPlan({
      ...playInput("no-accompaniment"),
      bassEvents: [{ id: "bass:infinite", pitch: 36, startBeat: Number.POSITIVE_INFINITY, durationBeats: 1, velocity: 0.8 }],
    } as unknown as ChordContextListenInput);
    expect(invalidDisabledBass).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-event", eventId: "bass:infinite" }) }));

    const invalidDisabledChord = buildChordContextPlaybackPlan(listenInput({
      listenMode: "bass-only",
      chordEvents: [{ id: "chord:nan", chord: cMaj7, startBeat: Number.NaN, durationBeats: 1 }],
    }));
    expect(invalidDisabledChord).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-event", eventId: "chord:nan" }) }));
    const outOfSection = buildChordContextPlaybackPlan(listenInput({ chordEvents: [{ id: "chord:long", chord: cMaj7, startBeat: CHORD_CONTEXT_MAX_SECTION_BEATS, durationBeats: 0.5 }] }));
    expect(outOfSection).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-event", eventId: "chord:long" }) }));
    expect(buildChordContextPlaybackPlan(listenInput({ countInBeats: CHORD_CONTEXT_MAX_COUNT_IN_BEATS + 1 }))).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-count-in" }) }));
  });

  it("rejects malformed or stale mode state without a fallthrough exception", () => {
    const staleMode = { ...listenInput(), mode: "retired-mode" } as unknown as ChordContextListenInput;
    const crossMode = { ...playInput("chords-only"), listenMode: "bass-only" } as unknown as ChordContextListenInput;
    expect(resolveEnabledLayers(staleMode)).toBeUndefined();
    expect(resolveEnabledLayers(crossMode)).toBeUndefined();
    expect(buildChordContextPlaybackPlan(staleMode)).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-mode" }) }));
    expect(buildChordContextPlaybackPlan(crossMode)).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-mode" }) }));
  });
});

describe("Chord Context playback lifecycle", () => {
  it("replaces a repeated start and releases the prior driver session", () => {
    const { driver, players } = fakeDriver();
    const engine = createChordContextPlaybackEngine(driver);
    expect(engine.start(listenInput()).ok).toBe(true);
    expect(engine.start(listenInput({ bpm: 100 })).ok).toBe(true);

    expect(players).toHaveLength(2);
    expect(players[0].stop).toHaveBeenCalledOnce();
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(players[1].scheduled).not.toHaveLength(0);
    expect(engine.getActivePlan()).toMatchObject({ bpm: 100 });
  });

  it("releases a natural completion exactly once and keeps a completed session inactive", () => {
    const { driver, players } = fakeDriver();
    const engine = createChordContextPlaybackEngine(driver);
    expect(engine.start(listenInput()).ok).toBe(true);
    players[0].complete();
    players[0].complete();
    expect(players[0].stop).toHaveBeenCalledOnce();
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(engine.getActivePlan()).toBeUndefined();
  });

  it("releases an old session for an empty plan without creating a new audio graph", () => {
    const { driver, players } = fakeDriver();
    const engine = createChordContextPlaybackEngine(driver);
    expect(engine.start(listenInput()).ok).toBe(true);
    expect(players).toHaveLength(1);

    expect(engine.start({ ...playInput("no-accompaniment"), chordEvents: [], bassEvents: [] }).ok).toBe(true);
    expect(players).toHaveLength(1);
    expect(players[0].stop).toHaveBeenCalledOnce();
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(engine.getActivePlan()).toBeUndefined();
  });

  it("attempts dispose after throwing stop and preserves the old cleanup error without leaking the replacement", () => {
    const { driver, players } = fakeDriver();
    const engine = createChordContextPlaybackEngine(driver);
    expect(engine.start(listenInput()).ok).toBe(true);
    const primary = new Error("old stop failed");
    players[0].stop.mockImplementation(() => { throw primary; });

    const result = engine.start(listenInput({ bpm: 100 }));
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "driver-failure", message: "old stop failed" }) }));
    expect(players).toHaveLength(2);
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(players[1].scheduled).toHaveLength(0);
    expect(players[1].stop).toHaveBeenCalledOnce();
    expect(players[1].dispose).toHaveBeenCalledOnce();
    expect(engine.getActivePlan()).toBeUndefined();
  });

  it("attempts dispose after stop and dispose failures while preserving the primary stop failure", () => {
    const { driver, players } = fakeDriver();
    const engine = createChordContextPlaybackEngine(driver);
    expect(engine.start(listenInput()).ok).toBe(true);
    const primary = new Error("stop failed");
    players[0].stop.mockImplementation(() => { throw primary; });
    players[0].dispose.mockImplementation(() => { throw new Error("dispose failed"); });

    expect(() => engine.dispose()).toThrow(primary);
    expect(players[0].stop).toHaveBeenCalledOnce();
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(engine.getActivePlan()).toBeUndefined();
  });

  it("releases every scheduled session after rapid replay and route/tab/mode disposal", () => {
    const { driver, players } = fakeDriver();
    const engine = createChordContextPlaybackEngine(driver);
    for (let index = 0; index < 20; index += 1) expect(engine.start(listenInput({ bpm: 80 + index })).ok).toBe(true);
    expect(players).toHaveLength(20);
    for (const player of players.slice(0, -1)) {
      expect(player.stop).toHaveBeenCalledOnce();
      expect(player.dispose).toHaveBeenCalledOnce();
    }
    engine.dispose();
    expect(players[19].stop).toHaveBeenCalledOnce();
    expect(players[19].dispose).toHaveBeenCalledOnce();
    expect(engine.getActivePlan()).toBeUndefined();
  });
});

describe("Chord Context second-review safety", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, null, "B"])("rejects malformed optional slash bass %# as unsupported before voicing", (bass) => {
    const malformed = { ...cMaj7, bass } as unknown as ChordSymbol;
    const result = buildChordContextPlaybackPlan(listenInput({
      chordEvents: [{ id: "chord:malformed-bass", chord: malformed, startBeat: 0, durationBeats: 1 }],
    }));
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "unsupported-chord", eventId: "chord:malformed-bass" }) }));
  });

  it("uses defaults only for exactly undefined mode values", () => {
    const invalidListen = { ...listenInput(), listenMode: null } as unknown as ChordContextListenInput;
    const invalidPlay = { ...playInput("chords-only"), playMode: "stale" } as unknown as ChordContextListenInput;
    expect(resolveEnabledLayers({ mode: "listen", listenMode: undefined })).toEqual(["bass", "chords"]);
    expect(resolveEnabledLayers({ mode: "play", playMode: undefined })).toEqual(["chords"]);
    expect(resolveEnabledLayers(invalidListen)).toBeUndefined();
    expect(resolveEnabledLayers(invalidPlay)).toBeUndefined();
    expect(buildChordContextPlaybackPlan(invalidListen)).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-mode" }) }));
    expect(buildChordContextPlaybackPlan(invalidPlay)).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-mode" }) }));
  });

  it("reports natural-completion cleanup failures without throwing and still releases every resource", () => {
    const { driver, players } = fakeDriver();
    const onError = vi.fn();
    const engine = createChordContextPlaybackEngine(driver, { onError });
    expect(engine.start(listenInput()).ok).toBe(true);
    const primary = new Error("natural stop failed");
    players[0].stop.mockImplementation(() => { throw primary; });
    players[0].dispose.mockImplementation(() => { throw new Error("natural dispose failed"); });

    expect(() => players[0].complete()).not.toThrow();
    expect(players[0].stop).toHaveBeenCalledOnce();
    expect(players[0].dispose).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(primary);
    expect(engine.getLastError()).toBe(primary);
    expect(engine.getActivePlan()).toBeUndefined();
  });
});
