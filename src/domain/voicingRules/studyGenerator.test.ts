import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import {
  resolveProgressionPracticeVoicings,
  type ProgressionVoicingPracticeSnapshot,
} from "../progressionVoicingPractice";
import type { ChordSymbol } from "../types";
import { pitchClass } from "../voicingPractice/candidateTools";
import { generateStudyCandidates } from "./studyGenerator";
import type { VoicingStudyCategory } from "./types";

const spans = { maxLeftHandSpanSemitones: 12, maxRightHandSpanSemitones: 12 };
const context = { bass: "self-played", top: "normal-voicing-top" } as const;
const acceptanceLabels = [
  "Dmaj7",
  "Dm7",
  "C#m7",
  "Eadd9/F#",
  "C7",
  "Bm7",
  "Dadd9/E",
  "Gmaj9/A",
] as const;
const studies = ["teacher", "core", "color", "open"] as const satisfies readonly VoicingStudyCategory[];

describe("P5.33 generalized study generator", () => {
  it.each(studies)("%s resolves the full eight-chord acceptance progression", (study) => {
    const plan = resolveProgressionPracticeVoicings(snapshot(acceptanceLabels), {
      lessonStudyCategory: study,
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
        voicing: {
          explanation: {
            study: "teacher",
            identity: { family: "teacher-style" },
            provenance: { kind: "teacher-derived-generalized" },
            topRole: "top-candidate",
          },
        },
      });
    }
  });

  it("marks family-safe Color additions as Creative Enrichment", () => {
    const plan = resolveProgressionPracticeVoicings(snapshot(acceptanceLabels), {
      lessonStudyCategory: "color",
    });
    for (const event of plan.events) {
      expect(event.status).toBe("SUPPORTED");
      if (event.status !== "SUPPORTED") continue;
      expect(event.voicing.explanation).toMatchObject({
        study: "color",
        coverage: "creative-enrichment",
        identity: { family: "family-color" },
      });
      expect(event.voicing.explanation?.addedDegrees.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["C/E", ["3"], ["1", "5"]],
    ["Eadd9/F#", ["9"], ["1", "3", "5"]],
    ["Dadd9/E", ["9"], ["1", "3", "5"]],
    ["Am9/C", ["b3"], ["1", "5", "b7", "9"]],
    ["Am11/B", ["9"], ["1", "b3", "b7", "11"]],
  ] as const)("generates slash semantics for %s without changing the upper root basis", (
    label,
    expectedLeft,
    expectedRight,
  ) => {
    const candidates = generateStudyCandidates(parsed(label), "teacher", context, spans);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(({ rule }) => (
      expectedLeft.every((degree) => rule.leftDegrees.includes(degree))
      && expectedRight.every((degree) => rule.rightDegrees.includes(degree))
    ))).toBe(true);
  });

  it("keeps Compact and Full Gmaj9/A candidates with honest coverage", () => {
    const candidates = generateStudyCandidates(parsed("Gmaj9/A"), "core", context, spans);
    expect(candidates.some(({ rule }) => (
      rule.variantId === "core"
      && rule.coverage === "performance-reduction"
      && rule.omittedDegrees.includes("5")
    ))).toBe(true);
    expect(candidates.some(({ rule }) => (
      rule.variantId === "core-literal"
      && rule.coverage === "literal"
      && rule.omittedDegrees.length === 0
    ))).toBe(true);
  });

  it.each([
    ["Bm7b5", ["b3", "b5", "b7"], []],
    ["Cdim7", ["b3", "b5", "bb7"], []],
    ["G7sus4", ["4", "b7"], ["3"]],
    ["C6/9", ["3", "6", "9"], ["7"]],
  ] as const)("preserves characteristic degrees for %s", (label, required, forbidden) => {
    const plan = resolveProgressionPracticeVoicings(snapshot([label]), {
      lessonStudyCategory: "core",
    });
    const event = plan.events[0]!;
    expect(event.status).toBe("SUPPORTED");
    if (event.status !== "SUPPORTED") return;
    const degrees = event.voicing.notes.map(({ degree }) => degree);
    for (const degree of required) expect(degrees).toContain(degree);
    for (const degree of forbidden) expect(degrees).not.toContain(degree);
  });

  it.each([
    "C",
    "Cm",
    "Cmaj7",
    "Cm7",
    "Cm9",
    "Cm11",
    "C7",
    "C9",
    "C13",
    "Cadd9",
    "C6",
    "C6/9",
    "Csus4",
    "Cm7b5",
    "Cdim7",
    "C/E",
    "Cadd9/D",
  ])("supports ordinary family %s in every study", (label) => {
    const chord = parsed(label);
    for (const study of studies) {
      expect(generateStudyCandidates(chord, study, context, spans).length, study)
        .toBeGreaterThan(0);
    }
  });

  it("preserves exact Source MIDI and Custom independently from Study", () => {
    for (const selection of ["source-midi", "custom"] as const) {
      const value = snapshot(["Eadd9/F#"], selection, [42, 64, 68, 71]);
      for (const study of studies) {
        const event = resolveProgressionPracticeVoicings(value, {
          lessonStudyCategory: study,
        }).events[0]!;
        expect(event).toMatchObject({
          status: "SUPPORTED",
          voicing: {
            midiNotes: [42, 64, 68, 71],
            bassNote: 42,
            explanation: { source: selection },
          },
        });
      }
    }
  });

  it("is deterministic and ranks the last-to-first loop without changing valid harmony", () => {
    const value = snapshot(acceptanceLabels);
    for (const study of studies) {
      const first = resolveProgressionPracticeVoicings(value, { lessonStudyCategory: study });
      const second = resolveProgressionPracticeVoicings(value, { lessonStudyCategory: study });
      expect(second).toEqual(first);
      expect(first.events.every(({ status }) => status === "SUPPORTED")).toBe(true);
    }
  });

  it("fails closed when bounded hand spans cannot place the requested family", () => {
    const event = resolveProgressionPracticeVoicings(snapshot(["Dmaj7"]), {
      lessonStudyCategory: "teacher",
      maxLeftHandSpanSemitones: 0,
      maxRightHandSpanSemitones: 0,
    }).events[0]!;
    expect(event).toMatchObject({
      status: "UNSUPPORTED_RULE",
      reason: "no-approved-lesson-rule",
    });
  });

  it("keeps slash bass fixed while Open spreads only the upper voices", () => {
    const chord = parsed("Eadd9/F#");
    const candidates = generateStudyCandidates(chord, "open", context, spans);
    const teacherCandidates = generateStudyCandidates(chord, "teacher", context, spans);
    expect(candidates.length).toBeGreaterThan(0);
    expect(Math.min(...candidates.map(({ candidate }) => handSpan(candidate.rightHandNotes))))
      .toBeGreaterThan(Math.min(...teacherCandidates.map(({ candidate }) => handSpan(candidate.rightHandNotes))));
    for (const { candidate, rule } of candidates) {
      expect(candidate.leftHandNotes).toHaveLength(1);
      expect(pitchClass(candidate.leftHandNotes[0]!)).toBe(pitchClass(chord.bass!));
      expect(rule.leftDegrees).toEqual(["9"]);
      expect(Math.max(...candidate.allNotes) - Math.min(...candidate.allNotes)).toBeGreaterThanOrEqual(24);
    }
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
      id: "event-" + (index + 1),
      startBeat: index * 4,
      durationBeats: 4,
      chord: parsed(label),
      ...(exactNotes ? {
        voicing: {
          kind: selection as "source-midi" | "custom",
          midiNotes: [...exactNotes],
          bassNote: exactNotes[0],
        },
      } : {}),
    })),
    spans: labels.map((_, eventIndex) => ({
      kind: "chord",
      startBeat: eventIndex * 4,
      durationBeats: 4,
      eventIndex,
    })),
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
