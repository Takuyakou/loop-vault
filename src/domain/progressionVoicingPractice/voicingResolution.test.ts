import { describe, expect, it } from "vitest";
import { makeChordSymbol, parseChordLabel } from "../chords";
import type { ChordQuality, ChordSymbol, Tension } from "../types";
import {
  resolveProgressionPracticeVoicings,
  progressionPracticePlaybackNotes,
  buildProgressionVoicingPracticeSnapshot,
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

describe("P5.32 Shell lesson taxonomy", () => {
  const cadence = [
    [makeChordSymbol(2, "min7"), ["1", "b3", "b7"], ["b3", "b7"]],
    [makeChordSymbol(7, "dom7"), ["1", "3", "b7"], ["3", "b7"]],
    [makeChordSymbol(0, "maj7"), ["1", "3", "7"], ["3", "7"]],
  ] as const;

  it.each(cadence)("resolves %s as the approved Root Shell tone set", (sourceChord, rootShellDegrees) => {
    const result = resolveOne("basic-full", sourceChord);
    expect(result.status).toBe("SUPPORTED");
    expect(degrees(result)).toEqual(rootShellDegrees);
  });

  it.each(cadence)("resolves %s as the approved Rootless Shell tone set", (sourceChord, _rootShellDegrees, rootlessDegrees) => {
    const result = resolveOne("rootless-shell", sourceChord);
    expect(result.status).toBe("SUPPORTED");
    expect(degrees(result)).toEqual(rootlessDegrees);
    if (result.status !== "SUPPORTED") return;
    expect(result.voicing.leftHandNotes).toEqual(result.voicing.midiNotes);
    expect(result.voicing.rightHandNotes).toEqual([]);
  });

  it("preserves approved characteristic tones and fails closed when 3rd/7th has no approved meaning", () => {
    expect(degrees(resolveOne("rootless-shell", chord("min7b5"))))
      .toEqual(["b3", "b5", "b7"]);
    expect(degrees(resolveOne("rootless-shell", chord("dom7", ["#5"]))))
      .toEqual(["3", "#5", "b7"]);
    expect(degrees(resolveOne("rootless-shell", chord("dom7sus4"))))
      .toEqual(["4", "b7"]);
    for (const quality of ["six", "sixNine", "min6"] as const) {
      expect(resolveOne("rootless-shell", chord(quality))).toEqual({
        eventId: "event-1",
        status: "UNSUPPORTED_RULE",
        reason: "no-approved-lesson-rule",
      });
    }
  });
});
describe("Full Shell Voicing", () => {
  it.each([
    ["maj7", [], ["1", "3", "5", "7"]],
    ["min11", [], ["1", "b3", "5", "b7", "9", "11"]],
    ["dom13", [], ["1", "3", "5", "b7", "9", "13"]],
    ["sixNine", [], ["1", "3", "5", "6", "9"]],
    ["min7b5", [], ["1", "b3", "b5", "b7"]],
    ["dom7", ["b9", "#9", "b13"], ["1", "3", "b7", "b9", "#9", "b13"]],
  ] satisfies ReadonlyArray<readonly [ChordQuality, Tension[], readonly string[]]>)(
    "keeps the 1-7 shell in the left hand and all remaining %s chord tones in the right hand",
    (quality, tensions, expectedDegrees) => {
      const result = resolveOne("full-shell", chord(quality, tensions));
      expect(result.status).toBe("SUPPORTED");
      if (result.status !== "SUPPORTED") return;
      expect(degrees(result)).toEqual(expectedDegrees);
      expect(result.voicing.leftHandNotes).toHaveLength(2);
      const expectedLeftDegrees = quality === "sixNine"
        ? ["1", "6"]
        : quality === "maj7"
          ? ["1", "7"]
          : ["1", "b7"];
      expect(handDegrees(result, result.voicing.leftHandNotes)).toHaveLength(2);
      expect(handDegrees(result, result.voicing.leftHandNotes))
        .toEqual(expect.arrayContaining(expectedLeftDegrees));
      expect(result.voicing.rightHandNotes?.length).toBe(expectedDegrees.length - 2);
    },
  );

  it("preserves an explicit slash bass while moving the chord root and remaining tones right", () => {
    const result = resolveOne("full-shell", makeChordSymbol(9, "min11", [], 11));
    expect(result.status).toBe("SUPPORTED");
    if (result.status !== "SUPPORTED") return;
    expect(handDegrees(result, result.voicing.leftHandNotes)).toHaveLength(2);
    expect(handDegrees(result, result.voicing.leftHandNotes))
      .toEqual(expect.arrayContaining(["b7", "Bass"]));
    expect(handDegrees(result, result.voicing.rightHandNotes)).toHaveLength(5);
    expect(handDegrees(result, result.voicing.rightHandNotes))
      .toEqual(expect.arrayContaining(["1", "b3", "5", "9", "11"]));
    expect(result.voicing.bassNote).toBeDefined();
  });

  it("is deterministic and keeps unaudited non-shell families unsupported", () => {
    const snapshot = makeSnapshot("full-shell", [chord("min11"), chord("dom13"), chord("maj9")]);
    const expected = resolveProgressionPracticeVoicings(snapshot);
    for (let run = 0; run < 50; run += 1) {
      expect(resolveProgressionPracticeVoicings(snapshot)).toEqual(expected);
    }
    expect(resolveOne("full-shell", chord("maj")).status).toBe("UNSUPPORTED_RULE");
  });
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

  it("keeps unsupported upper structures unsupported even with approved separate slash bass", () => {
    expect(resolveOne("left-hand", chord("dim", [], 7))).toEqual({
      eventId: "event-1",
      status: "UNSUPPORTED_RULE",
      reason: "no-approved-lesson-rule",
    });
  });
});

describe("P5.31 product-approved upper structure with separate bass", () => {
  it("restores explicit same-root slash display from parsed structural identity", () => {
    const chord = parseChordLabel("Am9/A")!;
    const result = buildProgressionVoicingPracticeSnapshot({
      selection: "left-hand", sourceReference: { ideaId: "idea", blockId: "block" },
      block: { id: "block", summaryText: "Synthetic", bpm: 100, timeSignature: "4/4", tags: [], capturedAt: "2026-09-14T00:00:00Z", analyzerVersion: "test",
        chords: [{ bar: 1, beat: 1, durationBeats: 4, chord, confidence: 1, alternatives: [], warnings: [] }] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.snapshot.events[0]!.chord).toMatchObject({ label: "Am9/A", bass: 9 });
    const resolution = resolveProgressionPracticeVoicings(result.snapshot).events[0]!;
    expect(resolution.status).toBe("SUPPORTED");
    if (resolution.status !== "SUPPORTED") throw new Error("Expected approved rule");
    expect(resolution.voicing.referenceBassNote! % 12).toBe(9);
  });

  it.each(["auto", "A", "B"] as const)("keeps upper targets identical with variant %s and attaches bass after optimization", (leftHandVariant) => {
    const upper = [makeChordSymbol(9, "min11"), makeChordSymbol(9, "min9")];
    const slash = [makeChordSymbol(9, "min11", [], 11), makeChordSymbol(9, "min9", [], 0)];
    const source = makeSnapshot("left-hand", slash);
    const original = JSON.stringify(source);
    const resolved = resolveProgressionPracticeVoicings(source, { leftHandVariant });
    const plain = resolveProgressionPracticeVoicings(makeSnapshot("left-hand", upper), { leftHandVariant });
    resolved.events.forEach((event, index) => {
      const control = plain.events[index]!;
      expect(event.status).toBe("SUPPORTED");
      if (event.status !== "SUPPORTED" || control.status !== "SUPPORTED") throw new Error("Expected approved rule");
      expect(event.voicing.midiNotes).toEqual(control.voicing.midiNotes);
      expect(event.voicing.notes).toEqual(control.voicing.notes);
      expect(event.voicing.variant).toBe(control.voicing.variant);
      const bass = event.voicing.referenceBassNote!;
      expect(bass % 12).toBe(index === 0 ? 11 : 0);
      expect(bass).toBeLessThan(Math.min(...event.voicing.midiNotes));
      expect(event.voicing.leftHandNotes).not.toContain(bass);
      expect(event.voicing.rightHandNotes).not.toContain(bass);
      expect(progressionPracticePlaybackNotes(event.voicing)).toEqual([bass, ...control.voicing.midiNotes]);
      expect(control.voicing.referenceBassNote).toBeUndefined();
    });
    expect(JSON.stringify(source)).toBe(original);
    expect(resolveProgressionPracticeVoicings(source, { leftHandVariant })).toEqual(resolved);
  });

  it("leaves other modes' exact playback rules and unavailable-source handling unchanged", () => {
    const slash = makeChordSymbol(9, "min9", [], 0);
    for (const mode of ["basic-shell", "basic-full", "full-shell", "source-midi", "custom"] as const) {
      const result = resolveOne(mode, slash, mode === "source-midi" || mode === "custom"
        ? { kind: mode, midiNotes: [48, 57, 60, 64], bassNote: 48 } : undefined);
      expect(result.status).toBe("SUPPORTED");
      if (result.status !== "SUPPORTED") throw new Error("Expected supported");
      expect(result.voicing.referenceBassNote).toBeUndefined();
      expect(progressionPracticePlaybackNotes(result.voicing)).toBe(result.voicing.midiNotes);
      if (mode === "source-midi" || mode === "custom") expect(result.voicing.midiNotes).toEqual([48, 57, 60, 64]);
    }
    expect(resolveOne("source-midi", slash).status).toBe("UNAVAILABLE");
    expect(resolveOne("left-hand", makeChordSymbol(11, "dom7", ["#9", "#5"], 0)).status).toBe("UNSUPPORTED_RULE");
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
    spans: chords.map((_, eventIndex) => ({ kind: "chord", eventIndex, startBeat: eventIndex * 4, durationBeats: 4 })),
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

function handDegrees(
  result: ProgressionPracticeVoicingResolution,
  handNotes: readonly number[] | undefined,
): string[] {
  if (result.status !== "SUPPORTED" || !handNotes) return [];
  const byMidiNote = new Map(result.voicing.notes.map((note) => [note.midiNote, note.degree]));
  return handNotes.map((midiNote) => byMidiNote.get(midiNote)).filter(isString);
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string";
}

function playableMidiNotes(result: ProgressionPracticeVoicingResolution): readonly number[] {
  if (result.status === "SUPPORTED") return result.voicing.midiNotes;
  return [];
}
