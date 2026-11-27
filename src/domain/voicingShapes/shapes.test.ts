import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import { voiceTextChordForAudition } from "../textChordTones";
import type { ChordSymbol } from "../types";
import { optimizeCandidateGroups } from "../voicingPractice/optimizeProgression";
import type { StyleVoicingCandidate } from "../voicingPractice/candidateTools";
import {
  buildShapeVoicing, chordMatchSets, DEFAULT_GENERATED_SHAPE_CHOICE, DEFAULT_GENERATED_SHAPE_OPTIONS, DEFAULT_VOICING_SHAPE_OPTIONS, notesMatchChord, optimizerCandidates, pickShapeForm,
  placementNotes, VOICING_SHAPE_IDS, type GeneratedShapeOptions, type VoicingShapeOptions,
} from ".";
import { optimizeShapeProgression } from "./optimize";
import {
  formatShapeExtractorVersion, parseShapeExtractorVersion, parseStoredShapeOptions, shapeOfLegacyLoopSelection, shapeOfLegacyTextStyle,
} from "./shapeIds";

const chord = (label: string): ChordSymbol => {
  const parsed = parseExtendedTextChordLabel(label);
  if (!parsed) throw new Error(`cannot parse ${label}`);
  return parsed;
};
const opts = (patch: Partial<VoicingShapeOptions>): VoicingShapeOptions => ({ ...DEFAULT_VOICING_SHAPE_OPTIONS, ...patch });
const pcs = (notes: readonly number[]): Set<number> => new Set(notes.map((n) => ((n % 12) + 12) % 12));

describe("P25-02 K4: when no shape can be made", () => {
  it("plays today's text audition sound for a chord outside the table and never throws", () => {
    const c = chord("C7(b9,#9,#11,b13)");
    for (const shape of VOICING_SHAPE_IDS) {
      const result = buildShapeVoicing(c, opts({ shape }));
      expect(result.used).toBe("legacy");
      expect(result.fellBack).toBe(true);
      expect(result.forms).toHaveLength(1);
      expect(placementNotes(result.forms[0]!.staticChoice)).toEqual([...voiceTextChordForAudition(c)].sort((a, b) => a - b));
    }
  });

  it("uses ① for slash chords and marks the fall back", () => {
    expect(buildShapeVoicing(chord("C/E"), opts({ shape: "rootless" })).used).toBe("shell");
    const triad = buildShapeVoicing(chord("C/E"), opts({ shape: "triad" }));
    expect(triad.used).toBe("shell+tension+spread");
    expect(triad.fellBack).toBe(true);
  });
});

describe("P25-02 K5: テンションを足す", () => {
  it("adds the first safe colour only when nothing is written", () => {
    expect(buildShapeVoicing(chord("Cmaj7"), opts({ tension: true })).addedTension).toBe("9");
    expect(buildShapeVoicing(chord("Cm7b5"), opts({ tension: true })).addedTension).toBe("11");
    expect(buildShapeVoicing(chord("Cmaj9"), opts({ tension: true })).addedTension).toBeUndefined();
    expect(buildShapeVoicing(chord("Cmaj7"), opts({})).addedTension).toBeUndefined();
  });
});

describe("P25-02 K10: written omissions", () => {
  it.each([["Dm11(omit3)", "3"], ["Cm7(omit5)", "5"]] as const)("%s keeps the omitted degree out", (label, omitted) => {
    const c = chord(label);
    expect(c.omissions).toContain(omitted);
    for (const shape of VOICING_SHAPE_IDS) {
      const result = buildShapeVoicing(c, opts({ shape }));
      expect(result.used).toBe("close");
      expect(result.fellBack).toBe(true);
      expect(result.forms).toHaveLength(1);
      const sounding = pcs(placementNotes(result.forms[0]!.staticChoice));
      const offset = omitted === "3" ? 3 : 7;
      expect(sounding.has((c.root + offset) % 12)).toBe(false);
    }
  });
});

