/**
 * P25-08 K11 / K12 / K9-5: Voicing Loop's 基本 with parts, 基本's filled cards, and alt only through the K shapes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChordSymbol } from "../types";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import { resolveProgressionPracticeVoicings, type ResolveProgressionPracticeVoicingsOptions } from "../progressionVoicingPractice/voicingResolution";
import type { ProgressionVoicingPracticeSnapshot } from "../progressionVoicingPractice/types";
import { textProgressionVoicingNotes } from "../textProgressionVoicing";
import { supportsLegacyGeneratedChord, supportsTextChord } from "../textChordConsumerCapabilities";
import { generateStudyCandidates } from "../voicingRules";
import { buildShapeVoicing, DEFAULT_VOICING_SHAPE_OPTIONS, recChordOf } from ".";
import { addedTensionDegree, buildBasicWithParts } from "./basicParts";
import { recipe, SEMI } from "./recipe";

interface GoldenCase { root: number; label: string; quality: ChordSymbol["quality"]; tensions: ChordSymbol["tensions"]; altered: boolean; bass: number | null }
const golden = JSON.parse(readFileSync(resolve(process.cwd(), "docs/contracts/voicing-shapes-p26/golden.json"), "utf8")) as { cases: GoldenCase[] };
const CHORDS: ChordSymbol[] = [...new Map(golden.cases.map((entry) => [`${entry.root}:${entry.label}`, entry])).values()].map((entry) => ({
  root: entry.root, quality: entry.quality, tensions: [...entry.tensions], label: entry.label,
  ...(entry.altered ? { altered: true as const } : {}),
  ...(entry.bass === null ? {} : { bass: entry.bass }),
}));

const pc = (note: number) => ((note % 12) + 12) % 12;

function snapshotOf(chords: readonly ChordSymbol[], text: boolean): ProgressionVoicingPracticeSnapshot {
  return {
    version: 1, fingerprint: "k12", source: { kind: "vault", reference: { ideaId: "i", blockId: "b" } }, selection: "basic-full", bpm: 100,
    meter: { numerator: 4, denominator: 4 }, lengthBeats: chords.length * 4,
    spans: chords.map((_, eventIndex) => ({ kind: "chord" as const, eventIndex, startBeat: eventIndex * 4, durationBeats: 4 })),
    events: chords.map((chord, index) => ({
      id: `e${index}`, startBeat: index * 4, durationBeats: 4,
      chord: { root: chord.root, quality: chord.quality, tensions: [...chord.tensions], label: chord.label,
        ...(chord.altered ? { altered: true as const } : {}), ...(chord.bass === undefined ? {} : { bass: chord.bass }) },
    })),
    ...(text ? { textDerivedPolicyId: "text-defining-basic-full-v1" as const } : {}),
  } as ProgressionVoicingPracticeSnapshot;
}

function resolveOne(chord: ChordSymbol, options: ResolveProgressionPracticeVoicingsOptions, text = false) {
  return resolveProgressionPracticeVoicings(snapshotOf([chord], text), options).events[0]!;
}

/** Today's numbers, read without K12 (a plan of the old rules: no `generatedShape`, no fill happens for other selections). */
function todayStatus(chord: ChordSymbol, text: boolean): string {
  // The same rules with the K12 fill turned off: `basic-shell` shares nothing, so read the fill marker instead.
  const resolution = resolveOne(chord, {}, text);
  return resolution.status === "SUPPORTED" && resolution.autoFallbackTitle?.includes("基本では作れない") ? "UNSUPPORTED_RULE" : resolution.status;
}

