import { describe, expect, it } from "vitest";
import { analyzeMidiTempo, hasRobustTempoVariation } from "./tempoAnalysis";

const ppq = 480;

describe("MIDI representative tempo", () => {
  it("uses the SMF 120 BPM default only when no Set Tempo event exists", () => {
    expect(analyzeMidiTempo({ tempoChanges: [], ticksPerBeat: ppq, durationTick: ppq * 8 }))
      .toEqual({ representativeBpm: 120, diagnostics: {
        provenance: "SMF_DEFAULT", effectiveTempoEventCount: 0, effectiveTempoSegmentCount: 0,
      } });
    expect(analyzeMidiTempo({ tempoChanges: [{ tick: 0, bpm: Number.NaN }], ticksPerBeat: ppq, durationTick: ppq * 8 }))
      .toMatchObject({ diagnostics: { provenance: "SMF_META", effectiveTempoEventCount: 0 } });
  });

  it.each([120, 96])("keeps an explicit Set Tempo at %i BPM distinct from the default", (bpm) => {
    const result = analyzeMidiTempo({ tempoChanges: [{ tick: 0, bpm }], ticksPerBeat: ppq, durationTick: ppq * 8 });
    expect(result.representativeBpm).toBe(bpm);
    expect(result.diagnostics.provenance).toBe("SMF_META");
  });

  it("uses one effective tempo directly", () => {
    const result = analyzeMidiTempo({
      tempoChanges: [{ tick: 0, bpm: 96 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 8,
    });
    expect(result.representativeBpm).toBe(96);
    expect(result.diagnostics).toMatchObject({
      effectiveTempoEventCount: 1,
      effectiveTempoSegmentCount: 1,
      rawMinBpm: 96,
      rawMaxBpm: 96,
      weightedP05Bpm: 96,
      weightedMedianBpm: 96,
      weightedP95Bpm: 96,
    });
  });

  it("uses one effective tempo directly even when its event starts after tick zero", () => {
    const result = analyzeMidiTempo({
      tempoChanges: [{ tick: ppq * 4, bpm: 96 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 8,
    });
    expect(result.representativeBpm).toBe(96);
    expect(result.diagnostics.weightedMedianBpm).toBe(96);
    expect(result.diagnostics.effectiveTempoEventCount).toBe(1);
  });

  it("uses the real-time weighted median for multiple tempos", () => {
    const result = analyzeMidiTempo({
      tempoChanges: [{ tick: 0, bpm: 80 }, { tick: ppq, bpm: 120 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 5,
    });
    expect(result.representativeBpm).toBe(120);
  });

  it("ignores a momentary 161.29 BPM capture outlier when almost all real time is 108 BPM", () => {
    const result = analyzeMidiTempo({
      tempoChanges: [{ tick: 0, bpm: 161.29 }, { tick: 48, bpm: 108 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 100,
    });
    expect(result.representativeBpm).toBe(108);
    expect(result.diagnostics.weightedP05Bpm).toBe(108);
    expect(result.diagnostics.weightedP95Bpm).toBe(108);
    expect(result.diagnostics.rawMaxBpm).toBe(161.29);
    expect(hasRobustTempoVariation(result.diagnostics)).toBe(false);
  });

  it("collapses repeated equal tempos into one effective segment", () => {
    const result = analyzeMidiTempo({
      tempoChanges: [{ tick: 0, bpm: 110 }, { tick: ppq, bpm: 110 }, { tick: ppq * 2, bpm: 110 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 4,
    });
    expect(result.representativeBpm).toBe(110);
    expect(result.diagnostics.effectiveTempoEventCount).toBe(1);
    expect(result.diagnostics.effectiveTempoSegmentCount).toBe(1);
  });

  it("weights the final tempo from its event through the song end", () => {
    const result = analyzeMidiTempo({
      tempoChanges: [{ tick: 0, bpm: 60 }, { tick: ppq, bpm: 120 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 9,
    });
    expect(result.representativeBpm).toBe(120);
    expect(result.diagnostics.effectiveTempoSegmentCount).toBe(2);
  });

  it("uses the last event at the same tick deterministically", () => {
    const input = {
      tempoChanges: [{ tick: 0, bpm: 161.29 }, { tick: 0, bpm: 108 }],
      ticksPerBeat: ppq,
      durationTick: ppq * 4,
    };
    const result = analyzeMidiTempo(input);
    expect(result.representativeBpm).toBe(108);
    expect(result.diagnostics).toMatchObject({
      effectiveTempoEventCount: 1,
      rawMinBpm: 108,
      rawMaxBpm: 161.29,
    });
    expect(analyzeMidiTempo(input)).toEqual(result);
  });

  it("shows robust variation at the inclusive P95/P05 1.2 boundary", () => {
    const boundary = analyzeMidiTempo({
      tempoChanges: [{ tick: 0, bpm: 100 }, { tick: 100, bpm: 120 }],
      ticksPerBeat: ppq,
      durationTick: 220,
    });
    expect(boundary.diagnostics.weightedP05Bpm).toBe(100);
    expect(boundary.diagnostics.weightedP95Bpm).toBe(120);
    expect(hasRobustTempoVariation(boundary.diagnostics)).toBe(true);
    expect(hasRobustTempoVariation({
      ...boundary.diagnostics,
      weightedP95Bpm: 119.99,
    })).toBe(false);
  });

});
