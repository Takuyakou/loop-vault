import { describe, expect, it } from "vitest";
import { generateP524SyntheticFixtures } from "../p524/harmonicFragmentFixtures";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import {
  hasAppliedLocalHarmonicStateTimeline,
  localHarmonicStateConsolidationAnalyzerVersion,
  localHarmonicStateConsolidationFeatureFlag,
  prepareLocalHarmonicStateAnalyzerOptions,
} from "../../src/domain/midi/localHarmonicStateIntegration";
import type { AnalyzeMidiOptions, MidiSongData } from "../../src/domain/midi/types";
import {
  buildP526EightBarPreparedData,
  generateP526Fixtures,
  p526ExpectedEightBarTruth,
} from "./fixtures";

const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);

describe("P5.26-03 feature-flagged Local Harmonic State integration", () => {
  it("keeps omission and explicit false exact/deep equal to the existing path", () => {
    const preparedData = buildP526EightBarPreparedData();
    const options = { preparedData, mode: "phase4-v1" as const };
    const omitted = analyzeMidi(bytes, options);
    const off = analyzeMidi(bytes, { ...options, enableLocalHarmonicStateConsolidation: false });

    expect(localHarmonicStateConsolidationFeatureFlag).toBe("enableLocalHarmonicStateConsolidation");
    expect(off).toEqual(omitted);
    expect(JSON.stringify(off)).toBe(JSON.stringify(omitted));
    expect(prepareLocalHarmonicStateAnalyzerOptions(bytes, options)).toEqual({
      applied: false,
      options,
      reason: "flag-off",
    });
  });

  it("connects mixed Local HR and Structural Bass for the locked synthetic 8-bar truth", () => {
    const preparedData = buildP526EightBarPreparedData();
    const before = structuredClone(preparedData);
    const options: AnalyzeMidiOptions = {
      preparedData,
      mode: "phase4-v1",
      enableLocalHarmonicStateConsolidation: true,
    };
    const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, options);

    expect(preparation.fallbackReason).toBeUndefined();
    expect(preparation).toMatchObject({
      applied: true,
      reason: "applied",
      diagnostics: {
        globalQuarterBeats: "unknown",
        localPeriods: [4, 4, 2, 2, 4, 4, 2, 2],
        stateCount: 12,
      },
    });
    expect(hasAppliedLocalHarmonicStateTimeline(preparation.options)).toBe(true);
    expect(preparedData).toEqual(before);
    expect(preparation.options.preparedData?.tempoChanges).toEqual(preparedData.tempoChanges);
    expect(projectedRanges(preparation.options.preparedData!)).toEqual(
      p526ExpectedEightBarTruth.map((state) => [state.startBeat, state.endBeat]),
    );

    const result = analyzeMidi(bytes, options);
    expect(result.analyzerVersion).toBe(localHarmonicStateConsolidationAnalyzerVersion);
    expect(timelineRanges(result.fullTimeline)).toEqual(
      p526ExpectedEightBarTruth.map((state) => [state.startBeat, state.endBeat]),
    );
  });

  it("passes the production seam for L-Q and records zero M/O/Q false merges", () => {
    let hardFalseMerges = 0;
    for (const fixture of generateP526Fixtures()) {
      const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
        preparedData: preparedFixture(fixture.notes, 4),
        enableLocalHarmonicStateConsolidation: true,
      });
      expect(preparation.applied, fixture.id).toBe(true);
      expect(preparation.diagnostics?.stateCount, fixture.id).toBe(fixture.expectedDecision === "same" ? 1 : 2);
      if (fixture.falseMergeIsHardFail && preparation.diagnostics?.stateCount === 1) hardFalseMerges += 1;
    }
    expect(hardFalseMerges).toBe(0);
  });

  it("preserves the authoritative P5.24 A-K production boundaries", () => {
    for (const fixture of generateP524SyntheticFixtures()) {
      const preparedData = preparedFixture(fixture.notes, fixture.totalBeats);
      const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
        preparedData,
        enableLocalHarmonicStateConsolidation: true,
      });
      expect(preparation.applied, fixture.id).toBe(true);
      expect(preparation.diagnostics?.stateCount, fixture.id).toBe(fixture.expectedStates.length);
      expect(projectedRanges(preparation.options.preparedData!), fixture.id)
        .toEqual(fixture.expectedStates.map((state) => [state.startBeat, state.endBeat]));
    }
  });

  it("keeps Global-sufficient A-J affected outputs equal to P5.24 integration", () => {
    for (const fixture of generateP524SyntheticFixtures().slice(0, -1)) {
      const preparedData = preparedFixture(fixture.notes, fixture.totalBeats);
      const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
        preparedData,
        enableLocalHarmonicStateConsolidation: true,
      });
      expect(preparation.diagnostics?.projectionSource, fixture.id).toBe("global-retained");
      const global = analyzeMidi(bytes, {
        preparedData,
        enableHarmonicStateConsolidation: true,
      });
      const local = analyzeMidi(bytes, {
        preparedData,
        enableLocalHarmonicStateConsolidation: true,
      });
      expect({
        ...local,
        analyzerVersion: global.analyzerVersion,
      }, fixture.id).toEqual(global);
    }
  });

  it("retains supported Global HR and only uses strong Local override for mixed K", () => {
    const fixtures = generateP524SyntheticFixtures();
    for (const fixture of fixtures.slice(0, -1)) {
      const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
        preparedData: preparedFixture(fixture.notes, fixture.totalBeats),
        enableLocalHarmonicStateConsolidation: true,
      });
      expect(preparation.diagnostics?.globalQuarterBeats, fixture.id).toBe(fixture.expectedHarmonicRhythm);
      expect(new Set(preparation.diagnostics?.localPeriods), fixture.id)
        .toEqual(new Set([fixture.expectedHarmonicRhythm]));
    }
    const mixed = fixtures[fixtures.length - 1]!;
    const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
      preparedData: preparedFixture(mixed.notes, mixed.totalBeats),
      enableLocalHarmonicStateConsolidation: true,
    });
    expect(preparation.diagnostics).toMatchObject({
      globalQuarterBeats: "unknown",
      localPeriods: [4, 4, 2, 2],
    });
  });

  it("falls back to the exact legacy path for unknown, invalid, unsupported mode, and meter", () => {
    const base = preparedFixture([], 4);
    const cases: AnalyzeMidiOptions[] = [
      { preparedData: base },
      { preparedData: { ...base, ticksPerBeat: 0 } },
      { preparedData: { ...base, timeSignature: "3/4" } },
      { preparedData: buildP526EightBarPreparedData(), mode: "legacy" },
      {
        preparedData: buildP526EightBarPreparedData(),
        accuracyFirst: { enableAccuracyCandidateUnion: true },
      },
    ];
    for (const options of cases) {
      const off = analyzeMidi(bytes, options);
      const onOptions = { ...options, enableLocalHarmonicStateConsolidation: true };
      const on = analyzeMidi(bytes, onOptions);
      const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, onOptions);
      expect(preparation.applied).toBe(false);
      expect(preparation.options).toBe(onOptions);
      expect(on).toEqual(off);
      expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    }
  });

  it("is deterministic and keeps the existing key-aware spelling adapter downstream", () => {
    const preparedData = buildP526EightBarPreparedData();
    const options: AnalyzeMidiOptions = {
      preparedData,
      enableLocalHarmonicStateConsolidation: true,
      enableKeyAwareChordSpelling: true,
    };
    const first = analyzeMidi(bytes, options);
    expect(first).toEqual(analyzeMidi(bytes, structuredClone(options)));
    expect(first.analyzerVersion).toContain("p526-local-harmonic-state-v1");
    expect(first.analyzerVersion).toContain("p526-key-aware-spelling-v1");
  });

  it("reports linear bounded operation counts without private or final-label evidence", () => {
    const preparedData = repeatedPreparedData(256);
    const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
      preparedData,
      enableLocalHarmonicStateConsolidation: true,
    });
    expect(preparation.applied).toBe(true);
    expect(preparation.diagnostics).toMatchObject({
      inputNotes: 4_096,
      indexedBeatCells: 1_024,
      candidateEvaluations: 1_024,
    });
    expect(preparation.diagnostics!.noteCellAssignments).toBeLessThanOrEqual(4_096);
    expect(JSON.stringify(preparation.diagnostics)).not.toMatch(/(?:path|file|user|label|identity|raw)/i);
  });

  it("counts a long sustained note by the beat cells it actually covers", () => {
    const base = repeatedPreparedData(2);
    const bassTemplate = base.notes.find((note) => note.trackIndex === 0)!;
    const preparedData: MidiSongData = {
      ...base,
      notes: [
        { ...bassTemplate, startTick: 0, durationTick: base.ticksPerBeat * 8 },
        ...base.notes.filter((note) => note.trackIndex !== 0),
      ],
    };
    const preparation = prepareLocalHarmonicStateAnalyzerOptions(bytes, {
      preparedData,
      enableLocalHarmonicStateConsolidation: true,
    });

    expect(preparation.applied).toBe(true);
    expect(preparation.diagnostics).toMatchObject({
      inputNotes: 25,
      indexedBeatCells: 8,
      noteCellAssignments: 32,
      candidateEvaluations: 8,
    });
    expect(preparation.diagnostics!.noteCellAssignments)
      .toBeGreaterThan(preparation.diagnostics!.inputNotes);
    expect(preparation.diagnostics!.noteCellAssignments)
      .toBeLessThanOrEqual(preparation.diagnostics!.inputNotes * preparation.diagnostics!.indexedBeatCells);
  });
});