describe("P25-08 K12: 基本 cards today's rules cannot make", () => {
  for (const text of [false, true]) {
    it(`${text ? "text-made" : "other"} progressions: today's counts, the filled notes, and no unusable card`, () => {
      const counts: Record<string, number> = {};
      const wrongFill: string[] = [];
      for (const chord of CHORDS) {
        const status = todayStatus(chord, text);
        counts[status] = (counts[status] ?? 0) + 1;
        const resolution = resolveOne(chord, {}, text);
        expect(resolution.status).toBe("SUPPORTED");
        if (status === "UNSUPPORTED_RULE" && resolution.status === "SUPPORTED"
          && JSON.stringify(resolution.voicing.midiNotes) !== JSON.stringify(textProgressionVoicingNotes(chord, "generated-close"))) wrongFill.push(chord.label);
      }
      expect(counts).toEqual(text ? { SUPPORTED: 528, UNSUPPORTED_RULE: 12 } : { SUPPORTED: 336, UNSUPPORTED_RULE: 204 });
      expect(wrongFill).toEqual([]);
    });
  }

  it("fills G7alt in a MIDI-made | Cmaj7 | Am7 | Dm7 | G7alt | and keeps the other three", () => {
    const chords = ["Cmaj7", "Am7", "Dm7", "G7alt"].map((label) => parseExtendedTextChordLabel(label)!);
    const before = resolveProgressionPracticeVoicings(snapshotOf(chords.slice(0, 3), false), { lessonStudyCategory: "teacher" });
    const plan = resolveProgressionPracticeVoicings(snapshotOf(chords, false), { lessonStudyCategory: "teacher" });
    expect(plan.events.every((event) => event.status === "SUPPORTED")).toBe(true);
    const last = plan.events[3]!;
    expect(last.status === "SUPPORTED" && last.autoFallbackTitle).toBe("このコードは基本では作れないので、テキスト取り込みのおすすめの音で鳴らしています");
    expect(last.status === "SUPPORTED" && [...last.voicing.midiNotes]).toEqual(textProgressionVoicingNotes(chords[3]!, "generated-close"));
    // The optimizer chooses the three cards as today (the filled card does not move them).
    const notes = (events: typeof plan.events) => events.slice(0, 3).map((event) => event.status === "SUPPORTED" ? event.voicing.midiNotes : []);
    expect(notes(plan.events)).toEqual(notes(before.events));
  });
});

describe("P25-08 K9-5: alt is made only by the K shapes", () => {
  const alt = parseExtendedTextChordLabel("G7alt")!;
  it("today's generators keep answering 「cannot make」 for alt", () => {
    expect(supportsTextChord("generated-loop", alt)).toBe(true);
    expect(supportsLegacyGeneratedChord(alt)).toBe(false);
    expect(textProgressionVoicingNotes(alt, "shell-17")).toBeUndefined();
    expect(generateStudyCandidates(alt, "teacher", { bass: "self-played", top: "normal-voicing-top" }, { maxLeftHandSpanSemitones: 12, maxRightHandSpanSemitones: 12, modifiers: { color: false, open: false } })).toEqual([]);
    const raw = resolveProgressionPracticeVoicings({ ...snapshotOf([alt], false), selection: "basic-shell" });
    expect(raw.events[0]!.status).toBe("UNSUPPORTED_RULE");
  });
  it("the K shapes make G7alt", () => {
    const built = buildShapeVoicing(alt, DEFAULT_VOICING_SHAPE_OPTIONS);
    expect(built.used).toBe("shell");
    const resolution = resolveOne(alt, { lessonStudyCategory: "teacher", generatedShape: { ...DEFAULT_VOICING_SHAPE_OPTIONS } });
    expect(resolution.status).toBe("SUPPORTED");
  });
});