describe("P25-02 K9-1: chordMatchSets", () => {
  it("C5 needs both the root and the fifth", () => {
    const sets = chordMatchSets(chord("C5"));
    expect(notesMatchChord(sets, [48])).toBe(false);
    expect(notesMatchChord(sets, [55])).toBe(false);
    expect(notesMatchChord(sets, [48, 60])).toBe(false);
    expect(notesMatchChord(sets, [48, 55])).toBe(true);
  });

  it("C7alt/G includes the bass and checks it is lowest", () => {
    const c = chord("C7alt/G");
    const sets = chordMatchSets(c);
    expect(sets.bass).toBe(7);
    expect(sets.required.has(7)).toBe(true);
    expect(sets.allowed.has(7)).toBe(true);
    // G E B♭ E♭(♯9): bass lowest, 3 and ♭7 and one altered tone.
    expect(notesMatchChord(sets, [43, 52, 58, 63])).toBe(true);
    expect(notesMatchChord(sets, [52, 55, 58, 63])).toBe(false);
    // 3 and ♭7 without any altered tone is not enough.
    expect(notesMatchChord(sets, [43, 52, 58])).toBe(false);
  });

  it("removes omitted degrees from both sets", () => {
    const sets = chordMatchSets(chord("Cm7(omit5)"));
    expect(sets.required.has(7)).toBe(false);
    expect(sets.allowed.has(7)).toBe(false);
  });
});

const PROGRESSIONS = [["Dm7", "G7", "Cmaj7", "Am7", "D7", "G7"], ["Fmaj7", "Em7", "A7", "Dm7", "G7", "Cmaj7"]];
const SHAPE_OPTIONS: VoicingShapeOptions[] = [
  opts({}), opts({ tension: true }), opts({ spread: true }), opts({ tension: true, spread: true }),
  opts({ shape: "rootless" }), opts({ shape: "rootless", spread: true }), opts({ shape: "rootless", rootlessOrder: "A" }),
  opts({ shape: "rootless", rootlessOrder: "B" }), opts({ shape: "triad" }), opts({ shape: "quartal" }),
];
const key = (placement: { left: readonly number[]; right: readonly number[] }): string => `${placement.left}|${placement.right}`;

describe("P25-02 K6: なめらかにつなぐ", () => {
  it.each(PROGRESSIONS.flatMap((progression) => SHAPE_OPTIONS.map((options) => [progression.join(" "), options] as const)))(
    "%s keeps every choice inside the chord's candidates (%o)", (text, options) => {
      const results = text.split(" ").map((label) => buildShapeVoicing(chord(label), options));
      const chosen = optimizeShapeProgression(results, options.rootlessOrder);
      chosen.forEach((placement, index) => {
        expect(optimizerCandidates(results[index]!, options.rootlessOrder).map(key)).toContain(key(placement));
      });
    });

  it("a ② progression mixed with a ① fall back stays within an octave of the static choice", () => {
    const results = ["Cmaj7", "C", "Dm7", "G7"].map((label) => buildShapeVoicing(chord(label), opts({ shape: "rootless" })));
    expect(results[1]!.used).toBe("shell");
    const chosen = optimizeShapeProgression(results, "auto");
    chosen.forEach((placement, index) => {
      const staticNotes = placementNotes(pickShapeForm(results[index]!, "auto")!.staticChoice);
      const notes = placementNotes(placement);
      const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      expect(Math.abs(mean(notes) - mean(staticNotes))).toBeLessThanOrEqual(12);
    });
  });

  it("K's costs change the choice: | D♭maj7 | E | with ② (E falls back to ①) — today's cost pulls D♭maj7 down, K keeps the K3 height", () => {
    const results = ["Dbmaj7", "E"].map((label) => buildShapeVoicing(chord(label), opts({ shape: "rootless" })));
    expect(results[1]!.used).toBe("shell");
    const groups: StyleVoicingCandidate[][] = results.map((result) => optimizerCandidates(result, "auto").map((placement) => ({
      styleId: "lesson-v2", leftHandNotes: [...placement.left], rightHandNotes: [...placement.right], allNotes: placementNotes(placement),
      requiredIntervals: [], addedColorIntervals: [], omittedIntervals: [], warnings: [],
    })));
    expect(optimizeCandidateGroups(groups).map((candidate) => candidate.allNotes)).toEqual([[48, 51, 53, 56], [52, 56, 59]]);
    const withK = optimizeShapeProgression(results, "auto").map(placementNotes);
    expect(withK).toEqual([[53, 56, 60, 63], [52, 56, 59]]);
    expect(withK[0]).toEqual(placementNotes(pickShapeForm(results[0]!, "auto")!.staticChoice));
  });
});

