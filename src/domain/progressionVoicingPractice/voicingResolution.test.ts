import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordQuality, ChordSymbol, Tension } from "../types";
import {
  resolveProgressionPracticeVoicings,
  type DetachedPracticeVoicing,
  type ProgressionPracticeChord,
  type ProgressionPracticeVoicingResolution,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingSelection,
} from ".";

describe("P5.27 explicit MY voicing resolution", () => {
  it("preserves Source MIDI pitch, octave, ordering, bass, and canonical degree facts exactly", () => {
    const result = resolveOne("source-midi", chord("maj7"), {
      kind: "source-midi",
      midiNotes: [72, 48, 59, 61],
      bassNote: 48,
    });

    expect(result).toMatchObject({
      status: "SUPPORTED",
      voicing: {
        origin: "source-midi",
        midiNotes: [72, 48, 59, 61],
        bassNote: 48,
        addedColorDegrees: [],
        notes: [
          { midiNote: 72, pitchClass: 0, octave: 5, degree: "1" },
          { midiNote: 48, pitchClass: 0, octave: 3, degree: "1" },
          { midiNote: 59, pitchClass: 11, octave: 3, degree: "7" },
          { midiNote: 61, pitchClass: 1, octave: 4, degree: null },
        ],
      },
    });
  });

  it("preserves Custom independently and never relabels it as Source", () => {
    const result = resolveOne("custom", chord("min7"), {
      kind: "custom",
      midiNotes: [43, 58, 63, 67],
      bassNote: 43,
    });
    expect(result).toMatchObject({
      status: "SUPPORTED",
      voicing: { origin: "custom", midiNotes: [43, 58, 63, 67], bassNote: 43 },
    });
  });

  it.each([
    ["source-midi", 4, 40, "3"],
    ["source-midi", 11, 47, "7"],
    ["source-midi", 7, 43, "5"],
    ["custom", 4, 40, "3"],
    ["custom", 11, 47, "7"],
    ["custom", 7, 43, "5"],
  ] as const)(
    "labels only the exact %s slash-bass occurrence as Bass for pitch class %s",
    (selection, bassPitchClass, bassNote, canonicalDegree) => {
      const result = resolveOne(selection, chord("maj7", [], bassPitchClass), {
        kind: selection,
        midiNotes: [bassNote, bassNote + 12, 48],
        bassNote,
      });
      expect(result.status).toBe("SUPPORTED");
      if (result.status !== "SUPPORTED") return;
      expect(result.voicing.notes).toEqual([
        { midiNote: bassNote, pitchClass: bassPitchClass, octave: Math.floor(bassNote / 12) - 1, degree: "Bass" },
        {
          midiNote: bassNote + 12,
          pitchClass: bassPitchClass,
          octave: Math.floor((bassNote + 12) / 12) - 1,
          degree: canonicalDegree,
        },
        { midiNote: 48, pitchClass: 0, octave: 3, degree: "1" },
      ]);
    },
  );

  it("does not mislabel an inconsistent MY bassNote as the slash Bass", () => {
    const result = resolveOne("source-midi", chord("maj7", [], 4), {
      kind: "source-midi",
      midiNotes: [43, 52, 59],
      bassNote: 43,
    });
    expect(result.status).toBe("SUPPORTED");
    if (result.status !== "SUPPORTED") return;
    expect(result.voicing.notes.map((note) => note.degree)).toEqual(["5", "3", "7"]);
  });

  it.each([
    ["source-midi", undefined],
    ["custom", undefined],
    ["source-midi", { kind: "custom", midiNotes: [48, 59, 64] }],
    ["custom", { kind: "source-midi", midiNotes: [48, 59, 64] }],
  ] as const)("returns explicit UNAVAILABLE for %s and never crosses MY families", (selection, voicing) => {
    expect(resolveOne(selection, chord("maj7"), voicing)).toEqual({
      eventId: "event-1",
      status: "UNAVAILABLE",
      reason: "selected-source-unavailable",
    });
  });
});

