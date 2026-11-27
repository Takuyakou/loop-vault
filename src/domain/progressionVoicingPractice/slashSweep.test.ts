// V11b: every slash chord through the real Voicing Loop path, checked against the slash-bass rules
// (the bottom is the bass / no semitone right above it / no bass pitch class above / a minor 9th against
// the bass only at 25 semitones or more / one-note left hand: hands at most 24 apart, else 12).
import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "../extendedTextProgression";
import { extendedTextSaveData } from "../extendedTextSave";
import { labelFromSymbol } from "../chords";
import type { ChordQuality, ChordSymbol, SavedProgressionBlock, Tension } from "../types";
import { buildProgressionVoicingPracticeSnapshot } from "./snapshot";
import { resolveProgressionPracticeVoicings, type ResolveProgressionPracticeVoicingsOptions } from "./voicingResolution";

type Kind = { readonly quality: ChordQuality; readonly tensions: readonly Tension[]; readonly altered?: true };
const PLAIN: Kind[] = ([
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7", "maj9", "min9", "dom9", "min11", "dom13",
  "sus2", "sus4", "dom7sus4", "add9", "add13", "six", "min6", "sixNine", "minMaj7", "dom11", "power",
] as const).map((quality) => ({ quality, tensions: [] }));
const WITH_TENSIONS: Kind[] = [
  { quality: "dom7", tensions: ["b9"] }, { quality: "dom7", tensions: ["#9"] }, { quality: "dom7", tensions: ["#11"] },
  { quality: "dom7", tensions: ["b13"] }, { quality: "dom7", tensions: ["b9", "b13"] }, { quality: "dom7", tensions: ["#5"] },
  { quality: "dom7", tensions: [], altered: true }, { quality: "dom9", tensions: ["#11"] }, { quality: "dom13", tensions: ["b9"] },
  { quality: "maj7", tensions: ["#11"] }, { quality: "min7", tensions: ["11"] }, { quality: "min7b5", tensions: ["9"] },
];
const SHAPES = ["basic", "shell", "rootless", "triad", "quartal"] as const;
const PARTS = [[false, false], [true, false], [false, true], [true, true]] as const;
const CONTEXT = { bass: "self-played", top: "normal-voicing-top" } as const;

function labelOf(kind: Kind, root: number, bass: number): string {
  const symbol: ChordSymbol = { root, quality: kind.quality, tensions: [...kind.tensions], bass, label: "", ...(kind.altered ? { altered: true as const } : {}) };
  return labelFromSymbol(symbol);
}

function snapshotFor(labels: readonly string[], textDerived: boolean) {
  const parsed = parseExtendedTextProgression(`| ${labels.join(" | ")} |`);
  if (!parsed.canConvert) return undefined;
  const data = extendedTextSaveData(parsed);
  const bars = labels.length;
  const block: SavedProgressionBlock = {
    id: "slash", summaryText: data.summaryText, chords: [...data.chords],
    sourceStartBeat: 0, sourceEndBeat: 4 * bars, startBar: 1, endBar: bars, lengthBars: bars,
    bpm: 120, timeSignature: "4/4", tags: [], capturedAt: "2000-01-01T00:00:00.000Z",
    analyzerVersion: textDerived ? "text-progression-v1" : "test-midi",
    ...(textDerived ? { textSource: data.textSource } : {}),
  };
  const built = buildProgressionVoicingPracticeSnapshot({ sourceReference: { ideaId: "t", blockId: "slash" }, block, selection: "basic-full" });
  return built.ok ? built.snapshot : undefined;
}

/** The Voicing Loop call (ProgressionVoicingPracticeView): teacher rules, the chosen 形 and parts. */
function loopOptions(shape: (typeof SHAPES)[number], tension: boolean, spread: boolean, optimize = true, rootlessOrder: "auto" | "A" | "B" = "auto"): ResolveProgressionPracticeVoicingsOptions {
  return { lessonStudyCategory: "teacher", generatedShape: { shape, tension, spread, rootlessOrder }, lessonProgressionOptimization: optimize, lessonContext: CONTEXT };
}

