import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { SavedProgressionBlock, SongIdea } from "../types";
import {
  buildPracticeChordRequirements,
  createPracticeSessionState,
  matchPerformance,
  practiceProgressForCurrentFingerprint,
  practiceProgressState,
  progressionFingerprint,
  recommendPracticeBlocks,
  recordPracticeRound,
  reducePracticeSession,
  resetPracticeProgress,
  type PracticeInputSnapshot,
} from ".";

const capturedAt = "2026-07-20T00:00:00.000Z";

describe("practice chord requirements", () => {
  it.each([
    ["Cmaj7", makeChordSymbol(0, "maj7"), [0, 4, 11], [7]],
    ["Fmaj9", makeChordSymbol(5, "maj9"), [4, 5, 7, 9], [0]],
    ["G13", makeChordSymbol(7, "dom13"), [4, 5, 7, 11], [2, 9]],
    ["Bm11", makeChordSymbol(11, "min11"), [4, 9, 11, 2], [1, 6]],
    ["C6/9", makeChordSymbol(0, "sixNine"), [0, 2, 4, 9], [7]],
  ])("builds normal requirements for %s", (_label, chord, required, optional) => {
    const result = buildPracticeChordRequirements(chord, "normal");
    expect(result.requiredPitchClasses).toEqual([...required].sort((a, b) => a - b));
    expect(result.optionalPitchClasses).toEqual([...optional].sort((a, b) => a - b));
  });

  it("keeps the perfect fifth optional in normal and required in strict", () => {
    const chord = makeChordSymbol(0, "maj7");
    expect(buildPracticeChordRequirements(chord, "normal").requiredPitchClasses).not.toContain(7);
    expect(buildPracticeChordRequirements(chord, "strict").requiredPitchClasses).toContain(7);
  });

  it("requires altered fifths and strict slash bass", () => {
    expect(buildPracticeChordRequirements(makeChordSymbol(7, "aug"), "easy").requiredPitchClasses)
      .toContain(3);
    const slash = makeChordSymbol(0, "maj", [], 4);
    expect(buildPracticeChordRequirements(slash, "normal").requiredBassPitchClass).toBeUndefined();
    expect(buildPracticeChordRequirements(slash, "strict").requiredBassPitchClass).toBe(4);
  });
});

describe("performance matching", () => {
  const requirements = buildPracticeChordRequirements(makeChordSymbol(0, "maj7"), "normal");

  it("accepts inversions and octave duplicates", () => {
    expect(matchPerformance(requirements, input([52, 59, 60, 72], 1, 0)).state).toBe("match");
  });

  it("treats missing tones as partial and foreign held tones as wrong", () => {
    expect(matchPerformance(requirements, input([60, 64], 1, 0)).state).toBe("partial");
    const wrong = matchPerformance(requirements, input([60, 61, 64, 71], 1, 0));
    expect(wrong.state).toBe("wrong");
    expect(wrong.foreignPitchClasses).toEqual([1]);
  });

  it("does not include pedal-sustained notes in judgement", () => {
    const snapshot = input([60, 64, 71], 1, 0, [61]);
    expect(matchPerformance(requirements, snapshot).state).toBe("match");
  });

  it("requires a new attack revision for repeated targets", () => {
    expect(matchPerformance(requirements, input([60, 64, 71], 2, 0), 3).state).toBe("partial");
    expect(matchPerformance(requirements, input([60, 64, 71], 3, 0), 3).state).toBe("match");
  });
});