describe("P25-02 K7: reading today's ids", () => {
  it("writes and reads the new snapshot id", () => {
    expect(formatShapeExtractorVersion(opts({ shape: "rootless", spread: true }), "B")).toBe("text-shape-v1:rootless+spread:B");
    expect(formatShapeExtractorVersion(opts({ tension: true }))).toBe("text-shape-v1:shell+tension");
    expect(parseShapeExtractorVersion("text-shape-v1:rootless+spread:B")).toEqual(opts({ shape: "rootless", spread: true, rootlessOrder: "B" }));
    expect(parseShapeExtractorVersion("text-shape-v1:shell+tension+spread")).toEqual(opts({ tension: true, spread: true }));
    expect(parseShapeExtractorVersion("text-style-v1:shell-17")).toBeUndefined();
    expect(parseShapeExtractorVersion("text-shape-v1:open")).toBeUndefined();
  });

  it("reads the four legacy text styles (generated-close = 基本)", () => {
    const c = chord("Cmaj7");
    const g = (patch: Partial<GeneratedShapeOptions>): GeneratedShapeOptions => ({ ...DEFAULT_GENERATED_SHAPE_OPTIONS, ...patch });
    expect(shapeOfLegacyTextStyle("generated-close", c, [48, 64, 67, 71])).toEqual(g({}));
    expect(shapeOfLegacyTextStyle("shell-17", c, [])).toEqual(g({ shape: "shell" }));
    expect(shapeOfLegacyTextStyle("open-17", c, [])).toEqual(g({ shape: "shell", spread: true }));
    expect(shapeOfLegacyTextStyle("rootless-ab", c, [52, 55, 59, 62])).toEqual(g({ shape: "rootless", rootlessOrder: "A" }));
    expect(shapeOfLegacyTextStyle("rootless-ab", c, [47, 50, 52, 55])).toEqual(g({ shape: "rootless", rootlessOrder: "B" }));
    expect(shapeOfLegacyTextStyle("rootless-ab", c, [48, 55])).toEqual(g({ shape: "rootless", rootlessOrder: "auto" }));
  });

  it("reads the five legacy Voicing Loop selections and Color / Open on 基本", () => {
    const g = (patch: Partial<GeneratedShapeOptions>): GeneratedShapeOptions => ({ ...DEFAULT_GENERATED_SHAPE_OPTIONS, ...patch });
    expect(shapeOfLegacyLoopSelection("basic-full")).toEqual(g({}));
    expect(shapeOfLegacyLoopSelection("basic-full", { color: true, open: true })).toEqual(g({ tension: true, spread: true }));
    expect(shapeOfLegacyLoopSelection("basic-full", { color: true })).toEqual(g({ tension: true }));
    expect(shapeOfLegacyLoopSelection("basic-shell")).toEqual(g({ shape: "shell" }));
    expect(shapeOfLegacyLoopSelection("full-shell")).toEqual(g({ shape: "shell", tension: true }));
    expect(shapeOfLegacyLoopSelection("rootless-shell")).toEqual(g({ shape: "rootless" }));
    expect(shapeOfLegacyLoopSelection("left-hand", { leftHandForm: "B" })).toEqual(g({ shape: "rootless", rootlessOrder: "B" }));
  });

  it("reads the stored shape options and falls back to 基本", () => {
    expect(parseStoredShapeOptions(JSON.stringify({ shape: "quartal", tension: false, spread: false, rootlessOrder: "auto" }))).toEqual({ ...DEFAULT_GENERATED_SHAPE_OPTIONS, shape: "quartal" });
    expect(parseStoredShapeOptions(JSON.stringify({ shape: "basic", tension: true, spread: true, rootlessOrder: "auto" }))).toEqual({ ...DEFAULT_GENERATED_SHAPE_OPTIONS, tension: true, spread: true });
    expect(parseStoredShapeOptions("{bad")).toEqual(DEFAULT_GENERATED_SHAPE_OPTIONS);
    expect(parseStoredShapeOptions(JSON.stringify({ shape: "open-17" }))).toEqual(DEFAULT_GENERATED_SHAPE_OPTIONS);
    expect(parseStoredShapeOptions(null)).toEqual(DEFAULT_GENERATED_SHAPE_OPTIONS);
    expect(DEFAULT_GENERATED_SHAPE_CHOICE).toBe("basic");
  });
});