function checkPlan(snapshot: NonNullable<ReturnType<typeof snapshotFor>>, options: ResolveProgressionPracticeVoicingsOptions | undefined, tag: string, errors: string[]): void {
  // The Voicing Loop call keeps P26's "no bass pitch class above"; the older 基本 tables (no options) keep the bass's chord tone above it (P5.27).
  const loop = options?.lessonStudyCategory !== undefined;
  const plan = resolveProgressionPracticeVoicings(snapshot, options);
  plan.events.forEach((event, index) => {
    const chord = snapshot.events[index]!.chord;
    const where0 = `${tag} #${index + 1} ${chord.label}`;
    if (event.status !== "SUPPORTED") { errors.push(`${where0}: ${event.status}`); return; }
    if (chord.bass === undefined || (chord.bass - chord.root) % 12 === 0) return;
    const bass = ((chord.bass % 12) + 12) % 12;
    const v = event.voicing;
    const left = [...(v.leftHandNotes ?? [])]; const right = [...(v.rightHandNotes ?? [])];
    const notes = [...new Set([...v.midiNotes, ...(v.bassNote === undefined ? [] : [v.bassNote]), ...left, ...right])].sort((a, b) => a - b);
    const low = notes[0]!; const where = `${where0} L${JSON.stringify(left)} R${JSON.stringify(right)}`;
    if (low % 12 !== bass) errors.push(`一番下が分数のベースでない: ${where}`);
    if (notes[1]! - low === 1) errors.push(`ベースのすぐ上が半音: ${where}`);
    if (loop && notes.slice(1).some((n) => n % 12 === bass)) errors.push(`ベースと同じ音名が上にもある: ${where}`);
    if (notes.slice(1).some((n) => (n - low) % 12 === 1 && n - low < 25)) errors.push(`ベースと短 9 度(25 半音未満): ${where}`);
    if (left.length > 0 && right.length > 0 && Math.min(...right) - Math.max(...left) > (left.length === 1 ? 24 : 12)) {
      errors.push(`両手の間が空きすぎ: ${where}`);
    }
  });
}

function eachSlash(kinds: readonly Kind[], visit: (label: string) => void): void {
  for (const kind of kinds) for (let interval = 1; interval < 12; interval += 1) for (let root = 0; root < 12; root += 1) {
    visit(labelOf(kind, root, (root + interval) % 12));
  }
}

function sweep(kinds: readonly Kind[], textDerived: boolean, optimize: boolean): string[] {
  const errors: string[] = [];
  eachSlash(kinds, (label) => {
    const snapshot = snapshotFor([label], textDerived);
    if (!snapshot) { errors.push(`${label}: no snapshot`); return; }
    for (const shape of SHAPES) for (const [tension, spread] of PARTS) {
      checkPlan(snapshot, loopOptions(shape, tension, spread, optimize), `${shape}${tension ? "+テンション" : ""}${spread ? "+広げる" : ""}`, errors);
    }
    for (const order of ["A", "B"] as const) checkPlan(snapshot, loopOptions("rootless", false, false, optimize, order), `rootless ${order}`, errors);
    // Callers without the Voicing Loop options (Chord Dojo tempo) and the text 基本 path with parts.
    checkPlan(snapshot, undefined, "no options", errors);
    for (const [tension, spread] of PARTS.slice(1)) {
      checkPlan(snapshot, { generatedShape: { shape: "basic", tension, spread, rootlessOrder: "auto" } }, `text basic ${tension ? "+テンション" : ""}${spread ? "+広げる" : ""}`, errors);
    }
  });
  return errors;
}

const report = (errors: readonly string[]) => [errors.slice(0, 20), `${errors.length} slash placements break the rules`] as const;

