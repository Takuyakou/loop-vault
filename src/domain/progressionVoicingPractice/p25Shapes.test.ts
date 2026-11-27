/** P25-08 L4: what Voicing Loop plays for each 「形」 is K's own result (K3 without なめらかにつなぐ, K6 with it). */
import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import type { ChordSymbol } from "../types";
import {
  buildShapeVoicing, pickShapeForm, placementNotes,
  type GeneratedShapeOptions, type RootlessOrder, type VoicingShapeId, type VoicingShapeOptions,
} from "../voicingShapes";
import { optimizeShapeProgression } from "../voicingShapes/optimize";
import { buildBasicWithParts } from "../voicingShapes/basicParts";
import { resolveProgressionPracticeVoicings } from "./voicingResolution";
import type { ProgressionVoicingPracticeSnapshot } from "./types";

const LABELS = ["Fmaj7", "Em7", "A7", "Dm7", "G7", "Cmaj7", "G7sus4", "Cm7b5"];
const CHORDS = LABELS.map((label) => parseExtendedTextChordLabel(label)!);

function snapshotOf(chords: readonly ChordSymbol[]): ProgressionVoicingPracticeSnapshot {
  return {
    version: 1, fingerprint: "l4", source: { kind: "vault", reference: { ideaId: "i", blockId: "b" } }, selection: "basic-full", bpm: 100,
    meter: { numerator: 4, denominator: 4 }, lengthBeats: chords.length * 4,
    spans: chords.map((_, eventIndex) => ({ kind: "chord" as const, eventIndex, startBeat: eventIndex * 4, durationBeats: 4 })),
    events: chords.map((chord, index) => ({ id: `e${index}`, startBeat: index * 4, durationBeats: 4,
      chord: { root: chord.root, quality: chord.quality, tensions: [...chord.tensions], label: chord.label } })),
  } as ProgressionVoicingPracticeSnapshot;
}

const plan = (shape: GeneratedShapeOptions, optimize: boolean) => resolveProgressionPracticeVoicings(snapshotOf(CHORDS), {
  lessonStudyCategory: "teacher", lessonProgressionOptimization: optimize, generatedShape: shape,
});
const played = (shape: GeneratedShapeOptions, optimize: boolean) => plan(shape, optimize).events.map((event) => event.status === "SUPPORTED" ? [...event.voicing.midiNotes] : []);

const variants: GeneratedShapeOptions[] = [];
for (const shape of ["shell", "rootless", "triad", "quartal"] as VoicingShapeId[]) {
  for (const tension of [false, true]) for (const spread of [false, true]) {
    for (const rootlessOrder of (shape === "rootless" ? ["auto", "A", "B"] : ["auto"]) as RootlessOrder[]) {
      variants.push({ shape, tension, spread, rootlessOrder });
    }
  }
}

describe("P25-08 L4: the four shapes × parts × order", () => {
  it.each(variants.map((variant) => [JSON.stringify(variant), variant] as const))("%s: OFF is K3, ON is K6", (_name, variant) => {
    const options = variant as VoicingShapeOptions;
    // None of these chords needs K4's legacy sound, so the default legacy placement is never used here.
    const results = CHORDS.map((chord) => buildShapeVoicing(chord, options));
    expect(results.every((result) => result.used !== "legacy")).toBe(true);
    expect(played(variant, false)).toEqual(results.map((result) => placementNotes(pickShapeForm(result, options.rootlessOrder)!.staticChoice)));
    expect(played(variant, true)).toEqual(optimizeShapeProgression(results, options.rootlessOrder).map(placementNotes));
  });

  it("② without 広げる adds the root as the accompaniment bass only (L3b)", () => {
    const rootless = plan({ shape: "rootless", tension: false, spread: false, rootlessOrder: "auto" }, false);
    for (const [index, event] of rootless.events.entries()) {
      if (event.status !== "SUPPORTED" || !event.voicing.variant) continue;
      expect(event.voicing.referenceBassNote! % 12).toBe(CHORDS[index]!.root % 12);
      expect(event.voicing.midiNotes).not.toContain(event.voicing.referenceBassNote);
    }
    const spread = plan({ shape: "rootless", tension: false, spread: true, rootlessOrder: "auto" }, false);
    expect(spread.events.every((event) => event.status !== "SUPPORTED" || event.voicing.referenceBassNote === undefined)).toBe(true);
  });

  it("a fixed ② order a chord cannot place uses the other order, with the card's sentence and no 「A」 (K6)", () => {
    const sus = [parseExtendedTextChordLabel("G7sus4")!];
    const options = { lessonStudyCategory: "teacher" as const, lessonProgressionOptimization: false,
      generatedShape: { shape: "rootless" as const, tension: false, spread: false, rootlessOrder: "A" as const } };
    const event = resolveProgressionPracticeVoicings(snapshotOf(sus), options).events[0]!;
    expect(event.status).toBe("SUPPORTED");
    if (event.status !== "SUPPORTED") return;
    expect(event.voicing.variant).toBe("B");
    expect(event.cardNote).toBe("このコードは B の並びだけ置けます");
    expect(event.autoFallbackTitle).toBeUndefined();
  });
});

describe("P25-08 L4: 基本 × parts is K11; no parts is today's 基本", () => {
  const basic = { shape: "basic" as const, tension: false, spread: false, rootlessOrder: "auto" as const };
  it("each part (OFF) applies K11 to today's 基本 card by card, and removing the parts gives it back", () => {
    const today = resolveProgressionPracticeVoicings(snapshotOf(CHORDS), { lessonStudyCategory: "teacher", lessonProgressionOptimization: false });
    const base = plan(basic, false);
    expect(base.events.map((event) => event.status === "SUPPORTED" ? event.voicing.midiNotes : [])).toEqual(
      today.events.map((event) => event.status === "SUPPORTED" ? event.voicing.midiNotes : []));
    for (const parts of [{ tension: true, spread: false }, { tension: false, spread: true }, { tension: true, spread: true }]) {
      const withParts = plan({ ...basic, ...parts }, false);
      withParts.events.forEach((event, index) => {
        const before = base.events[index]!;
        if (event.status !== "SUPPORTED" || before.status !== "SUPPORTED") throw new Error("expected a sound");
        const built = buildBasicWithParts(CHORDS[index]!, { left: before.voicing.leftHandNotes ?? [], right: before.voicing.rightHandNotes ?? [] }, parts);
        expect([...event.voicing.midiNotes]).toEqual([...built.left, ...built.right].sort((a, b) => a - b));
      });
    }
  });
});
