import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { PracticeSessionContext } from "../practice";
import type { SavedProgressionBlock, VoicingSnapshot } from "../types";
import {
  buildProgressionOrder,
  createMixSessionState,
  currentMixSnapshot,
  findMixSnapshotDrift,
  mixSessionSummary,
  preflightMixSession,
  progressionReferenceKey,
  reduceMixSession,
  retryDirtyMixSession,
  sameProgressionReference,
  type MixProgressionCandidate,
  type MixProgressionReference,
  type MixSessionConfig,
  type MixSessionState,
} from ".";

const references: MixProgressionReference[] = Array.from(
  { length: 6 },
  (_, index) => ({
    ideaId: `idea-${index + 1}`,
    blockId: `block-${index + 1}`,
  }),
);

function makeBlock(
  id: string,
  options: Partial<SavedProgressionBlock> = {},
): SavedProgressionBlock {
  return {
    id,
    summaryText: `Progression ${id}`,
    chords: [
      makeChordSymbol(0, "maj7"),
      makeChordSymbol(5, "maj7"),
    ].map((chord, index) => ({
      eventId: `${id}-event-${index}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    detectedKey: "C major",
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-24T00:00:00.000Z",
    analyzerVersion: "test",
    ...options,
  };
}

function makeVoicing(midiNotes: number[]): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source: "manual",
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0],
    capturedForChordKey: "0:maj7:-:-",
    confidence: 1,
    userVerified: true,
  };
}

function makeCandidates(count = 2): MixProgressionCandidate[] {
  return references.slice(0, count).map((reference, index) => ({
    reference,
    title: `Progression ${index + 1}`,
    block: makeBlock(reference.blockId),
    effectiveKeySignature: "C major",
  }));
}

function makeConfig(
  count = 2,
  overrides: Partial<MixSessionConfig> = {},
): MixSessionConfig {
  return {
    references: references.slice(0, count),
    level: 2,
    mode: "step",
    leniency: "normal",
    targetSource: { type: "resolved-voicing" },
    allowUnsupportedFallback: false,
    cycles: 1,
    bpm: 60,
    ...overrides,
  };
}

function successfulPreflight(
  count = 2,
  overrides: Partial<MixSessionConfig> = {},
) {
  const result = preflightMixSession({
    config: makeConfig(count, overrides),
    candidates: makeCandidates(count),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
}

function contextFor(state: MixSessionState): PracticeSessionContext {
  const snapshot = currentMixSnapshot(state);
  if (!snapshot) throw new Error("missing snapshot");
  return {
    events: snapshot.events,
    requirements: snapshot.targetPlan.requirements,
    matchInput: (_requirements, input) => ({
      state: input.heldMidiNotes[0] === 99 ? "wrong" : "match",
      heldPitchClasses: [0, 4, 7],
      missingPitchClasses: [],
      foreignPitchClasses: input.heldMidiNotes[0] === 99 ? [1] : [],
      bassMatches: true,
      attackSatisfied: true,
    }),
  };
}

function start(state: MixSessionState): MixSessionState {
  return reduceMixSession(state, { type: "START_CURRENT" }, contextFor(state));
}

function settleEvent(
  state: MixSessionState,
  attackRevision: number,
  heldMidiNotes: number[] = [60, 64, 67],
): MixSessionState {
  const context = contextFor(state);
  const input = {
    heldMidiNotes,
    sustainedMidiNotes: [],
    attackRevision,
    timestampMs: attackRevision * 1_000,
  };
  const pending = reduceMixSession(state, {
    type: "PRACTICE_ACTION",
    action: { type: "MIDI_STATE_CHANGED", input },
  }, context);
  return reduceMixSession(pending, {
    type: "PRACTICE_ACTION",
    action: { type: "STABLE_DEADLINE", nowMs: input.timestampMs + 100 },
  }, context);
}

describe("Mix preflight", () => {
  it("accepts two through five progressions and rejects one or six", () => {
    expect(successfulPreflight(2).snapshots).toHaveLength(2);
    expect(successfulPreflight(5).snapshots).toHaveLength(5);
    const one = preflightMixSession({
      config: makeConfig(1),
      candidates: makeCandidates(1),
    });
    const six = preflightMixSession({
      config: makeConfig(6),
      candidates: makeCandidates(6),
    });
    expect(one.ok).toBe(false);
    expect(six.ok).toBe(false);
  });

  it("reports duplicates and missing blocks without silently excluding them", () => {
    const duplicate = preflightMixSession({
      config: makeConfig(2, {
        references: [references[0], references[0]],
      }),
      candidates: makeCandidates(1),
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.errors.map((error) => error.code)).toContain("duplicate-selection");

    const missing = preflightMixSession({
      config: makeConfig(2),
      candidates: [makeCandidates(1)[0]],
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "missing-block",
        reference: references[1],
      }),
    ]));
  });

  it("requires a supported key for every L3 progression", () => {
    const candidates = makeCandidates(2);
    candidates[1] = {
      ...candidates[1],
      effectiveKeySignature: undefined,
      block: makeBlock(references[1].blockId, { detectedKey: undefined }),
    };
    const result = preflightMixSession({
      config: makeConfig(2, { level: 3 }),
      candidates,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "missing-key",
        reference: references[1],
      }),
    ]));
  });

  it("requires 4/4 and valid timing for Flow", () => {
    const candidates = makeCandidates(2);
    candidates[0] = {
      ...candidates[0],
      block: makeBlock(references[0].blockId, { timeSignature: "3/4" }),
    };
    const result = preflightMixSession({
      config: makeConfig(2, { mode: "flow" }),
      candidates,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain("flow-time-signature");
  });

  it("rejects an undefined Flow time signature and names the affected progression", () => {
    const candidates = makeCandidates(2);
    candidates[1] = {
      ...candidates[1],
      block: makeBlock(references[1].blockId, { timeSignature: undefined }),
    };
    const result = preflightMixSession({
      config: makeConfig(2, { mode: "flow" }),
      candidates,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "flow-time-signature",
        reference: references[1],
        title: "Progression 2",
        detail: "missing",
      }),
    ]));
  });

  it("caches deeply frozen snapshots and target plans", () => {
    const candidates = makeCandidates(2);
    const source = structuredClone(candidates);
    const result = preflightMixSession({
      config: makeConfig(2),
      candidates,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.snapshots[0])).toBe(true);
    expect(Object.isFrozen(result.snapshots[0].events)).toBe(true);
    expect(Object.isFrozen(result.snapshots[0].targetPlan.events)).toBe(true);
    candidates[0].block!.summaryText = "changed after start";
    expect(result.snapshots[0].title).toBe("Progression 1");
    expect(result.snapshots[0].events[0].chord.label)
      .toBe(source[0].block!.chords[0].chord.label);
  });

  it("takes ownership of mutable snapshot input at the session boundary", () => {
    const preflight = successfulPreflight(2);
    const mutable = structuredClone(preflight.snapshots);
    const state = createMixSessionState(makeConfig(2), mutable, 77);
    (mutable[0] as { title: string }).title = "mutated outside";
    (mutable[0].events[0].chord as { label: string }).label = "outside";

    expect(state.snapshots[0].title).toBe("Progression 1");
    expect(state.snapshots[0].events[0].chord.label).not.toBe("outside");
    expect(Object.isFrozen(state.snapshots)).toBe(true);
    expect(Object.isFrozen(state.snapshots[0].targetPlan.events)).toBe(true);
  });

  it("detects changed and deleted Vault records against frozen snapshots", () => {
    const candidates = makeCandidates(2);
    const result = preflightMixSession({
      config: makeConfig(2),
      candidates,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      chord: makeChordSymbol(2, "maj7"),
    };
    const drift = findMixSnapshotDrift(
      result.snapshots,
      [candidates[0]],
      makeConfig(2),
    );
    expect(drift).toEqual([
      expect.objectContaining({
        reference: references[0],
        reason: "fingerprint-changed",
      }),
      expect.objectContaining({
        reference: references[1],
        reason: "missing",
      }),
    ]);
  });

  it("ignores unused voicing metadata when effective target notes stay the same", () => {
    const candidates = makeCandidates(2);
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: makeVoicing([52, 55, 60, 64, 67]),
      },
    };
    const resolvedConfig = makeConfig(2);
    const result = preflightMixSession({
      config: resolvedConfig,
      candidates,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: {
          ...makeVoicing([48, 60, 64, 67, 71]),
          schemaVersion: 2 as unknown as 1,
        },
        practiceVoicingOverride: {
          ...makeVoicing([52, 55, 60, 64, 67]),
          bassNote: 55,
          confidence: 0,
          userVerified: false,
          capturedForChordLabel: "metadata only",
        },
      },
    };
    expect(findMixSnapshotDrift(
      result.snapshots,
      candidates,
      resolvedConfig,
    )).toEqual([]);
  });

  it("ignores source voicing changes while a compatible override is selected", () => {
    const candidates = makeCandidates(2);
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: makeVoicing([52, 55, 60, 64, 67]),
      },
    };
    const resolvedConfig = makeConfig(2);
    const result = preflightMixSession({
      config: resolvedConfig,
      candidates,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([36, 48, 52, 55, 59]),
        practiceVoicingOverride: makeVoicing([52, 55, 60, 64, 67]),
      },
    };
    expect(findMixSnapshotDrift(
      result.snapshots,
      candidates,
      resolvedConfig,
    )).toEqual([]);
  });

  it("detects changes to the effective resolved voicing notes", () => {
    const candidates = makeCandidates(2);
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: makeVoicing([52, 55, 60, 64, 67]),
      },
    };
    const resolvedConfig = makeConfig(2);
    const result = preflightMixSession({
      config: resolvedConfig,
      candidates,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: makeVoicing([52, 59, 60, 64, 67]),
      },
    };
    expect(findMixSnapshotDrift(
      result.snapshots,
      candidates,
      resolvedConfig,
    )).toEqual([
      expect.objectContaining({
        reference: references[0],
        reason: "fingerprint-changed",
      }),
    ]);
  });

  it("detects an override becoming stale and switching to the source voicing", () => {
    const candidates = makeCandidates(2);
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: makeVoicing([52, 55, 60, 64, 67]),
      },
    };
    const resolvedConfig = makeConfig(2);
    const result = preflightMixSession({
      config: resolvedConfig,
      candidates,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: {
          ...makeVoicing([52, 55, 60, 64, 67]),
          capturedForChordKey: "5:maj7:-:-",
        },
      },
    };
    expect(findMixSnapshotDrift(
      result.snapshots,
      candidates,
      resolvedConfig,
    )).toEqual([
      expect.objectContaining({
        reference: references[0],
        reason: "fingerprint-changed",
      }),
    ]);
  });

  it("produces deterministic effective-target content fingerprints", () => {
    const candidates = makeCandidates(2);
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
        practiceVoicingOverride: makeVoicing([52, 55, 60, 64, 67]),
      },
    };
    const config = makeConfig(2);
    const first = preflightMixSession({
      config,
      candidates,
    });
    const second = preflightMixSession({
      config: structuredClone(config),
      candidates: structuredClone(candidates),
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.snapshots.map((snapshot) => snapshot.contentFingerprint))
      .toEqual(first.snapshots.map((snapshot) => snapshot.contentFingerprint));
    expect(findMixSnapshotDrift(
      first.snapshots,
      structuredClone(candidates),
      config,
    )).toEqual([]);
  });

  it("ignores voicing memory for generated targets and ignores practice-only changes", () => {
    const candidates = makeCandidates(2);
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 60, 64, 67, 71]),
      },
    };
    const styleConfig = makeConfig(2, {
      targetSource: { type: "generated-close" },
      styleMatchMode: "exact-pitch",
    });
    const styleResult = preflightMixSession({
      config: styleConfig,
      candidates,
    });
    expect(styleResult.ok).toBe(true);
    if (!styleResult.ok) return;
    candidates[0].block!.chords[0] = {
      ...candidates[0].block!.chords[0],
      voicingMemory: {
        sourceVoicing: makeVoicing([48, 55, 60, 64, 71]),
      },
    };
    expect(findMixSnapshotDrift(
      styleResult.snapshots,
      candidates,
      styleConfig,
    )).toEqual([]);

    const resolvedResult = preflightMixSession({
      config: makeConfig(2),
      candidates,
    });
    expect(resolvedResult.ok).toBe(true);
    if (!resolvedResult.ok) return;
    candidates[0].block!.practice = {
      schemaVersion: 1,
      progressionFingerprint: "unrelated-practice-change",
      confirmedLevel: 3,
      lastPracticedAt: "2026-07-24T10:00:00.000Z",
    };
    expect(findMixSnapshotDrift(
      resolvedResult.snapshots,
      candidates,
      makeConfig(2),
    )).toEqual([]);
  });

  it("builds resolved and Style target plans without persistence", () => {
    expect(successfulPreflight(2).snapshots.every(
      (snapshot) => snapshot.targetPlan.targetSource.type === "resolved-voicing",
    )).toBe(true);
    const style = successfulPreflight(2, {
      targetSource: { type: "generated-close" },
      styleMatchMode: "exact-pitch",
    });
    expect(style.snapshots.every(
      (snapshot) => snapshot.targetPlan.targetSource.type === "generated-close",
    )).toBe(true);
  });

  it("blocks an unsupported Style unless its existing fallback is explicit", () => {
    const candidates = makeCandidates(2);
    candidates[0] = {
      ...candidates[0],
      block: makeBlock(references[0].blockId, {
        chords: [{
          ...makeBlock(references[0].blockId).chords[0],
          chord: makeChordSymbol(0, "maj"),
        }],
      }),
    };
    const targetSource = { type: "style", styleId: "rootless-ab" } as const;
    const strict = preflightMixSession({
      config: makeConfig(2, { targetSource }),
      candidates,
      styleOptions: {
        maxLeftHandSpanSemitones: 14,
        maxRightHandSpanSemitones: 14,
        allowUnsupportedFallback: false,
      },
    });
    expect(strict.ok).toBe(false);
    if (!strict.ok) {
      expect(strict.errors.map((error) => error.code))
        .toContain("target-plan-unsupported");
    }

    const fallback = preflightMixSession({
      config: makeConfig(2, {
        targetSource,
        allowUnsupportedFallback: true,
      }),
      candidates,
      styleOptions: {
        maxLeftHandSpanSemitones: 14,
        maxRightHandSpanSemitones: 14,
        allowUnsupportedFallback: true,
      },
    });
    expect(fallback.ok).toBe(true);
  });
});

describe("Progression shuffle bag", () => {
  it("is deterministic, seed-sensitive, and independent of input order", () => {
    const first = buildProgressionOrder(references.slice(0, 5), 3, 123);
    const same = buildProgressionOrder([...references.slice(0, 5)].reverse(), 3, 123);
    const different = buildProgressionOrder(references.slice(0, 5), 3, 456);
    expect(same).toEqual(first);
    expect(different).not.toEqual(first);
  });

  it("does not repeat within a cycle or across cycle boundaries", () => {
    const order = buildProgressionOrder(references.slice(0, 5), 3, 42);
    for (const cycle of [1, 2, 3]) {
      const keys = order
        .filter((item) => item.cycle === cycle)
        .map((item) => progressionReferenceKey(item.reference));
      expect(new Set(keys).size).toBe(5);
    }
    expect(sameProgressionReference(order[4].reference, order[5].reference)).toBe(false);
    expect(sameProgressionReference(order[9].reference, order[10].reference)).toBe(false);
  });

  it("keeps two progressions alternating across three cycles", () => {
    const order = buildProgressionOrder(references.slice(0, 2), 3, 7);
    for (let index = 1; index < order.length; index += 1) {
      expect(sameProgressionReference(
        order[index - 1].reference,
        order[index].reference,
      )).toBe(false);
    }
  });
});

describe("Mix session reducer", () => {
  it("delegates Step matching and advances after clean or dirty completion", () => {
    const preflight = successfulPreflight(2);
    let state = start(createMixSessionState(makeConfig(2), preflight.snapshots, 9));
    state = settleEvent(state, 1);
    state = settleEvent(state, 2);
    expect(state.status).toBe("between-progressions");
    expect(state.results[0].result).toBe("clean");

    state = start(state);
    state = settleEvent(state, 3, [99]);
    state = settleEvent(state, 4);
    state = settleEvent(state, 5);
    expect(state.status).toBe("summary");
    expect(state.results[1].result).toBe("dirty");
  });

  it("lets dirty Flow reach the round end before advancing", () => {
    const config = makeConfig(2, { mode: "flow" });
    const preflight = successfulPreflight(2, { mode: "flow" });
    let state = start(createMixSessionState(config, preflight.snapshots, 12));
    const context = contextFor(state);
    state = reduceMixSession(state, {
      type: "PRACTICE_ACTION",
      action: { type: "FLOW_TARGET_CLOSE", eventIndex: 0 },
    }, context);
    expect(state.status).toBe("running");
    state = reduceMixSession(state, {
      type: "PRACTICE_ACTION",
      action: { type: "ROUND_COMPLETED" },
    }, context);
    expect(state.status).toBe("between-progressions");
    expect(state.results[0].result).toBe("dirty");
  });

  it("pauses and resumes the delegated practice session with a fresh attack guard", () => {
    const preflight = successfulPreflight(2, { mode: "flow" });
    let state = start(createMixSessionState(
      makeConfig(2, { mode: "flow" }),
      preflight.snapshots,
      21,
    ));
    const context = contextFor(state);
    state = reduceMixSession(state, { type: "PAUSE" }, context);
    expect(state.status).toBe("paused");
    state = reduceMixSession(state, {
      type: "RESUME",
      requiredAttackRevision: 8,
    }, context);
    expect(state.status).toBe("running");
    expect(state.currentPracticeSession?.requiredAttackRevision).toBe(8);
  });

  it("restarts a stopped Flow progression from its first event", () => {
    const preflight = successfulPreflight(2, { mode: "flow" });
    let state = start(createMixSessionState(
      makeConfig(2, { mode: "flow" }),
      preflight.snapshots,
      22,
    ));
    const context = contextFor(state);
    state = reduceMixSession(state, {
      type: "PRACTICE_ACTION",
      action: { type: "FLOW_TARGET_OPEN", eventIndex: 1 },
    }, context);
    expect(state.currentPracticeSession?.currentEventIndex).toBe(1);
    state = reduceMixSession(state, { type: "PAUSE" }, context);
    state = reduceMixSession(state, {
      type: "RESTART_CURRENT",
      requiredAttackRevision: 12,
    }, context);

    expect(state.status).toBe("running");
    expect(state.currentPracticeSession?.currentEventIndex).toBe(0);
    expect(state.currentPracticeSession?.roundNumber).toBe(1);
    expect(state.currentPracticeSession?.requiredAttackRevision).toBe(12);
  });

  it("creates a neutral summary and retries only the dirty subset", () => {
    const preflight = successfulPreflight(2);
    let state = start(createMixSessionState(makeConfig(2), preflight.snapshots, 9));
    state = settleEvent(state, 1);
    state = settleEvent(state, 2);
    state = start(state);
    state = settleEvent(state, 3, [99]);
    state = settleEvent(state, 4);
    state = settleEvent(state, 5);
    const summary = mixSessionSummary(state);
    expect(summary.clean).toHaveLength(1);
    expect(summary.dirty).toHaveLength(1);

    const retry = retryDirtyMixSession(state, 99);
    expect(retry?.snapshots).toHaveLength(1);
    expect(retry?.config.references).toEqual([summary.dirty[0].reference]);
  });

  it("never mutates source candidates or a Vault-shaped object", () => {
    const candidates = makeCandidates(2);
    const vault = {
      fileVersion: 1,
      ideas: candidates.map((candidate) => ({
        id: candidate.reference.ideaId,
        progressionBlocks: [candidate.block],
      })),
    };
    const before = structuredClone(vault);
    const preflight = preflightMixSession({
      config: makeConfig(2),
      candidates,
    });
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    let state = start(createMixSessionState(makeConfig(2), preflight.snapshots, 3));
    state = settleEvent(state, 1);
    state = settleEvent(state, 2);
    expect(state.results).toHaveLength(1);
    expect(vault).toEqual(before);
  });
});
