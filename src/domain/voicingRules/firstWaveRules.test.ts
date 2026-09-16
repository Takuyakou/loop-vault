import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordSymbol } from "../types";
import {
  resolveProgressionPracticeVoicings,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingSelection,
} from "../progressionVoicingPractice";
import { generateFirstWaveCandidates, firstWaveRuleDefinitions } from "./firstWaveRules";

const spans = { maxLeftHandSpanSemitones: 12, maxRightHandSpanSemitones: 12 };
const selfPlayed = { bass: "self-played", top: "normal-voicing-top" } as const;

describe("P5.33 first-wave rules", () => {
  it("promotes only the audited records plus explicit legacy compatibility rules", () => {
    const ids = firstWaveRuleDefinitions().map(({ id }) => id);
    expect(ids.filter((id) => id.startsWith("V"))).toEqual([
      "V01", "V03", "V04", "V06", "V15", "V16", "V17", "V20", "V21",
      "V22", "V23", "V24", "V25", "V26", "V29", "V30", "V31", "V32", "V33",
    ]);
    expect(ids.filter((id) => id.startsWith("P5.31-"))).toHaveLength(4);
  });

  it.each([
    ["Eadd9/F#", "P5.33-GEN-CORE-ADD9", "literal", ["9", "1", "3", "5"], []],
    ["Dadd9/E", "P5.33-GEN-CORE-ADD9", "literal", ["9", "1", "3", "5"], []],
    ["Am9/C", "P5.33-GEN-CORE-MIN9", "literal", ["b3", "1", "9", "5", "b7"], []],
    ["Am11/B", "P5.33-GEN-CORE-MIN11", "literal", ["9", "1", "b3", "11", "5", "b7"], []],
    ["Bm7b5", "P5.33-GEN-CORE-MIN7B5", "literal", ["1", "b7", "b3", "b5"], []],
    ["Cdim7", "P5.33-GEN-CORE-DIM7", "literal", ["1", "b3", "b5", "bb7"], []],
    ["C6/9", "P5.33-GEN-CORE-SIXNINE", "performance-reduction", ["1", "6", "9", "3"], ["5"]],
    ["G7sus4", "P5.33-GEN-CORE-DOM7SUS4", "literal", ["1", "b7", "4", "5"], []],
  ] as const)("resolves %s with explicit harmonic accounting", (label, ruleId, coverage, expectedDegrees, omitted) => {
    const resolution = resolveOne(label, "core");
    expect(resolution.status).toBe("SUPPORTED");
    if (resolution.status !== "SUPPORTED") return;
    expect(resolution.voicing.explanation).toMatchObject({
      source: "lesson-rules",
      study: "core",
      coverage,
      identity: { ruleId },
      omittedDegrees: omitted,
      addedDegrees: [],
    });
    expect(resolution.voicing.notes.map(({ degree }) => degree)).toEqual(
      expect.arrayContaining([...expectedDegrees]),
    );
  });

  it("keeps both compact reduction and full literal Gmaj9/A variants available", () => {
    const chord = parsed("Gmaj9/A");
    const candidates = generateFirstWaveCandidates(chord, "core", selfPlayed, spans);
    expect(new Set(candidates.map(({ rule }) => rule.id))).toEqual(new Set(["V25", "V26"]));
    expect(candidates.find(({ rule }) => rule.id === "V25")?.rule).toMatchObject({
      coverage: "performance-reduction",
      omittedDegrees: ["5"],
    });
    expect(candidates.find(({ rule }) => rule.id === "V26")?.rule).toMatchObject({
      coverage: "literal",
      omittedDegrees: [],
    });
  });

  it("protects characteristic tones and does not force a third into sus4", () => {
    const halfDiminished = resolveOne("Bm7b5", "core");
    const diminished = resolveOne("Cdim7", "core");
    const suspended = resolveOne("G7sus4", "core");
    expect(degrees(halfDiminished)).toContain("b5");
    expect(degrees(diminished)).toContain("bb7");
    expect(degrees(suspended)).toContain("4");
    expect(degrees(suspended)).not.toContain("3");
  });

  it("fails closed when a rule requires an external Bass context", () => {
    expect(generateFirstWaveCandidates(parsed("Cmaj7"), "open", selfPlayed, spans)).toHaveLength(0);
    const external = generateFirstWaveCandidates(
      parsed("Cmaj7"),
      "open",
      { bass: "external-bass", top: "normal-voicing-top" },
      spans,
    );
    expect(external.some(({ rule }) => rule.id === "V17")).toBe(true);
  });

  it("keeps teacher Top Candidate distinct from fixed Melody", () => {
    const resolution = resolveOne("Dm7", "teacher");
    expect(resolution.status).toBe("SUPPORTED");
    if (resolution.status !== "SUPPORTED") return;
    expect(resolution.voicing.explanation).toMatchObject({
      identity: { ruleId: "P5.33-GEN-TEACHER-MIN7" },
      topRole: "top-candidate",
      context: { top: "top-candidate" },
      provenance: { kind: "teacher-derived-generalized" },
    });
  });

  it("keeps Source MIDI exact and ignores lesson study settings", () => {
    const exact = makeSnapshot("Eadd9/F#", "source-midi", {
      kind: "source-midi",
      midiNotes: [42, 64, 68, 71],
      bassNote: 42,
    });
    const plan = resolveProgressionPracticeVoicings(exact, {
      lessonStudyCategory: "teacher",
      lessonColorEnabled: true,
    });
    expect(plan.events[0]).toMatchObject({
      status: "SUPPORTED",
      voicing: {
        midiNotes: [42, 64, 68, 71],
        bassNote: 42,
        explanation: { source: "source-midi" },
      },
    });
  });

  it("is deterministic for identical input and context", () => {
    const value = makeSnapshot("Gmaj9/A");
    const first = resolveProgressionPracticeVoicings(value, { lessonStudyCategory: "core" });
    const second = resolveProgressionPracticeVoicings(value, { lessonStudyCategory: "core" });
    expect(second).toEqual(first);
  });
});

function resolveOne(label: string, study: "teacher" | "core" | "color" | "open") {
  return resolveProgressionPracticeVoicings(makeSnapshot(label), {
    lessonStudyCategory: study === "teacher" ? "teacher" : "core",
    lessonColorEnabled: study === "color",
    lessonOpenEnabled: study === "open",
  }).events[0]!;
}

function makeSnapshot(
  label: string,
  selection: ProgressionVoicingSelection = "basic-full",
  voicing?: { kind: "source-midi" | "custom"; midiNotes: readonly number[]; bassNote?: number },
): ProgressionVoicingPracticeSnapshot {
  const chord = parsed(label);
  return {
    version: 1,
    fingerprint: "p533-first-wave",
    source: { kind: "vault", reference: { ideaId: "idea", blockId: "block" } },
    selection,
    key: "C major",
    bpm: 100,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: 4,
    events: [{
      id: "event-1",
      startBeat: 0,
      durationBeats: 4,
      chord,
      ...(voicing ? { voicing } : {}),
    }],
    spans: [{ kind: "chord", startBeat: 0, durationBeats: 4, eventIndex: 0 }],
  };
}

function parsed(label: string): ChordSymbol {
  const chord = parseChordLabel(label);
  if (!chord) throw new Error("fixture did not parse: " + label);
  return chord;
}

function degrees(resolution: ReturnType<typeof resolveOne>): readonly (string | null)[] {
  return resolution.status === "SUPPORTED"
    ? resolution.voicing.notes.map(({ degree }) => degree)
    : [];
}