describe("practice session machine", () => {
  const block = progression([
    makeChordSymbol(0, "maj7"),
    makeChordSymbol(0, "maj7"),
  ]);
  const context = {
    events: block.chords,
    requirements: block.chords.map((event) => buildPracticeChordRequirements(event.chord, "normal")),
  };

  it("ignores late round callbacks while paused or completed", () => {
    const ready = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level: 1,
      mode: "flow",
      leniency: "normal",
      bpm: 60,
      targetTempo: 60,
      eventCount: block.chords.length,
    });
    const running = reducePracticeSession(
      ready,
      { type: "START_SESSION" },
      context,
    );
    const paused = reducePracticeSession(running, { type: "PAUSE" }, context);
    const completed = reducePracticeSession(
      running,
      { type: "END_SESSION" },
      context,
    );

    expect(reducePracticeSession(
      paused,
      { type: "ROUND_COMPLETED" },
      context,
    )).toBe(paused);
    expect(reducePracticeSession(
      completed,
      { type: "ROUND_COMPLETED" },
      context,
    )).toBe(completed);
  });

  it("resets a paused Flow round before starting a replacement clock", () => {
    const ready = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level: 4,
      mode: "flow",
      leniency: "normal",
      bpm: 60,
      targetTempo: 60,
      eventCount: block.chords.length,
    });
    const paused = {
      ...ready,
      status: "paused" as const,
      currentEventIndex: 1,
      roundDirty: true,
      eventResults: ["match", "miss"] as Array<"match" | "miss">,
      requiredAttackRevision: 3,
      lastRoundWasClean: false,
    };
    const reset = reducePracticeSession(
      paused,
      { type: "RESET_FLOW_FOR_RESTART", requiredAttackRevision: 7 },
      context,
    );

    expect(reset).toMatchObject({
      status: "paused",
      currentEventIndex: 0,
      roundDirty: false,
      requiredAttackRevision: 7,
      lastRoundWasClean: undefined,
    });
    expect(reset.eventResults).toEqual(["pending", "pending"]);
  });

  it("settles only after 100ms and requires a new attack for repeated chords", () => {
    let state = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level: 1,
      mode: "step",
      leniency: "normal",
      bpm: 60,
      targetTempo: 60,
      eventCount: block.chords.length,
    });
    state = reducePracticeSession(state, { type: "START_SESSION" }, context);
    state = reducePracticeSession(state, {
      type: "MIDI_STATE_CHANGED",
      input: input([60, 64, 71], 10, 1_000),
    }, context);
    expect(reducePracticeSession(state, { type: "STABLE_DEADLINE", nowMs: 1_099 }, context).currentEventIndex)
      .toBe(0);
    state = reducePracticeSession(state, { type: "STABLE_DEADLINE", nowMs: 1_100 }, context);
    expect(state.currentEventIndex).toBe(1);
    expect(state.requiredAttackRevision).toBe(11);

    state = reducePracticeSession(state, {
      type: "MIDI_STATE_CHANGED",
      input: input([60, 64, 71], 10, 1_200),
    }, context);
    expect(state.lastMatch?.state).toBe("partial");
    state = reducePracticeSession(state, {
      type: "MIDI_STATE_CHANGED",
      input: input([60, 64, 71], 11, 1_210),
    }, context);
    state = reducePracticeSession(state, { type: "STABLE_DEADLINE", nowMs: 1_310 }, context);
    expect(state.roundNumber).toBe(2);
  });

  it("does not dirty a round for partial but does for stable wrong", () => {
    let state = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level: 1,
      mode: "step",
      leniency: "normal",
      bpm: 60,
      targetTempo: 60,
      eventCount: block.chords.length,
    });
    state = reducePracticeSession(state, { type: "START_SESSION" }, context);
    state = reducePracticeSession(state, {
      type: "MIDI_STATE_CHANGED",
      input: input([60, 64], 1, 0),
    }, context);
    expect(state.roundDirty).toBe(false);
    state = reducePracticeSession(state, {
      type: "MIDI_STATE_CHANGED",
      input: input([60, 61, 64, 71], 2, 100),
    }, context);
    state = reducePracticeSession(state, { type: "STABLE_DEADLINE", nowMs: 200 }, context);
    expect(state.roundDirty).toBe(true);
  });

  it("delegates judgement to an injected matcher without changing session timing", () => {
    const calls: Array<{ eventIndex: number; requiredAttackRevision: number }> = [];
    const customContext = {
      ...context,
      matchInput: (
        _requirements: (typeof context.requirements)[number],
        snapshot: PracticeInputSnapshot,
        requiredAttackRevision: number,
        eventIndex: number,
      ) => {
        calls.push({ eventIndex, requiredAttackRevision });
        return {
          state: "match" as const,
          heldPitchClasses: snapshot.heldMidiNotes.map((note) => note % 12),
          missingPitchClasses: [],
          foreignPitchClasses: [],
          bassMatches: true,
          attackSatisfied: true,
        };
      },
    };
    let state = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level: 1,
      mode: "step",
      leniency: "normal",
      bpm: 60,
      targetTempo: 60,
      eventCount: block.chords.length,
    });

    state = reducePracticeSession(state, { type: "START_SESSION" }, customContext);
    state = reducePracticeSession(state, {
      type: "MIDI_STATE_CHANGED",
      input: input([61], 3, 1_000),
    }, customContext);

    expect(state.lastMatch?.state).toBe("match");
    expect(state.provisionalCandidate?.sinceMs).toBe(1_000);
    expect(calls).toEqual([{ eventIndex: 0, requiredAttackRevision: 0 }]);
  });
});