describe("P5.27 Basic 1-7-3 locked lesson table", () => {
  it.each([
    "maj7", "maj9", "min7", "min9", "min11", "dom7", "dom9", "dom13",
    "six", "sixNine", "min6", "min7b5", "dom7sus4",
  ] satisfies ChordQuality[])("supports audited Basic cells for %s", (quality) => {
    expect(resolveOne("basic-shell", chord(quality)).status).toBe("SUPPORTED");
    expect(resolveOne("basic-full", chord(quality)).status).toBe("SUPPORTED");
  });

  it.each([
    ["maj7", ["1", "7"], ["1", "3", "7"]],
    ["min11", ["1", "b7"], ["1", "b3", "b7"]],
    ["dom13", ["1", "b7"], ["1", "3", "b7"]],
    ["sixNine", ["1", "6"], ["1", "3", "6"]],
    ["min6", ["1", "6"], ["1", "b3", "6"]],
    ["min7b5", ["1", "b5", "b7"], ["1", "b3", "b5", "b7"]],
    ["dom7sus4", ["1", "b7"], ["1", "4", "b7"]],
  ] satisfies ReadonlyArray<readonly [ChordQuality, readonly string[], readonly string[]]>)(
    "keeps Shell and Full degree sets exact for %s",
    (quality, shellDegrees, fullDegrees) => {
      expect(degrees(resolveOne("basic-shell", chord(quality)))).toEqual(shellDegrees);
      expect(degrees(resolveOne("basic-full", chord(quality)))).toEqual(fullDegrees);
    },
  );

  it.each([
    "maj", "min", "dim", "dim7", "sus2", "sus4", "aug", "add9",
  ] satisfies ChordQuality[])("returns UNSUPPORTED_RULE for unaudited Basic chord %s", (quality) => {
    for (const selection of ["basic-shell", "basic-full"] as const) {
      expect(resolveOne(selection, chord(quality))).toEqual({
        eventId: "event-1",
        status: "UNSUPPORTED_RULE",
        reason: "no-approved-lesson-rule",
      });
    }
  });

  it("uses only the first audited altered identity for Basic and never completes the chord silently", () => {
    const altered = chord("dom7", ["b9", "#9", "b13"]);
    expect(degrees(resolveOne("basic-shell", altered))).toEqual(["1", "b7", "b9"]);
    expect(degrees(resolveOne("basic-full", altered))).toEqual(["1", "3", "b7", "b9"]);
    expect(degrees(resolveOne("basic-shell", chord("dom9", ["b13"])))).toEqual(["1", "b7", "9"]);
  });

  it.each([
    ["min7b5", ["#11"], ["1", "b3", "b5", "b7"]],
    ["six", ["13"], ["1", "3", "6"]],
    ["dom7sus4", ["11"], ["1", "4", "b7"]],
  ] satisfies ReadonlyArray<readonly [ChordQuality, Tension[], readonly string[]]>)(
    "retains approved Basic degrees when explicit tension dedupe collides for %s",
    (quality, tensions, expectedDegrees) => {
      const result = resolveOne("basic-full", chord(quality, tensions));
      expect(result.status).toBe("SUPPORTED");
      expect(degrees(result)).toEqual(expectedDegrees);
    },
  );

  it("replaces root with explicit slash Bass only for an otherwise supported Basic family", () => {
    const slash = chord("maj7", [], 7);
    expect(degrees(resolveOne("basic-shell", slash))).toEqual(["7", "Bass"]);
    expect(degrees(resolveOne("basic-full", slash))).toEqual(["3", "7", "Bass"]);
    expect(resolveOne("basic-shell", chord("dim", [], 7)).status).toBe("UNSUPPORTED_RULE");
  });

  it("keeps a minor-11 slash chord playable as a two-note left-hand shell", () => {
    const slash = makeChordSymbol(9, "min11", [], 11);
    const result = resolveOne("basic-shell", slash);
    expect(result.status).toBe("SUPPORTED");
    if (result.status !== "SUPPORTED") return;
    expect(result.voicing.midiNotes).toHaveLength(2);
    expect(result.voicing.leftHandNotes).toEqual(result.voicing.midiNotes);
    expect(result.voicing.rightHandNotes).toEqual([]);
    expect(degrees(result)).toEqual(["b7", "Bass"]);
  });

  it.each([
    [4, "3", 2],
    [11, "7", 2],
    [7, "5", 1],
  ] as const)(
    "carries one generated Cmaj7 slash-bass occurrence for pitch class %s without overwriting %s",
    (bassPitchClass, canonicalDegree, occurrenceCount) => {
      const result = resolveOne("basic-full", chord("maj7", [], bassPitchClass));
      expect(result.status).toBe("SUPPORTED");
      if (result.status !== "SUPPORTED") return;
      const occurrences = result.voicing.notes.filter((note) => note.pitchClass === bassPitchClass);
      expect(occurrences).toHaveLength(occurrenceCount);
      expect(occurrences.filter((note) => note.degree === "Bass")).toHaveLength(1);
      if (occurrenceCount > 1) {
        expect(occurrences.filter((note) => note.degree === canonicalDegree)).toHaveLength(1);
      }
      expect(result.voicing.bassNote).toBe(occurrences.find((note) => note.degree === "Bass")?.midiNote);
    },
  );
});