describe("P25-08 K11: 基本 + parts on the 540 chords", () => {
  const basicOf = (chord: ChordSymbol) => {
    const resolution = resolveOne(chord, { lessonStudyCategory: "teacher", lessonProgressionOptimization: false, generatedShape: { shape: "basic", tension: false, spread: false, rootlessOrder: "auto" } });
    if (resolution.status !== "SUPPORTED") throw new Error(`no 基本 for ${chord.label}`);
    return { left: [...(resolution.voicing.leftHandNotes ?? [])], right: [...(resolution.voicing.rightHandNotes ?? [])] };
  };

  it("has a 基本 for every chord (no chord where the parts cannot work)", () => {
    expect(CHORDS.filter((chord) => { try { basicOf(chord); return false; } catch { return true; } }).map((chord) => chord.label)).toEqual([]);
  });

  it("テンションを足す: K5's note, one note added, nothing else moved; 入り済み / なし change nothing", () => {
    const problems: string[] = [];
    for (const chord of CHORDS) {
      const basic = basicOf(chord);
      const all = [...basic.left, ...basic.right];
      const result = buildBasicWithParts(chord, basic, { tension: true, spread: false });
      const degree = addedTensionDegree(chord);
      if (result.addedTension === undefined) {
        if (JSON.stringify([result.left, result.right]) !== JSON.stringify([basic.left, basic.right])) problems.push(`moved ${chord.label}`);
        if (degree !== undefined && !all.some((note) => pc(note) === pc(chord.root + SEMI[degree]!))) problems.push(`missing ${chord.label}`);
        continue;
      }
      if (result.addedTension !== degree) problems.push(`degree ${chord.label}`);
      const added = result.right.filter((note) => !basic.right.includes(note));
      if (added.length !== 1 || pc(added[0]!) !== pc(chord.root + SEMI[degree!]!) || JSON.stringify(result.left) !== JSON.stringify(basic.left)) problems.push(`notes ${chord.label}`);
      const note = added[0]!;
      const clear = (height: number) => all.every((other) => Math.abs(other - height) !== 1);
      const anyClear = [...Array(37).keys()].map((i) => 52 + i).some((height) => pc(height) === pc(note) && clear(height));
      if (anyClear && !clear(note)) problems.push(`semitone ${chord.label}`);
    }
    expect(problems).toEqual([]);
  });

  it("広げる: ①'s left degrees, the right without the left's names, all above the left, all 36–88; slash chords unchanged", () => {
    const problems: string[] = [];
    for (const chord of CHORDS) {
      const basic = basicOf(chord);
      const result = buildBasicWithParts(chord, basic, { tension: false, spread: true });
      if (chord.bass !== undefined && pc(chord.bass) !== pc(chord.root)) {
        if (JSON.stringify([result.left, result.right]) !== JSON.stringify([basic.left, basic.right])) problems.push(`slash ${chord.label}`);
        continue;
      }
      let upper = "5";
      try { const left = recipe(recChordOf(chord), "shell", false, true).L; if (left.length === 2) upper = left[1]!; } catch { /* R・5 */ }
      if (result.left.length !== 2 || pc(result.left[0]!) !== pc(chord.root) || result.left[1]! - result.left[0]! !== SEMI[upper]) problems.push(`left ${chord.label}`);
      const leftNames = new Set(result.left.map(pc));
      const expected = new Set(basic.right.map(pc).filter((value) => !leftNames.has(value)));
      const names = expected.size > 0 ? expected : new Set(basic.right.map(pc));
      const got = new Set(result.right.map(pc));
      if ([...got].some((value) => !names.has(value)) || got.size > names.size) problems.push(`right ${chord.label}`);
      if (result.right.some((note) => note <= Math.max(...result.left))) problems.push(`order ${chord.label}`);
      if ([...result.left, ...result.right].some((note) => note < 36 || note > 88)) problems.push(`range ${chord.label}`);
    }
    expect(problems).toEqual([]);
  });

  it("the design's example: Cmaj7 C3 / E4 G4 B4 → C3 G3 / E4 B4; no parts gives 基本 back", () => {
    const chord = parseExtendedTextChordLabel("Cmaj7")!;
    const basic = { left: [48], right: [64, 67, 71] };
    expect(buildBasicWithParts(chord, basic, { tension: false, spread: true })).toMatchObject({ left: [48, 55], right: [64, 71], used: "basic+spread" });
    expect(buildBasicWithParts(chord, basic, { tension: false, spread: false })).toMatchObject({ left: [48], right: [64, 67, 71], used: "basic" });
    expect(buildBasicWithParts(chord, basic, { tension: true, spread: true }).used).toBe("basic+tension+spread");
  });
});