describe("practice progress", () => {
  it("ignores presentation metadata in fingerprints and detects musical edits", () => {
    const block = progression([makeChordSymbol(0, "maj7")]);
    const decorated = { ...block, summaryText: "renamed", memo: "memo", tags: ["favorite"] };
    expect(progressionFingerprint(decorated)).toBe(progressionFingerprint(block));
    expect(progressionFingerprint({ ...block, bpm: 90 })).not.toBe(progressionFingerprint(block));
  });

  it("includes the supplied Idea fallback key in the practice fingerprint", () => {
    const block = {
      ...progression([makeChordSymbol(0, "maj7")]),
      detectedKey: undefined,
    };
    const cMajor = progressionFingerprint(block, "C major");
    expect(cMajor).not.toBe(progressionFingerprint(block, "D major"));
    expect(practiceProgressState({
      ...block,
      practice: {
        schemaVersion: 1,
        progressionFingerprint: cMajor,
        confirmedLevel: 3,
      },
    }, "2026-07-24", "D major")).toBe("stale");
  });

  it("accepts a legacy no-detected-key fingerprint and migrates it without losing progress", () => {
    const block = {
      ...progression([makeChordSymbol(0, "maj7")]),
      detectedKey: undefined,
    };
    const legacyPractice = {
      schemaVersion: 1 as const,
      progressionFingerprint: progressionFingerprint(block),
      confirmedLevel: 2 as const,
      provisional: {
        level: 3 as const,
        clearedAt: "2026-07-23T00:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
      },
      lastPracticedAt: "2026-07-23T00:00:00.000Z",
    };
    const legacyBlock = { ...block, practice: legacyPractice };

    expect(practiceProgressState(
      legacyBlock,
      "2026-07-24",
      "C major",
    )).toBe("confirmation-due");
    const migrated = practiceProgressForCurrentFingerprint(
      legacyBlock,
      "C major",
    );
    expect(migrated).toMatchObject({
      progressionFingerprint: progressionFingerprint(block, "C major"),
      confirmedLevel: 2,
      provisional: legacyPractice.provisional,
      lastPracticedAt: legacyPractice.lastPracticedAt,
    });
    expect(practiceProgressState(
      { ...block, practice: migrated },
      "2026-07-24",
      "D major",
    )).toBe("stale");
  });

  it("writes the effective-key fingerprint on the first post-legacy practice update", () => {
    const block = {
      ...progression([makeChordSymbol(0, "maj7")]),
      detectedKey: undefined,
    };
    block.practice = {
      schemaVersion: 1,
      progressionFingerprint: progressionFingerprint(block),
      confirmedLevel: 2,
      provisional: {
        level: 3,
        clearedAt: "2026-07-23T00:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
      },
    };
    const updated = recordPracticeRound(block, {
      level: 1,
      bpm: 60,
      targetTempo: 70,
      consecutiveCleanFlowRounds: 0,
      nowIso: "2026-07-24T00:00:00.000Z",
      localDate: "2026-07-24",
    }, "C major");

    expect(updated.progressionFingerprint)
      .toBe(progressionFingerprint(block, "C major"));
    expect(updated.confirmedLevel).toBe(2);
    expect(updated.provisional).toEqual(block.practice.provisional);
  });

  it("creates provisional after two clean rounds and confirms only on another date", () => {
    const block = progression([makeChordSymbol(0, "maj7")]);
    const provisional = recordPracticeRound(block, {
      level: 2,
      bpm: 70,
      targetTempo: 70,
      consecutiveCleanFlowRounds: 2,
      nowIso: "2026-07-20T10:00:00.000Z",
      localDate: "2026-07-20",
    });
    expect(provisional.provisional?.level).toBe(2);
    expect(practiceProgressState({ ...block, practice: provisional }, "2026-07-20")).toBe("provisional");

    const sameDay = recordPracticeRound({ ...block, practice: provisional }, {
      level: 2,
      bpm: 70,
      targetTempo: 70,
      consecutiveCleanFlowRounds: 3,
      nowIso: "2026-07-20T11:00:00.000Z",
      localDate: "2026-07-20",
    });
    expect(sameDay.confirmedLevel).toBeUndefined();

    const confirmed = recordPracticeRound({ ...block, practice: provisional }, {
      level: 2,
      bpm: 70,
      targetTempo: 70,
      consecutiveCleanFlowRounds: 1,
      nowIso: "2026-07-21T10:00:00.000Z",
      localDate: "2026-07-21",
    });
    expect(confirmed.confirmedLevel).toBe(2);
    expect(confirmed.provisional).toBeUndefined();
  });

  it("marks edited progress stale without deleting it", () => {
    const block = progression([makeChordSymbol(0, "maj7")]);
    const practice = resetPracticeProgress(block);
    const edited = { ...block, chords: [{ ...block.chords[0], chord: makeChordSymbol(5, "maj7") }], practice };
    expect(practiceProgressState(edited, "2026-07-20")).toBe("stale");
    expect(edited.practice).toEqual(practice);
  });

  it("clears transposition coverage on an explicit stale reset", () => {
    const block = progression([makeChordSymbol(0, "maj7")]);
    block.practice = {
      schemaVersion: 1,
      progressionFingerprint: "old",
      confirmedLevel: 4,
      transposition: {
        schemaVersion: 1,
        clearedKeyPitchClasses: [2, 5, 7],
      },
    };
    expect(resetPracticeProgress(block)).toEqual({
      schemaVersion: 1,
      progressionFingerprint: progressionFingerprint(block),
    });
  });

  it("shows a higher provisional level ahead of a lower confirmed level", () => {
    const block = progression([makeChordSymbol(0, "maj7")]);
    block.practice = {
      ...resetPracticeProgress(block),
      confirmedLevel: 1,
      provisional: {
        level: 2,
        clearedAt: "2026-07-20T10:00:00.000Z",
        clearedOnLocalDate: "2026-07-20",
        targetTempo: 70,
      },
    };
    expect(practiceProgressState(block, "2026-07-20")).toBe("provisional");
    expect(practiceProgressState(block, "2026-07-21")).toBe("confirmation-due");
  });
});