describe("P5.27 Left-hand locked lesson table", () => {
  it.each([
    "maj7", "maj9", "min7", "min9", "min11", "dom7", "dom9", "dom13", "min7b5",
  ] satisfies ChordQuality[])("supports existing Rootless A/B rule for %s", (quality) => {
    expect(resolveOne("left-hand", chord(quality)).status).toBe("SUPPORTED");
  });

  it("exposes the existing deterministic A and B variants without duplicating the generator", () => {
    const snapshot = makeSnapshot("left-hand", chord("maj7"));
    const a = resolveProgressionPracticeVoicings(snapshot, { leftHandVariant: "A" }).events[0]!;
    const b = resolveProgressionPracticeVoicings(snapshot, { leftHandVariant: "B" }).events[0]!;
    expect(a.voicing?.variant).toBe("A");
    expect(b.voicing?.variant).toBe("B");
    expect(degrees(a)).toEqual(["3", "5", "7", "9"]);
    expect(degrees(b)).toEqual(["3", "5", "7", "9"]);
    expect(a.voicing?.midiNotes).not.toEqual(b.voicing?.midiNotes);
  });

  it("preserves existing altered-dominant A/B templates and discloses no generated fallback", () => {
    const snapshot = makeSnapshot("left-hand", chord("dom7", ["b9", "#9", "b13"]));
    const a = resolveProgressionPracticeVoicings(snapshot, { leftHandVariant: "A" }).events[0]!;
    const b = resolveProgressionPracticeVoicings(snapshot, { leftHandVariant: "B" }).events[0]!;
    expect(degrees(a)).toEqual(["3", "b7", "b9", "#9"]);
    expect(degrees(b)).toEqual(["3", "b7", "b9", "#9"]);
    expect(a.voicing?.origin).toBe("left-hand");
    expect(b.voicing?.origin).toBe("left-hand");
  });

  it("maps existing neutral Rootless colors to degree facts and discloses them", () => {
    const result = resolveOne("left-hand", chord("dom7"));
    expect(result.voicing?.addedColorDegrees).toEqual(expect.arrayContaining(["9", "13"]));
    expect(degrees(result)).toEqual(["3", "b7", "9", "13"]);
  });

  it("keeps the approved Rootless b5 degree when an explicit #11 shares its pitch class", () => {
    const result = resolveOne("left-hand", chord("min7b5", ["#11"]));
    expect(result.status).toBe("SUPPORTED");
    expect(degrees(result)).toEqual(["b3", "b5", "b7", "9"]);
    expect(result.status === "SUPPORTED" && result.voicing.notes.some((note) => note.degree === "#11"))
      .toBe(false);
  });

  it.each([
    "maj", "min", "six", "sixNine", "min6", "dim", "dim7", "sus2", "sus4",
    "dom7sus4", "aug", "add9",
  ] satisfies ChordQuality[])("returns UNSUPPORTED_RULE for unaudited Left-hand chord %s", (quality) => {
    expect(resolveOne("left-hand", chord(quality))).toEqual({
      eventId: "event-1",
      status: "UNSUPPORTED_RULE",
      reason: "no-approved-lesson-rule",
    });
  });

  it("keeps slash chords explicitly unsupported instead of dropping the bass", () => {
    expect(resolveOne("left-hand", chord("maj7", [], 7))).toEqual({
      eventId: "event-1",
      status: "UNSUPPORTED_RULE",
      reason: "no-approved-lesson-rule",
    });
  });
});