function preparedFixture(
  notes: readonly { readonly pitch: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number; readonly expectedLane: "bass" | "upper" }[],
  totalBeats: number,
): MidiSongData {
  const ticksPerBeat = 480;
  return {
    notes: notes.map((note) => ({
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
    totalBars: totalBeats / 4,
    tracks: [
      { index: 0, name: "Synthetic Bass", channel: 0, program: 33, roleHint: "bass" },
      { index: 1, name: "Synthetic Harmony", channel: 1, program: 0, roleHint: "harmony" },
    ],
    controlChanges: [],
  };
}

function projectedRanges(data: MidiSongData): readonly (readonly [number, number])[] {
  return [...new Set(data.notes.map((note) => `${note.startTick}:${note.startTick + note.durationTick}`))]
    .map((range) => range.split(":").map(Number) as [number, number])
    .sort((left, right) => left[0] - right[0])
    .map(([start, end]) => [start / data.ticksPerBeat, end / data.ticksPerBeat]);
}

function timelineRanges(
  timeline: readonly { readonly bar: number; readonly beat: number; readonly durationBeats: number }[],
): readonly (readonly [number, number])[] {
  return timeline.map((item) => {
    const start = (item.bar - 1) * 4 + item.beat - 1;
    return [start, start + item.durationBeats];
  });
}

function repeatedPreparedData(bars: number): MidiSongData {
  const ticksPerBeat = 480;
  const notes = Array.from({ length: bars * 4 }, (_, beat) => [36, 52, 55, 60].map((pitch, index) => ({
    pitch,
    startTick: beat * ticksPerBeat,
    durationTick: ticksPerBeat * 0.8,
    velocity: 0.8,
    trackIndex: index === 0 ? 0 : 1,
    channel: index === 0 ? 0 : 1,
    program: index === 0 ? 33 : 0,
    programExplicit: true,
  }))).flat();
  return {
    notes,
    tempo: 120,
    tempoChanges: [{ tick: 0, bpm: 120 }],
    timeSignature: "4/4",
    ticksPerBeat,
    totalBars: bars,
    tracks: [
      { index: 0, name: "Synthetic Bass", channel: 0, program: 33, roleHint: "bass" },
      { index: 1, name: "Synthetic Harmony", channel: 1, program: 0, roleHint: "harmony" },
    ],
    controlChanges: [],
  };
}