describe("practice recommendation", () => {
  it("orders confirmation, stale, practiced, favorite unstarted, then unstarted", () => {
    const confirmation = progression([makeChordSymbol(0, "maj7")], "00000000-0000-4000-8000-000000000001");
    confirmation.practice = {
      ...resetPracticeProgress(confirmation),
      provisional: {
        level: 1,
        clearedAt: "2026-07-19T00:00:00.000Z",
        clearedOnLocalDate: "2026-07-19",
        targetTempo: 60,
      },
    };
    const stale = progression([makeChordSymbol(2, "min7")], "00000000-0000-4000-8000-000000000002");
    stale.practice = { ...resetPracticeProgress(stale), progressionFingerprint: "old" };
    const favorite = {
      ...progression([makeChordSymbol(5, "maj7")], "00000000-0000-4000-8000-000000000003"),
      pinned: true,
    };
    const plain = progression([makeChordSymbol(7, "dom7")], "00000000-0000-4000-8000-000000000004");
    const idea = ideaWith([plain, favorite, stale, confirmation]);
    expect(recommendPracticeBlocks([idea], "2026-07-20").map((item) => item.block.id))
      .toEqual([confirmation.id, stale.id, favorite.id, plain.id]);
  });
});

function input(
  heldMidiNotes: number[],
  attackRevision: number,
  timestampMs: number,
  sustainedMidiNotes: number[] = [],
): PracticeInputSnapshot {
  return { heldMidiNotes, sustainedMidiNotes, attackRevision, timestampMs };
}

function progression(
  chords: ReturnType<typeof makeChordSymbol>[],
  id = "00000000-0000-4000-8000-000000000010",
): SavedProgressionBlock {
  return {
    id,
    summaryText: chords.map((chord) => chord.label).join(" - "),
    chords: chords.map((chord, index) => ({
      eventId: `event-${index}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    bpm: 100,
    timeSignature: "4/4",
    tags: [],
    capturedAt,
    analyzerVersion: "test",
  };
}

function ideaWith(blocks: SavedProgressionBlock[]): SongIdea {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    title: "Practice",
    moods: [],
    status: "idea",
    nextAction: { text: "", updatedAt: capturedAt },
    chordMemo: "",
    references: [],
    assets: [],
    progressionBlocks: blocks,
    statusHistory: [{ status: "idea", at: capturedAt }],
    createdAt: capturedAt,
    updatedAt: capturedAt,
  };
}