describe("V11b slash chords in Voicing Loop", () => {
  it("text-derived: every plain quality (power included) × bass × root × 形 × 部品", () => {
    const [head, message] = report(sweep(PLAIN, true, true));
    expect(head, message).toEqual([]);
  }, 180_000);
  it("MIDI-derived: the same", () => {
    const [head, message] = report(sweep(PLAIN, false, true));
    expect(head, message).toEqual([]);
  }, 180_000);
  it("written tensions and 7alt (C7(♭9)/G, C7alt/G, Cmaj7(♯11)/B …) × bass × root × 形 × 部品", () => {
    const [head, message] = report(sweep(WITH_TENSIONS, true, true));
    expect(head, message).toEqual([]);
  }, 180_000);
  it("なめらかにつなぐ OFF", () => {
    const [head, message] = report(sweep([...PLAIN, ...WITH_TENSIONS], true, false));
    expect(head, message).toEqual([]);
  }, 240_000);

  it("progressions: slash chords next to each other, with and without なめらかにつなぐ", () => {
    const fixed = [
      ["F#m9/G#", "Cmaj7/B", "C/Eb", "C/E"], ["Dm7/G", "G7(b9)/B", "Cmaj7/E", "Am7/D"],
      ["C/E", "F/G", "Bb/C", "Ab/Bb"], ["C7alt/Db", "Fmaj7(#11)/E", "E7/G#", "Am/G"],
    ];
    const labels: string[] = [];
    eachSlash([...PLAIN, ...WITH_TENSIONS], (label) => labels.push(label));
    let seed = 7;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    const random = Array.from({ length: 150 }, () => Array.from({ length: 4 }, () => labels[next() % labels.length]!));
    const errors: string[] = [];
    for (const progression of [...fixed, ...random]) {
      const snapshot = snapshotFor(progression, true);
      if (!snapshot) { errors.push(`${progression.join(" | ")}: no snapshot`); continue; }
      for (const optimize of [true, false]) for (const shape of SHAPES) for (const [tension, spread] of PARTS) {
        checkPlan(snapshot, loopOptions(shape, tension, spread, optimize), `${progression.join(" | ")} ${shape}${tension ? "+t" : ""}${spread ? "+s" : ""}${optimize ? "" : " off"}`, errors);
      }
    }
    const [head, message] = report(errors);
    expect(head, message).toEqual([]);
  }, 240_000);

  it("F♯m9/G♯ (V11) in every 形, and common slash chords sound as before", () => {
    const expected: Record<string, Readonly<Record<(typeof SHAPES)[number], readonly [readonly number[], readonly number[]]>>> = {
      "F#m9/G#": { basic: [[44], [64, 66, 69, 73]], shell: [[44], [64, 66, 69, 73]], rootless: [[44], [64, 66, 69, 73]], triad: [[44], [64, 66, 69, 73]], quartal: [[44], [64, 66, 69, 73]] },
      "C/E": { basic: [[52], [67, 72]], shell: [[52], [67, 72]], rootless: [[52], [67, 72]], triad: [[52], [62, 67, 72]], quartal: [[52], [62, 67, 72]] },
      "G/B": { basic: [[47], [62, 67]], shell: [[47], [62, 67]], rootless: [[47], [62, 67]], triad: [[47], [62, 67, 69]], quartal: [[47], [62, 67, 69]] },
      "D/F#": { basic: [[42], [62, 69]], shell: [[42], [62, 69]], rootless: [[42], [62, 69]], triad: [[42], [62, 64, 69]], quartal: [[42], [62, 64, 69]] },
      "F/G": { basic: [[43], [65, 69, 72]], shell: [[43], [65, 69, 72]], rootless: [[43], [65, 69, 72]], triad: [[43], [65, 69, 72]], quartal: [[43], [65, 69, 72]] },
      "Am7/D": { basic: [[50], [64, 67, 69, 72]], shell: [[50], [64, 67, 69, 72]], rootless: [[50], [64, 67, 69, 72]], triad: [[50], [60, 67, 69, 71]], quartal: [[50], [60, 67, 69, 71]] },
      "Fmaj7/G": { basic: [[43], [65, 69, 72, 76]], shell: [[43], [65, 69, 72, 76]], rootless: [[43], [65, 69, 72, 76]], triad: [[43], [65, 69, 72, 76]], quartal: [[43], [65, 69, 72, 76]] },
      "Bb/C": { basic: [[48], [62, 65, 70]], shell: [[48], [62, 65, 70]], rootless: [[48], [62, 65, 70]], triad: [[48], [62, 65, 70]], quartal: [[48], [62, 65, 70]] },
      "Dm7/G": { basic: [[43], [62, 65, 69, 72]], shell: [[43], [62, 65, 69, 72]], rootless: [[43], [62, 65, 69, 72]], triad: [[43], [65, 72, 74, 76]], quartal: [[43], [65, 72, 74, 76]] },
      "E7/G#": { basic: [[44], [62, 64, 71]], shell: [[44], [62, 64, 71]], rootless: [[44], [62, 64, 71]], triad: [[44], [62, 64, 66, 71]], quartal: [[44], [62, 64, 66, 71]] },
    };
    for (const [label, byShape] of Object.entries(expected)) {
      const snapshot = snapshotFor([label], true)!;
      for (const shape of SHAPES) {
        const event = resolveProgressionPracticeVoicings(snapshot, loopOptions(shape, false, false)).events[0]!;
        const voicing = event.status === "SUPPORTED" ? event.voicing : undefined;
        expect([voicing?.leftHandNotes, voicing?.rightHandNotes], `${label} ${shape}`).toEqual(byShape[shape]);
      }
    }
  });
});
