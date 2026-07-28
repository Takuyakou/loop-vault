import { describe, expect, it } from "vitest";
import type { TimedNote } from "../../src/domain/midi/types";
import {
  buildNoteInstanceId,
  classifyRootCauses,
  type RootCauseSignals,
} from "./validationPipelineTrace";

const baseSignals: RootCauseSignals = {
  filterTriggered: true,
  samePitchDuplicate: false,
  unfilteredRebuild: false,
  candidateStructurallyUnchanged: false,
  finalPitchSetUnchanged: false,
  statusChanged: false,
  missingHarmonyDominant: false,
  evaluatorProvenanceMismatch: false,
};

describe("Phase 4.4.1 validation pipeline trace", () => {
  it("assigns a deterministic ID that distinguishes duplicate pitch instances", () => {
    const note: TimedNote = {
      pitch: 72,
      startTick: 960,
      durationTick: 480,
      velocity: 0.8,
      trackIndex: 2,
      channel: 3,
    };

    expect(buildNoteInstanceId(note, 10)).toBe("n10:t2:c3:s960:d480:p72");
    expect(buildNoteInstanceId(note, 11)).not.toBe(buildNoteInstanceId(note, 10));
  });

  it("classifies duplicate-pitch provenance and status-only changes separately", () => {
    expect(classifyRootCauses({
      ...baseSignals,
      samePitchDuplicate: true,
      candidateStructurallyUnchanged: true,
      finalPitchSetUnchanged: true,
      statusChanged: true,
      evaluatorProvenanceMismatch: true,
    })).toEqual([
      "same-pitch-duplicate",
      "candidate-unchanged",
      "status-only-change",
      "evaluator-provenance-mismatch",
    ]);
  });

  it("detects filter and downstream reconstruction failures without inventing a fix", () => {
    expect(classifyRootCauses({
      ...baseSignals,
      filterTriggered: false,
      unfilteredRebuild: true,
      missingHarmonyDominant: true,
    })).toEqual([
      "filter-not-triggered",
      "unfiltered-rebuild",
      "missing-harmony-dominant",
    ]);
  });
});
