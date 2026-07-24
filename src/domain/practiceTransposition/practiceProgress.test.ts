import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import {
  practiceProgressForCurrentFingerprint,
  progressionFingerprint,
  type ProgressionPracticeProgress,
} from "../practice";
import type { SavedProgressionBlock } from "../types";
import {
  createL4KeyPool,
  createL5KeyPool,
  isTranspositionCoverageComplete,
  normalizeClearedKeyPitchClasses,
  recordTranspositionPracticeRound,
  selectConfirmationPitchClasses,
  transpositionCoverageSummary,
  transpositionProgressLevel,
  type RecordTranspositionPracticeRoundInput,
} from ".";

const fingerprint = "practice-v1-transposition";
const nowIso = "2026-07-24T12:00:00.000Z";

function input(
  changes: Partial<RecordTranspositionPracticeRoundInput> = {},
): RecordTranspositionPracticeRoundInput {
  return {
    progressionFingerprint: fingerprint,
    level: 4,
    sourceKeyPitchClass: 0,
    targetKeyPitchClass: 7,
    mode: "flow",
    clean: true,
    bpm: 70,
    targetTempo: 70,
    targetSource: { type: "resolved-voicing" },
    confirmedLevel: 3,
    stale: false,
    nowIso,
    localDate: "2026-07-24",
    seed: 12345,
    inConfirmationChallenge: false,
    confirmationCompleted: false,
    ...changes,
  };
}

function progress(
  changes: Partial<ProgressionPracticeProgress> = {},
): ProgressionPracticeProgress {
  return {
    schemaVersion: 1,
    progressionFingerprint: fingerprint,
    confirmedLevel: 3,
    ...changes,
  };
}