describe("P5.27 resolution status and determinism", () => {
  it("distinguishes a supported rule that cannot build a candidate from an unsupported rule", () => {
    const supported = makeSnapshot("basic-shell", chord("maj7"));
    const generationError = resolveProgressionPracticeVoicings(supported, {
      maxLeftHandSpanSemitones: 0,
      maxRightHandSpanSemitones: 0,
    }).events[0];
    expect(generationError).toEqual({
      eventId: "event-1",
      status: "GENERATION_ERROR",
      reason: "candidate-generation-failed",
    });
    expect(resolveOne("basic-shell", chord("dim")).status).toBe("UNSUPPORTED_RULE");

    const leftHandGenerationError = resolveProgressionPracticeVoicings(
      makeSnapshot("left-hand", chord("maj7")),
      { maxLeftHandSpanSemitones: 0, maxRightHandSpanSemitones: 0 },
    ).events[0];
    expect(leftHandGenerationError?.status).toBe("GENERATION_ERROR");
  });

  it("optimizes a mixed progression deterministically with event identity preserved", () => {
    const snapshot = makeSnapshot("left-hand", [
      chord("min7"), chord("dom7", ["b9"]), chord("maj7"), chord("min7b5"),
    ]);
    const expected = resolveProgressionPracticeVoicings(snapshot);
    for (let run = 0; run < 100; run += 1) {
      expect(resolveProgressionPracticeVoicings(snapshot)).toEqual(expected);
    }
    expect(expected.events.map((event) => event.eventId)).toEqual([
      "event-1", "event-2", "event-3", "event-4",
    ]);
    expect(expected.events.every((event) => event.status === "SUPPORTED")).toBe(true);
  });

  it("returns immutable plan and note facts", () => {
    const result = resolveProgressionPracticeVoicings(makeSnapshot("basic-full", chord("maj7")));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.events[0])).toBe(true);
    expect(Object.isFrozen(result.events[0]?.voicing)).toBe(true);
    expect(Object.isFrozen(result.events[0]?.voicing?.midiNotes)).toBe(true);
    expect(Object.isFrozen(result.events[0]?.voicing?.notes)).toBe(true);
  });

  it("narrows supported results to required voicing and failure results to their exact reason", () => {
    const supported = resolveOne("basic-shell", chord("maj7"));
    const unavailable = resolveOne("source-midi", chord("maj7"));
    expect(playableMidiNotes(supported).length).toBeGreaterThan(0);
    expect(playableMidiNotes(unavailable)).toEqual([]);
    expect(unavailable).toEqual({
      eventId: "event-1",
      status: "UNAVAILABLE",
      reason: "selected-source-unavailable",
    });
  });
});

function resolveOne(
  selection: ProgressionVoicingSelection,
  sourceChord: ChordSymbol,
  voicing?: DetachedPracticeVoicing,
): ProgressionPracticeVoicingResolution {
  return resolveProgressionPracticeVoicings(makeSnapshot(selection, sourceChord, voicing)).events[0]!;
}

function makeSnapshot(
  selection: ProgressionVoicingSelection,
  sourceChords: ChordSymbol | readonly ChordSymbol[],
  voicing?: DetachedPracticeVoicing,
): ProgressionVoicingPracticeSnapshot {
  const chords = Array.isArray(sourceChords) ? sourceChords : [sourceChords];
  return {
    version: 1,
    fingerprint: `fixture-${selection}`,
    source: { kind: "vault", reference: { ideaId: "idea-1", blockId: "block-1" } },
    selection,
    bpm: 100,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: chords.length * 4,
    events: chords.map((sourceChord, index) => ({
      id: `event-${index + 1}`,
      startBeat: index * 4,
      durationBeats: 4,
      chord: practiceChord(sourceChord),
      ...(index === 0 && voicing ? { voicing } : {}),
    })),
  };
}

function chord(quality: ChordQuality, tensions: Tension[] = [], bass?: number): ChordSymbol {
  return makeChordSymbol(0, quality, tensions, bass);
}

function practiceChord(sourceChord: ChordSymbol): ProgressionPracticeChord {
  return {
    root: sourceChord.root,
    quality: sourceChord.quality,
    tensions: [...sourceChord.tensions],
    ...(sourceChord.bass === undefined ? {} : { bass: sourceChord.bass }),
    label: sourceChord.label,
  };
}

function degrees(result: ProgressionPracticeVoicingResolution): string[] {
  const degreeOrder = [
    "1", "b3", "3", "4", "b5", "5", "#5", "6", "bb7", "b7", "7",
    "b9", "9", "#9", "11", "#11", "b13", "13", "Bass",
  ];
  return [...new Set(result.voicing?.notes.map((note) => note.degree).filter(isString) ?? [])]
    .sort((left, right) => degreeOrder.indexOf(left) - degreeOrder.indexOf(right));
}

function isString(value: string | null): value is string {
  return value !== null;
}

function playableMidiNotes(result: ProgressionPracticeVoicingResolution): readonly number[] {
  if (result.status === "SUPPORTED") return result.voicing.midiNotes;
  return [];
}
