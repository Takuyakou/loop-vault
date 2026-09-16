import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import {
  resolveProgressionPracticeVoicings,
  type ProgressionVoicingPracticeSnapshot,
} from "../progressionVoicingPractice";
import type { ChordSymbol } from "../types";
import { pitchClass } from "../voicingPractice/candidateTools";
import { generateStudyCandidates } from "./studyGenerator";
import type { VoicingBaseStudy } from "./types";

const spans = { maxLeftHandSpanSemitones: 12, maxRightHandSpanSemitones: 12 };
const context = { bass: "self-played", top: "normal-voicing-top" } as const;
const acceptanceLabels = [
  "Dmaj7", "Dm7", "C#m7", "Eadd9/F#", "C7", "Bm7", "Dadd9/E", "Gmaj9/A",
] as const;
const configurations = [
  ["teacher", false, false],
  ["teacher", true, false],
  ["teacher", false, true],
  ["teacher", true, true],
  ["core", false, false],
  ["core", true, false],
  ["core", false, true],
  ["core", true, true],
] as const satisfies readonly (readonly [VoicingBaseStudy, boolean, boolean])[];

describe("P5.33 generalized study generator", () => {
  it.each(configurations)("%s color=%s open=%s resolves the full eight-chord acceptance progression", (study, color, open) => {
    const plan = resolveProgressionPracticeVoicings(snapshot(acceptanceLabels), {
      lessonStudyCategory: study,
      lessonColorEnabled: color,
      lessonOpenEnabled: open,
    });
    expect(plan.events).toHaveLength(8);
    expect(plan.events.every(({ status }) => status === "SUPPORTED")).toBe(true);
  });

  it("records Teacher output as app-generated from teacher-derived principles", () => {
    const plan = resolveProgressionPracticeVoicings(snapshot(acceptanceLabels), {
      lessonStudyCategory: "teacher",
    });
    for (const event of plan.events) {
      expect(event).toMatchObject({
        status: "SUPPORTED",
        voicing: { explanation: {
          study: "teacher",
          identity: { family: "teacher-style" },
          provenance: { kind: "teacher-derived-generalized" },
          topRole: "top-candidate",
        } },
      });
    }
  });

  it("keeps Color OFF literal and marks Color ON additions as Creative Enrichment", () => {
    const off = resolveProgressionPracticeVoicings(snapshot(["Dmaj7"]), {
      lessonStudyCategory: "teacher",
      lessonColorEnabled: false,
    }).events[0]!;
    const on = resolveProgressionPracticeVoicings(snapshot(["Dmaj7"]), {
      lessonStudyCategory: "teacher",
      lessonColorEnabled: true,
    }).events[0]!;
    expect(off.status === "SUPPORTED" && off.voicing.explanation?.addedDegrees).toEqual([]);
    expect(on).toMatchObject({
      status: "SUPPORTED",
      voicing: { explanation: {
        study: "teacher",
        coverage: "creative-enrichment",
        identity: { family: "family-color" },
      } },
    });
    if (on.status === "SUPPORTED") expect(on.voicing.explanation?.addedDegrees.length).toBeGreaterThan(0);
  });

  it.each([
    ["C/E", ["3"], ["1", "5"]],
    ["Eadd9/F#", ["9"], ["1", "3", "5"]],
    ["Dadd9/E", ["9"], ["1", "3", "5"]],
    ["Am9/C", ["b3"], ["1", "5", "b7", "9"]],
    ["Am11/B", ["9"], ["1", "b3", "b7", "11"]],
  ] as const)("generates slash semantics for %s without changing the upper root basis", (label, expectedLeft, expectedRight) => {
    const candidates = generateStudyCandidates(parsed(label), "teacher", context, spans);
    expect(candidates.some(({ rule }) => (
      expectedLeft.every((degree) => rule.leftDegrees.includes(degree))
      && expectedRight.every((degree) => rule.rightDegrees.includes(degree))
    ))).toBe(true);
  });

  it("keeps Compact and Full Gmaj9/A candidates with honest coverage", () => {
    const candidates = generateStudyCandidates(parsed("Gmaj9/A"), "core", context, spans);
    expect(candidates.every(({ candidate }) => candidate.allNotes.some((note) => pitchClass(note) === 6))).toBe(true);
    expect(candidates.some(({ rule }) => rule.variantId === "core"
      && rule.coverage === "performance-reduction" && rule.omittedDegrees.includes("5"))).toBe(true);
    expect(candidates.some(({ rule }) => rule.variantId === "core-literal"
      && rule.coverage === "literal" && rule.omittedDegrees.length === 0)).toBe(true);
  });

  it.each([
    ["Bm7b5", ["b3", "b5", "b7"], []],
    ["Cdim7", ["b3", "b5", "bb7"], []],
    ["G7sus4", ["4", "b7"], ["3"]],
    ["C6/9", ["3", "6", "9"], ["7"]],
  ] as const)("preserves characteristic degrees for %s", (label, required, forbidden) => {
    for (const optimize of [false, true]) {
      const event = resolveProgressionPracticeVoicings(snapshot([label]), {
        lessonStudyCategory: "core",
        lessonProgressionOptimization: optimize,
      }).events[0]!;
      expect(event.status).toBe("SUPPORTED");
      if (event.status !== "SUPPORTED") continue;
      const degrees = event.voicing.notes.map(({ degree }) => degree);
      for (const degree of required) expect(degrees).toContain(degree);
      for (const degree of forbidden) expect(degrees).not.toContain(degree);
    }
  });

  it.each(["C", "Cm", "Cmaj7", "Cm7", "Cm9", "Cm11", "C7", "C9", "C13", "Cadd9", "C6", "C6/9", "Csus4", "Cm7b5", "Cdim7", "C/E", "Cadd9/D"])("supports ordinary family %s in all eight configurations", (label) => {
    const chord = parsed(label);
    for (const [study, color, open] of configurations) {
      expect(generateStudyCandidates(chord, study, context, {
        ...spans,
        modifiers: { color, open },
      }).length, `${study}:${color}:${open}`).toBeGreaterThan(0);
    }
  });

  it("preserves exact Source MIDI and Custom independently from lesson settings", () => {
    for (const selection of ["source-midi", "custom"] as const) {
      const value = snapshot(["Eadd9/F#"], selection, [42, 64, 68, 71]);
      for (const [study, color, open] of configurations) {
        const event = resolveProgressionPracticeVoicings(value, {
          lessonStudyCategory: study,
          lessonColorEnabled: color,
          lessonOpenEnabled: open,
          lessonProgressionOptimization: false,
        }).events[0]!;
        expect(event).toMatchObject({ status: "SUPPORTED", voicing: {
          midiNotes: [42, 64, 68, 71], bassNote: 42, explanation: { source: selection },
        } });
      }
    }
  });

  it("is deterministic for a 128-event stress progression in every configuration", () => {
    const value = snapshot(Array.from({ length: 16 }, () => acceptanceLabels).flat());
    for (const [study, color, open] of configurations) {
      const options = {
        lessonStudyCategory: study,
        lessonColorEnabled: color,
        lessonOpenEnabled: open,
      } as const;
      const first = resolveProgressionPracticeVoicings(value, options);
      expect(resolveProgressionPracticeVoicings(value, options)).toEqual(first);
      expect(first.events).toHaveLength(128);
      expect(first.events.every(({ status }) => status === "SUPPORTED")).toBe(true);
    }
  });

  it("fails closed when bounded hand spans cannot place the requested family", () => {
    expect(resolveProgressionPracticeVoicings(snapshot(["Dmaj7"]), {
      lessonStudyCategory: "teacher",
      maxLeftHandSpanSemitones: 0,
      maxRightHandSpanSemitones: 0,
    }).events[0]).toMatchObject({ status: "UNSUPPORTED_RULE", reason: "no-approved-lesson-rule" });
  });

  it("keeps slash bass at one pitch/register while Open spreads only upper voices", () => {
    const chord = parsed("Eadd9/F#");
    const closed = generateStudyCandidates(chord, "teacher", context, spans);
    const open = generateStudyCandidates(chord, "teacher", context, {
      ...spans,
      modifiers: { color: false, open: true },
    });
    expect(open.length).toBeGreaterThan(0);
    const basses = new Set([...closed, ...open].map(({ candidate }) => candidate.leftHandNotes[0]));
    expect(basses.size).toBe(1);
    expect(Math.min(...open.map(({ candidate }) => handSpan(candidate.rightHandNotes))))
      .toBeGreaterThan(Math.min(...closed.map(({ candidate }) => handSpan(candidate.rightHandNotes))));
    for (const { candidate } of open) {
      expect(pitchClass(candidate.leftHandNotes[0]!)).toBe(pitchClass(chord.bass!));
      expect(Math.max(...candidate.allNotes) - Math.min(...candidate.allNotes)).toBeGreaterThanOrEqual(24);
    }
  });

  it("treats a fixed top note as a hard candidate constraint", () => {
    const chord = parsed("Dmaj7");
    const candidates = generateStudyCandidates(chord, "teacher", context, spans);
    const firstNotes = candidates[0]?.candidate.allNotes;
    const fixedMelodyMidiNote = firstNotes?.[firstNotes.length - 1];
    expect(fixedMelodyMidiNote).toBeDefined();
    const fixed = generateStudyCandidates(chord, "teacher", {
      bass: "self-played",
      top: "fixed-melody",
      fixedMelodyMidiNote,
    }, spans);
    expect(fixed.length).toBeGreaterThan(0);
    expect(fixed.every(({ candidate, rule }) => (
      candidate.allNotes[candidate.allNotes.length - 1] === fixedMelodyMidiNote
      && rule.topRole === "fixed-melody"
    ))).toBe(true);
  });
});

function snapshot(
  labels: readonly string[],
  selection: "basic-full" | "source-midi" | "custom" = "basic-full",
  exactNotes?: readonly number[],
): ProgressionVoicingPracticeSnapshot {
  return {
    version: 1,
    fingerprint: "p533-study-generator",
    source: { kind: "vault", reference: { ideaId: "fixture", blockId: "study-generator" } },
    selection,
    key: "D major",
    bpm: 100,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: labels.length * 4,
    events: labels.map((label, index) => ({
      id: "event-" + (index + 1), startBeat: index * 4, durationBeats: 4, chord: parsed(label),
      ...(exactNotes ? { voicing: { kind: selection as "source-midi" | "custom", midiNotes: [...exactNotes], bassNote: exactNotes[0] } } : {}),
    })),
    spans: labels.map((_, eventIndex) => ({ kind: "chord", startBeat: eventIndex * 4, durationBeats: 4, eventIndex })),
  };
}

function parsed(label: string): ChordSymbol {
  const chord = parseChordLabel(label);
  if (!chord) throw new Error("fixture did not parse: " + label);
  return chord;
}

function handSpan(notes: readonly number[]): number {
  return notes.length < 2 ? 0 : notes[notes.length - 1]! - notes[0]!;
}