describe("transposition practice progress", () => {
  it("normalizes coverage as sorted unique pitch classes", () => {
    expect(normalizeClearedKeyPitchClasses([12, -1, 7, 0, 7, 11]))
      .toEqual([0, 7, 11]);
  });

  it("records only eligible clean Flow rounds at target tempo", () => {
    const excluded = [
      input({ mode: "step" }),
      input({ clean: false }),
      input({ bpm: 69 }),
      input({ targetSource: { type: "generated-close" } }),
      input({ targetSource: { type: "style", styleId: "shell-17" } }),
      input({ confirmedLevel: 2 }),
      input({ stale: true }),
    ];
    excluded.forEach((candidate) => {
      expect(recordTranspositionPracticeRound(progress(), candidate))
        .toMatchObject({ changed: false, outcome: "none" });
    });

    const recorded = recordTranspositionPracticeRound(progress(), input());
    expect(recorded.changed).toBe(true);
    expect(recorded.outcome).toBe("coverage");
    expect(recorded.progress.transposition?.clearedKeyPitchClasses).toEqual([7]);
  });

  it("migrates a legacy fingerprint on the first T3 write without losing prior progress", () => {
    const source: SavedProgressionBlock = {
      id: "00000000-0000-4000-8000-000000000149",
      summaryText: "Legacy effective key",
      chords: [{
        bar: 1,
        beat: 1,
        durationBeats: 4,
        chord: makeChordSymbol(0, "maj7"),
        confidence: 1,
        alternatives: [],
        warnings: [],
      }],
      tags: [],
      capturedAt: "2026-07-20T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const legacy: ProgressionPracticeProgress = {
      schemaVersion: 1,
      progressionFingerprint: progressionFingerprint(source),
      confirmedLevel: 3,
      provisional: {
        level: 3,
        clearedAt: "2026-07-23T00:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
      },
    };
    const current = practiceProgressForCurrentFingerprint(
      source,
      "C major",
      legacy,
    );
    const effectiveFingerprint = progressionFingerprint(source, "C major");
    const result = recordTranspositionPracticeRound(current, input({
      progressionFingerprint: effectiveFingerprint,
    }));

    expect(result.changed).toBe(true);
    expect(result.progress.progressionFingerprint).toBe(effectiveFingerprint);
    expect(result.progress.confirmedLevel).toBe(3);
    expect(result.progress.provisional).toEqual(legacy.provisional);
    expect(result.progress.transposition?.clearedKeyPitchClasses).toEqual([7]);
  });

  it("creates an L4 provisional clear with two fixed opposite-side keys", () => {
    const pool = createL4KeyPool(0);
    let current = progress({
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: pool.slice(0, -1).sort((a, b) => a - b),
      },
    });
    const result = recordTranspositionPracticeRound(current, input({
      targetKeyPitchClass: pool[pool.length - 1],
    }));
    current = result.progress;

    expect(result.outcome).toBe("provisional");
    expect(current.provisional?.level).toBe(4);
    expect(current.provisional?.confirmationPitchClasses).toHaveLength(2);
    expect(new Set(current.provisional?.confirmationPitchClasses)).toHaveLength(2);
    expect(current.provisional?.confirmationPitchClasses)
      .toEqual(selectConfirmationPitchClasses(4, 0, 12345));
    expect(selectConfirmationPitchClasses(4, 0, 12345))
      .toEqual(selectConfirmationPitchClasses(4, 0, 12345));
  });

  it("inherits L4 coverage into L5 and still requires the source key", () => {
    const l4 = createL4KeyPool(0);
    expect(isTranspositionCoverageComplete(4, 0, l4)).toBe(true);
    expect(isTranspositionCoverageComplete(5, 0, l4)).toBe(false);

    const l5WithoutSource = createL5KeyPool(0).filter((pitchClass) => pitchClass !== 0);
    expect(isTranspositionCoverageComplete(5, 0, l5WithoutSource)).toBe(false);
    expect(isTranspositionCoverageComplete(5, 0, [...l5WithoutSource, 0])).toBe(true);
    expect(transpositionCoverageSummary(progress({
      confirmedLevel: 4,
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: l4.slice().sort((a, b) => a - b),
      },
    }))).toEqual({ level: 5, cleared: 6, total: 12 });
  });

  it("classifies partial L4 and L5 coverage from prerequisite progress", () => {
    expect(transpositionProgressLevel(progress({
      confirmedLevel: 3,
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: [7],
      },
    }))).toBe(4);
    expect(transpositionProgressLevel(progress({
      confirmedLevel: 4,
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: [7],
      },
    }))).toBe(5);
  });

  it("creates a deterministic stratified four-key L5 confirmation set", () => {
    const keys = selectConfirmationPitchClasses(5, 0, 6789);
    const fifths = createL5KeyPool(0);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    keys.forEach((key, index) => {
      expect(fifths.slice(index * 3, index * 3 + 3)).toContain(key);
    });
  });

  it("creates L5 provisional only after all 12 keys and keeps confirmation keys fixed", () => {
    const l5 = createL5KeyPool(0);
    const nearlyComplete = progress({
      confirmedLevel: 4,
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: l5.slice(0, -1).sort((a, b) => a - b),
      },
    });
    const provisional = recordTranspositionPracticeRound(nearlyComplete, input({
      level: 5,
      confirmedLevel: 4,
      targetKeyPitchClass: l5[l5.length - 1],
    }));
    expect(provisional.outcome).toBe("provisional");
    expect(provisional.progress.provisional?.level).toBe(5);
    expect(provisional.progress.provisional?.confirmationPitchClasses).toHaveLength(4);

    const fixedKeys = provisional.progress.provisional?.confirmationPitchClasses;
    const replay = recordTranspositionPracticeRound(provisional.progress, input({
      level: 5,
      confirmedLevel: 4,
      targetKeyPitchClass: l5[0],
      seed: 999,
    }));
    expect(replay.progress.provisional?.confirmationPitchClasses).toEqual(fixedKeys);
  });

  it("confirms only a completed different-day challenge and keeps the highest level", () => {
    const provisional = progress({
      confirmedLevel: 4,
      provisional: {
        level: 5,
        clearedAt: "2026-07-23T12:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
        confirmationPitchClasses: [0, 2, 5, 7],
      },
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: createL5KeyPool(0).sort((a, b) => a - b),
      },
    });
    const sameDay = recordTranspositionPracticeRound(provisional, input({
      level: 5,
      confirmedLevel: 4,
      localDate: "2026-07-23",
      inConfirmationChallenge: true,
      confirmationCompleted: true,
    }));
    expect(sameDay.changed).toBe(false);

    const partial = recordTranspositionPracticeRound(provisional, input({
      level: 5,
      confirmedLevel: 4,
      inConfirmationChallenge: true,
      confirmationCompleted: false,
    }));
    expect(partial.changed).toBe(false);

    const confirmed = recordTranspositionPracticeRound(provisional, input({
      level: 5,
      confirmedLevel: 4,
      inConfirmationChallenge: true,
      confirmationCompleted: true,
    }));
    expect(confirmed.outcome).toBe("confirmed");
    expect(confirmed.progress.confirmedLevel).toBe(5);
    expect(confirmed.progress.provisional).toBeUndefined();
    expect(confirmed.progress.transposition?.clearedKeyPitchClasses).toHaveLength(12);
  });

  it("never lowers confirmedLevel when replaying L4", () => {
    const confirmed = progress({ confirmedLevel: 5 });
    const result = recordTranspositionPracticeRound(confirmed, input());
    expect(result.progress.confirmedLevel).toBe(5);
  });
});
