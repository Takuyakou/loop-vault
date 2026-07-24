import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type {
  ChordSymbol,
  ChordTimelineItem,
  ChordVoicingMemory,
} from "../types";
import {
  createPracticeSessionState,
  reducePracticeSession,
} from "../practice";
import { normalizedChordKey } from "../voicing";
import { generateStyleVoicingPlan } from "../voicingPractice";
import {
  createPracticeTargetMatchEvaluator,
  createPracticeTargetPlan,
  getCanonicalKey,
  transposeProgression,
} from ".";

const styleOptions = {
  maxLeftHandSpanSemitones: 12,
  maxRightHandSpanSemitones: 12,
  allowUnsupportedFallback: false,
};

describe("practice target plan", () => {
  it("builds a resolved source-memory plan and explicit notes map", () => {
    const chord = makeChordSymbol(0, "maj7");
    const progression = progressionFor([
      chordEvent(chord, 0, verifiedVoicing(chord, [48, 55, 60, 64])),
    ], 2);
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "resolved-voicing" },
      leniency: "normal",
    });
    if (!result.ok) throw new Error("Expected a resolved target plan.");
    const event = result.plan.events[0];
    expect(event).toEqual(expect.objectContaining({
      chord: expect.objectContaining({ root: 2, label: "Dmaj7" }),
      midiNotes: [50, 57, 62, 66],
      origin: "practice-override",
      ready: true,
      fallback: false,
    }));
    expect(result.plan.matchInput).toEqual({ type: "chord-symbol" });
    expect(result.plan.handGuideMode).toBe("none");
    expect(event.leftHandNotes).toEqual([]);
    expect(event.rightHandNotes).toEqual([]);
    expect(result.plan.requirements).toHaveLength(1);
    expect(result.plan.requirements[0]).toEqual(expect.objectContaining({
      requiredPitchClasses: [1, 2, 6],
      allowedPitchClasses: [1, 2, 6, 9],
      chordKey: normalizedChordKey(event.chord),
    }));
    expect(result.plan.explicitMidiNotesByEventId[event.eventId])
      .toEqual(event.midiNotes);
    expect(result.plan.explicitMidiNotesByEventId[event.eventId])
      .not.toBe(event.midiNotes);
  });

  it("generates close voicings from target-key chords instead of shifting a source plan", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(0, "maj9"), 0),
      chordEvent(makeChordSymbol(7, "dom13"), 1),
    ], 3);
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "generated-close" },
      leniency: "normal",
    });
    if (!result.ok) throw new Error("Expected a generated close plan.");
    const direct = generateStyleVoicingPlan(
      progression.events,
      "generated-close",
      styleOptions,
    );
    expect(result.plan.events.map((event) => event.midiNotes))
      .toEqual(direct.events.map((event) => event.allNotes));
    expect(result.plan.events.map((event) => event.chord.root)).toEqual([3, 10]);
    expect(result.plan.events.every((event) => (
      event.styleId === "generated-close" && event.ready
    ))).toBe(true);
  });

  it.each(["shell-17", "open-17"] as const)(
    "regenerates %s left and right hands in the target key",
    (styleId) => {
      const progression = progressionFor([
        chordEvent(makeChordSymbol(2, "min7"), 0),
        chordEvent(makeChordSymbol(7, "dom7", ["b9"]), 1),
        chordEvent(makeChordSymbol(0, "maj7"), 2),
      ], 5);
      const result = createPracticeTargetPlan({
        progression,
        targetSource: { type: "style", styleId },
        leniency: "normal",
        styleOptions,
        styleMatchMode: "pitch-class",
      });
      if (!result.ok) throw new Error(`Expected a ${styleId} target plan.`);
      const direct = generateStyleVoicingPlan(
        progression.events,
        styleId,
        styleOptions,
      );
      expect(result.plan.events.map(({ leftHandNotes, rightHandNotes }) => ({
        leftHandNotes,
        rightHandNotes,
      }))).toEqual(direct.events.map(({ leftHandNotes, rightHandNotes }) => ({
        leftHandNotes,
        rightHandNotes,
      })));
      expect(result.plan.matchInput).toEqual(expect.objectContaining({
        type: "voicing",
        mode: "pitch-class",
      }));
      expect(result.plan.handGuideMode).toBe("split");
    },
  );

  it("drives the session reducer with target-key chord requirements", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(0, "maj"), 0),
    ], 2);
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "resolved-voicing" },
      leniency: "normal",
    });
    if (!result.ok) throw new Error("Expected a resolved target plan.");
    const context = {
      events: progression.events,
      requirements: result.plan.requirements,
    };
    const createRunningSession = () => reducePracticeSession(
      createPracticeSessionState({
        blockId: "target-reducer",
        progressionFingerprint: "target-reducer-fingerprint",
        level: 1,
        mode: "step",
        leniency: "normal",
        bpm: 90,
        targetTempo: 90,
        eventCount: 1,
      }),
      { type: "START_SESSION" },
      context,
    );

    const sourceInput = reducePracticeSession(
      createRunningSession(),
      {
        type: "MIDI_STATE_CHANGED",
        input: {
          heldMidiNotes: [60, 64, 67],
          sustainedMidiNotes: [],
          attackRevision: 1,
          timestampMs: 0,
        },
      },
      context,
    );
    expect(sourceInput.lastMatch?.state).toBe("wrong");
    const rejected = reducePracticeSession(
      sourceInput,
      { type: "STABLE_DEADLINE", nowMs: 100 },
      context,
    );
    expect(rejected.roundDirty).toBe(true);
    expect(rejected.lastRoundWasClean).toBeUndefined();

    const targetInput = reducePracticeSession(
      createRunningSession(),
      {
        type: "MIDI_STATE_CHANGED",
        input: {
          heldMidiNotes: [62, 66, 69],
          sustainedMidiNotes: [],
          attackRevision: 1,
          timestampMs: 0,
        },
      },
      context,
    );
    expect(targetInput.lastMatch?.state).toBe("match");
    const accepted = reducePracticeSession(
      targetInput,
      { type: "STABLE_DEADLINE", nowMs: 100 },
      context,
    );
    expect(accepted.lastRoundWasClean).toBe(true);
  });

  it("recomputes rootless A/B variants from the target-key progression", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(2, "min7"), 0),
      chordEvent(makeChordSymbol(7, "dom7"), 1),
      chordEvent(makeChordSymbol(0, "maj7"), 2),
      chordEvent(makeChordSymbol(9, "min7"), 3),
    ], 8);
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "style", styleId: "rootless-ab" },
      leniency: "normal",
      styleOptions,
    });
    if (!result.ok) throw new Error("Expected a rootless target plan.");
    const direct = generateStyleVoicingPlan(
      progression.events,
      "rootless-ab",
      styleOptions,
    );
    expect(result.plan.events.map((event) => event.variant))
      .toEqual(direct.events.map((event) => event.variant));
    expect(result.plan.events.map((event) => event.midiNotes))
      .toEqual(direct.events.map((event) => event.allNotes));
    expect(result.plan.events.every((event) => (
      event.variant === "A" || event.variant === "B"
    ))).toBe(true);
  });

  it("preserves minor, slash-bass, and altered chord structure", () => {
    const sourceChord = makeChordSymbol(7, "dom7", ["b9", "#11"], 11);
    const progression = transposeProgression({
      sourceKey: getCanonicalKey(9, "minor"),
      sourceMode: "minor",
      events: [chordEvent(sourceChord, 0)],
      targetTonicPitchClass: 10,
      sourceReference: { ideaId: "minor", blockId: "altered-slash" },
    });
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "style", styleId: "shell-17" },
      leniency: "strict",
      styleOptions,
    });
    if (!result.ok) throw new Error("Expected a minor target plan.");
    expect(result.plan.targetKey).toEqual(getCanonicalKey(10, "minor"));
    expect(result.plan.events[0].chord).toEqual(expect.objectContaining({
      root: 8,
      quality: "dom7",
      tensions: ["b9", "#11"],
      bass: 0,
    }));
    expect(result.plan.events[0].leftHandNotes.length).toBeGreaterThan(0);
    expect(result.plan.events[0].rightHandNotes.length).toBeGreaterThan(0);
  });

  it("preserves unsupported events and only applies explicit close fallback", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(0, "maj"), 0),
      chordEvent(makeChordSymbol(7, "dom7"), 1),
    ], 2);
    const strict = createPracticeTargetPlan({
      progression,
      targetSource: { type: "style", styleId: "rootless-ab" },
      leniency: "normal",
      styleOptions,
    });
    if (!strict.ok) throw new Error("Expected an inspectable strict plan.");
    expect(strict.plan.unsupportedEvents).toHaveLength(1);
    expect(strict.plan.events[0]).toEqual(expect.objectContaining({
      ready: false,
      midiNotes: [],
      fallback: false,
      unsupportedReason: expect.any(String),
    }));
    expect(strict.plan.explicitMidiNotesByEventId[strict.plan.events[0].eventId])
      .toBeUndefined();

    const fallback = createPracticeTargetPlan({
      progression,
      targetSource: { type: "style", styleId: "rootless-ab" },
      leniency: "normal",
      styleOptions: {
        ...styleOptions,
        allowUnsupportedFallback: true,
      },
    });
    if (!fallback.ok) throw new Error("Expected an explicit fallback plan.");
    expect(fallback.plan.unsupportedEvents).toHaveLength(1);
    expect(fallback.plan.events[0]).toEqual(expect.objectContaining({
      ready: true,
      styleId: "generated-close",
      fallback: true,
      warnings: ["fallback-close"],
    }));
  });

  it("keeps match options and every ready event's explicit preview notes", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(0, "maj7"), 0),
      chordEvent(makeChordSymbol(5, "maj7"), 1),
      chordEvent(makeChordSymbol(7, "dom7"), 2),
    ], 1);
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "style", styleId: "open-17" },
      leniency: "normal",
      styleOptions,
      styleMatchMode: "exact-pitch",
      exactPitchOptions: {
        allowGlobalOctaveShift: false,
        octaveShiftCandidates: [0],
      },
    });
    if (!result.ok) throw new Error("Expected an explicit-note plan.");
    expect(result.plan.matchInput).toEqual({
      type: "voicing",
      mode: "exact-pitch",
      exactPitchOptions: {
        allowGlobalOctaveShift: false,
        octaveShiftCandidates: [0],
      },
    });
    expect(Object.keys(result.plan.explicitMidiNotesByEventId))
      .toEqual(result.plan.events.map((event) => event.eventId));
    result.plan.events.forEach((event) => {
      expect(result.plan.explicitMidiNotesByEventId[event.eventId])
        .toEqual(event.midiNotes);
    });
    const evaluator = createPracticeTargetMatchEvaluator(result.plan);
    expect(evaluator).toBeDefined();
    const match = evaluator?.(
      {
        requiredPitchClasses: [],
        optionalPitchClasses: [],
        allowedPitchClasses: [],
        chordKey: "",
      },
      {
        heldMidiNotes: [...result.plan.events[0].midiNotes],
        sustainedMidiNotes: [],
        attackRevision: 1,
        timestampMs: 100,
      },
      1,
      0,
    );
    expect(match?.state).toBe("match");
  });

  it("adapts pitch-class target matching to the existing session evaluator", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(0, "maj7"), 0),
    ], 5);
    const result = createPracticeTargetPlan({
      progression,
      targetSource: { type: "style", styleId: "shell-17" },
      leniency: "normal",
      styleOptions,
      styleMatchMode: "pitch-class",
    });
    if (!result.ok) throw new Error("Expected a pitch-class target plan.");
    const evaluator = createPracticeTargetMatchEvaluator(result.plan);
    const shiftedNotes = result.plan.events[0].midiNotes.map((note) => note + 12);
    expect(evaluator?.(
      {
        requiredPitchClasses: [],
        optionalPitchClasses: [],
        allowedPitchClasses: [],
        chordKey: "",
      },
      {
        heldMidiNotes: shiftedNotes,
        sustainedMidiNotes: [],
        attackRevision: 2,
        timestampMs: 200,
      },
      2,
      0,
    ).state).toBe("match");
  });

  it("is deterministic and leaves progression and option inputs untouched", () => {
    const progression = progressionFor([
      chordEvent(makeChordSymbol(0, "maj7"), 0),
      chordEvent(makeChordSymbol(5, "min9"), 1),
      chordEvent(makeChordSymbol(7, "dom13"), 2),
    ], 6);
    const targetSource = {
      type: "style" as const,
      styleId: "shell-17" as const,
    };
    const options = {
      ...styleOptions,
      allowUnsupportedFallback: true,
    };
    const progressionSnapshot = structuredClone(progression);
    const sourceSnapshot = structuredClone(targetSource);
    const optionSnapshot = structuredClone(options);
    const first = createPracticeTargetPlan({
      progression,
      targetSource,
      leniency: "normal",
      styleOptions: options,
    });
    for (let iteration = 0; iteration < 25; iteration += 1) {
      expect(createPracticeTargetPlan({
        progression,
        targetSource,
        leniency: "normal",
        styleOptions: options,
      })).toEqual(first);
    }
    expect(progression).toEqual(progressionSnapshot);
    expect(targetSource).toEqual(sourceSnapshot);
    expect(options).toEqual(optionSnapshot);
  });
});

function progressionFor(
  events: ChordTimelineItem[],
  targetTonicPitchClass: number,
) {
  return transposeProgression({
    sourceKey: getCanonicalKey(0, "major"),
    sourceMode: "major",
    events,
    targetTonicPitchClass,
    sourceReference: { ideaId: "target-plan", blockId: "generated" },
  });
}

function chordEvent(
  chord: ChordSymbol,
  index: number,
  voicingMemory?: ChordVoicingMemory,
): ChordTimelineItem {
  return {
    eventId: `target-${index}`,
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
    ...(voicingMemory ? { voicingMemory } : {}),
  };
}

function verifiedVoicing(
  chord: ChordSymbol,
  midiNotes: number[],
): ChordVoicingMemory {
  return {
    practiceVoicingOverride: {
      schemaVersion: 1,
      source: "manual",
      representation: "simultaneous-voicing",
      midiNotes,
      capturedForChordKey: normalizedChordKey(chord),
      userVerified: true,
    },
  };
}
