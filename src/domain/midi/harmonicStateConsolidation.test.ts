import { describe, expect, it } from "vitest";
import {
  generateP524SyntheticFixtures,
  generateP524DenseBenchmarkNotes,
  type P524SyntheticFixture,
} from "../../../scripts/p524/harmonicFragmentFixtures";
import { analyzeMidi } from "./analysis";
import {
  harmonicStateConsolidationAnalyzerVersion,
  harmonicStateConsolidationFeatureFlag,
  prepareHarmonicStateAnalyzerOptions,
} from "./harmonicStateConsolidation";
import type { MidiAnalyzerMode, MidiSongData } from "./types";

const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);

describe("P5.24 production Harmonic State integration", () => {
  it("keeps omission and explicit false on the exact legacy path", () => {
    const fixture = requiredFixture("C");
    const preparedData = preparedFixture(fixture);
    const options = { preparedData, mode: "phase4-v1" as const };
    const legacy = analyzeMidi(bytes, options);
    const off = analyzeMidi(bytes, { ...options, enableHarmonicStateConsolidation: false });

    expect(harmonicStateConsolidationFeatureFlag).toBe("enableHarmonicStateConsolidation");
    expect(off).toEqual(legacy);
    expect(JSON.stringify(off)).toBe(JSON.stringify(legacy));
    expect(prepareHarmonicStateAnalyzerOptions(bytes, options)).toEqual({
      applied: false,
      options,
      reason: "flag-off",
    });
  });

  it("uses literal true and leaves the caller's prepared MIDI untouched", () => {
    const fixture = requiredFixture("E");
    const preparedData = preparedFixture(fixture);
    const before = structuredClone(preparedData);
    const options = { preparedData, mode: "phase4-v1" as const, enableHarmonicStateConsolidation: true };
    const prepared = prepareHarmonicStateAnalyzerOptions(bytes, options);

    expect(prepared).toMatchObject({ applied: true, reason: "applied" });
    expect(prepared.options).not.toBe(options);
    expect(prepared.options.preparedData).not.toBe(preparedData);
    expect(preparedData).toEqual(before);
    expect(prepared.options.preparedData?.tempoChanges).toEqual(preparedData.tempoChanges);
    expect(prepared.options.preparedData?.timeSignature).toBe(preparedData.timeSignature);
    expect(prepared.options.preparedData?.ticksPerBeat).toBe(preparedData.ticksPerBeat);
  });

  it("feeds A-J consolidated states into the existing analyzer and candidate pipeline", () => {
    for (const id of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const) {
      const fixture = requiredFixture(id);
      const result = analyzeMidi(bytes, {
        preparedData: preparedFixture(fixture),
        mode: "phase4-v1",
        enableHarmonicStateConsolidation: true,
      });
      expect(result.analyzerVersion, id).toBe(harmonicStateConsolidationAnalyzerVersion);
      expect(result.fullTimeline.length, id).toBeGreaterThan(0);
      expect(result.blockCandidates.length, id).toBeGreaterThan(0);
      expect(result.fullTimeline.map((item) => item.chord.label.split("/")[0]), id)
        .toEqual(fixture.expectedStates
          .map((state) => state.label.replace("(add9)", "add9").split("/")[0]));
      expect(result.fullTimeline.map((item) => [(item.bar - 1) * 4 + item.beat, item.durationBeats]), id)
        .toEqual(fixture.expectedStates.map((state) => [state.startBeat + 1, state.endBeat - state.startBeat]));
    }
  });

  it("falls back exactly for mixed rhythm, unsupported meter, and corrupt data", () => {
    const mixed = preparedFixture(requiredFixture("K"));
    expectEnabledFallbackEqualsOff(mixed);
    expectEnabledFallbackEqualsOff({ ...mixed, timeSignature: "3/4" });
    expectEnabledFallbackEqualsOff({ ...mixed, ticksPerBeat: 0 });
  });

  it.each([
    ["default window", undefined],
    ["explicit coarse window", 4 as const],
  ])("preserves every HR=1 boundary with %s", (_label, beatsPerWindow) => {
    const preparedData = preparedHarmonicRhythmOne();
    const options = {
      preparedData,
      ...(beatsPerWindow === undefined ? {} : { beatsPerWindow }),
      enableHarmonicStateConsolidation: true,
    };
    const prepared = prepareHarmonicStateAnalyzerOptions(bytes, options);
    const result = analyzeMidi(bytes, options);

    expect(prepared).toMatchObject({ applied: true, reason: "applied" });
    expect(prepared.options.beatsPerWindow).toBe(1);
    expect(result.analyzerVersion).toBe(harmonicStateConsolidationAnalyzerVersion);
    expect(result.fullTimeline.map((item) => [(item.bar - 1) * 4 + item.beat, item.durationBeats]))
      .toEqual(Array.from({ length: 8 }, (_, index) => [index + 1, 1]));
  });

  it("falls back exactly for every non-default analyzer mode and accuracy union", () => {
    const preparedData = preparedAba();
    const unsupportedModes: readonly Exclude<MidiAnalyzerMode, "phase4-v1">[] = [
      "legacy",
      "hybrid-v1",
      "legacy-boundary-rerank",
      "voice-aware-rerank-v1",
      "phase4.1-v1",
      "phase4.1.2-v1",
      "phase4.1.2-core-v1",
      "phase4.1.2-g2-v1",
      "phase4.1.2-core-g2-v1",
    ];
    for (const mode of unsupportedModes) {
      const options = { preparedData, mode };
      const off = analyzeMidi(bytes, options);
      const on = analyzeMidi(bytes, { ...options, enableHarmonicStateConsolidation: true });
      const prepared = prepareHarmonicStateAnalyzerOptions(bytes, {
        ...options,
        enableHarmonicStateConsolidation: true,
      });
      expect(JSON.stringify(on), mode).toBe(JSON.stringify(off));
      expect(on.analyzerVersion, mode).not.toBe(harmonicStateConsolidationAnalyzerVersion);
      expect(prepared).toMatchObject({ applied: false, reason: "unsupported-analyzer-mode" });
    }

    const unionOptions = {
      preparedData,
      mode: "phase4-v1" as const,
      accuracyFirst: { enableAccuracyCandidateUnion: true },
    };
    const off = analyzeMidi(bytes, unionOptions);
    const on = analyzeMidi(bytes, {
      ...unionOptions,
      enableHarmonicStateConsolidation: true,
    });
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    expect(on.analyzerVersion).not.toBe(harmonicStateConsolidationAnalyzerVersion);
  });

  it("indexes many track hints once with one lookup per evidence note", () => {
    const notes = generateP524DenseBenchmarkNotes(128);
    const base = preparedNotes(notes, 1_024);
    const preparedData = {
      ...base,
      tracks: [
        ...base.tracks,
        ...Array.from({ length: 4_096 }, (_, index) => ({
          index: index + 2,
          name: "",
        })),
      ],
    };
    const started = performance.now();
    const prepared = prepareHarmonicStateAnalyzerOptions(bytes, {
      preparedData,
      enableHarmonicStateConsolidation: true,
    });
    expect(prepared).toMatchObject({
      applied: true,
      reason: "applied",
      operations: {
        inputNotes: 3_072,
        tracksIndexed: 4_098,
        trackLookups: 3_072,
      },
    });
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("keeps dense production projection bounded", () => {
    const notes = generateP524DenseBenchmarkNotes(128);
    const preparedData = preparedNotes(notes, 1_024);
    const started = performance.now();
    const prepared = prepareHarmonicStateAnalyzerOptions(bytes, {
      preparedData,
      mode: "phase4-v1",
      enableHarmonicStateConsolidation: true,
    });
    expect(prepared).toMatchObject({ applied: true, reason: "applied" });
    expect(prepared.options.preparedData?.notes).toHaveLength(1_536);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("is deterministic when enabled", () => {
    const preparedData = preparedFixture(requiredFixture("D"));
    const options = {
      preparedData,
      mode: "phase4-v1" as const,
      enableHarmonicStateConsolidation: true,
    };
    expect(analyzeMidi(bytes, options)).toEqual(analyzeMidi(bytes, options));
  });
});

function expectEnabledFallbackEqualsOff(preparedData: MidiSongData): void {
  const off = analyzeMidi(bytes, { preparedData, mode: "phase4-v1" });
  const on = analyzeMidi(bytes, {
    preparedData,
    mode: "phase4-v1",
    enableHarmonicStateConsolidation: true,
  });
  expect(on).toEqual(off);
  expect(JSON.stringify(on)).toBe(JSON.stringify(off));
}

function requiredFixture(id: P524SyntheticFixture["id"]): P524SyntheticFixture {
  const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === id);
  if (fixture === undefined) throw new Error(`missing P5.24 fixture ${id}`);
  return fixture;
}

function preparedHarmonicRhythmOne(): MidiSongData {
  return preparedStateSequence([
    [36, 52, 55, 60],
    [43, 50, 55, 59],
    [36, 52, 55, 60],
    [43, 50, 55, 59],
    [41, 48, 53, 57],
    [36, 52, 55, 60],
    [41, 48, 53, 57],
    [36, 52, 55, 60],
  ], 1, 0.5);
}

function preparedAba(): MidiSongData {
  return preparedStateSequence([
    [36, 52, 55, 60],
    [43, 50, 55, 59],
    [36, 52, 55, 60],
    [36, 52, 55, 60],
  ], 2, 1);
}

function preparedStateSequence(
  states: readonly (readonly number[])[],
  stateBeats: number,
  attackSpacing: number,
): MidiSongData {
  const ticksPerBeat = 480;
  const notes = states.flatMap((pitches, stateIndex) => Array.from(
    { length: stateBeats / attackSpacing },
    (_, attackIndex) => pitches.map((pitch, pitchIndex) => ({
      pitch,
      startTick: (stateIndex * stateBeats + attackIndex * attackSpacing) * ticksPerBeat,
      durationTick: attackSpacing * 0.85 * ticksPerBeat,
      velocity: 0.8,
      trackIndex: pitchIndex === 0 ? 0 : 1,
      channel: pitchIndex === 0 ? 0 : 1,
      program: pitchIndex === 0 ? 33 : 0,
      programExplicit: true,
    })),
  )).flat();
  return {
    notes,
    tempo: 120,
    tempoChanges: [{ tick: 0, bpm: 120 }],
    timeSignature: "4/4",
    ticksPerBeat,
    totalBars: states.length * stateBeats / 4,
    tracks: [
      { index: 0, name: "Synthetic Bass", channel: 0, program: 33, roleHint: "bass" },
      { index: 1, name: "Synthetic Piano", channel: 1, program: 0, roleHint: "harmony" },
    ],
    controlChanges: [],
  };
}

function preparedNotes(
  notes: P524SyntheticFixture["notes"],
  totalBeats: number,
): MidiSongData {
  return preparedFixture({ ...requiredFixture("E"), notes, totalBeats });
}

function preparedFixture(fixture: P524SyntheticFixture): MidiSongData {
  const ticksPerBeat = 480;
  return {
    notes: fixture.notes.map((note) => ({
      pitch: note.pitch,
      startTick: note.startBeat * ticksPerBeat,
      durationTick: note.durationBeats * ticksPerBeat,
      velocity: note.velocity,
      trackIndex: note.expectedLane === "bass" ? 0 : 1,
      channel: note.expectedLane === "bass" ? 0 : 1,
      program: note.expectedLane === "bass" ? 33 : 0,
      programExplicit: true,
    })),
    tempo: 120,
    tempoChanges: [{ tick: 0, bpm: 120 }],
    timeSignature: "4/4",
    ticksPerBeat,
    totalBars: fixture.totalBeats / 4,
    tracks: [
      { index: 0, name: "Synthetic Bass", channel: 0, program: 33, roleHint: "bass" },
      { index: 1, name: "Synthetic Piano", channel: 1, program: 0, roleHint: "harmony" },
    ],
    controlChanges: [],
  };
}
