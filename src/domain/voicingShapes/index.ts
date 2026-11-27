/**
 * P25-02 K: the four P26 voicing shapes and their two parts, as one pure entry point.
 * The making (which degrees go to which hand) lives in `recipe.ts` (a port of the lead's `rec.py`).
 */
import type { ChordSymbol } from "../types";
import { voiceTextChordForAudition } from "../textChordTones";
import { build, QUAL, RecChord, SEMI, shapeStaticCost, type BuildResult, type RecShape } from "./recipe";

export type VoicingShapeId = "shell" | "rootless" | "triad" | "quartal";
export type RootlessOrder = "auto" | "A" | "B";
export interface VoicingShapeOptions {
  readonly shape: VoicingShapeId;
  readonly tension: boolean;      // P26 の Color
  readonly spread: boolean;       // P26 の 広げる
  readonly rootlessOrder: RootlessOrder;
}
export const DEFAULT_VOICING_SHAPE_OPTIONS: VoicingShapeOptions =
  { shape: "shell", tension: false, spread: false, rootlessOrder: "auto" };

export const VOICING_SHAPE_IDS: readonly VoicingShapeId[] = ["shell", "rootless", "triad", "quartal"];

/** K: the five choices shown (「基本」 first, the default = today's automatic sound, untouched by K). */
export type GeneratedShapeChoice = "basic" | VoicingShapeId;
export const DEFAULT_GENERATED_SHAPE_CHOICE: GeneratedShapeChoice = "basic";
export const GENERATED_SHAPE_CHOICES: readonly GeneratedShapeChoice[] = ["basic", ...VOICING_SHAPE_IDS];

/** The choice with its parts (Voicing Loop's 基本 may carry parts, K11; text intake's 基本 never does). */
export interface GeneratedShapeOptions {
  readonly shape: GeneratedShapeChoice;
  readonly tension: boolean;
  readonly spread: boolean;
  readonly rootlessOrder: RootlessOrder;
}
export const DEFAULT_GENERATED_SHAPE_OPTIONS: GeneratedShapeOptions =
  { shape: "basic", tension: false, spread: false, rootlessOrder: "auto" };

/** 実際に作った形。代わりになった時は選んだ形と違う。 */
export type UsedVoicingShape =
  | "shell" | "shell+tension" | "shell+spread" | "shell+tension+spread"
  | "rootless" | "rootless+spread" | "triad" | "quartal" | "close"
  | "basic" | "basic+tension" | "basic+spread" | "basic+tension+spread"   // K11(Voicing Loop の基本に部品を付けた時)
  | "legacy";   // K4:詰めた形まで作れず、今の作り方の音で鳴らす時

export interface ShapeVoicingPlacement { readonly left: readonly number[]; readonly right: readonly number[] }
export interface ShapeVoicingForm {
  readonly form: "A" | "B" | null;                 // ② だけ A/B。ほかは null
  readonly candidates: readonly ShapeVoicingPlacement[]; // P26 5.1 に合格した置き方の全部
  readonly staticChoice: ShapeVoicingPlacement;    // K3 の静的な選び
}
export interface ShapeVoicingResult {
  readonly requested: VoicingShapeOptions;
  readonly used: UsedVoicingShape;
  readonly fellBack: boolean;                      // 選んだ形と部品のまま作れなかった
  /** 1 つ以上。② で片方しか置けないキーは 1 つ。今の作り方でも音が作れない時だけ空(「使えないコード」)。 */
  readonly forms: readonly ShapeVoicingForm[];
  readonly addedTension?: string;                  // テンションを足した時の度数("9" "11" "13" …)
  /** True for the shapes whose upper notes may be stacked in any order (①・③ and the close form): K3/K6 semitone cost. */
  readonly freeOrder: boolean;
  /** True when the left hand carries the whole voicing (② without 広げる). */
  readonly oneHand: boolean;
}

/** The old sound used when no shape can be made (K4 legacy) or omissions are written (K10). */
export type LegacyPlacement = (chord: ChordSymbol) => ShapeVoicingPlacement | undefined;

/** Text intake's current audition sound (the `generated-close` text path): bass alone in the left hand. */
export const textLegacyPlacement: LegacyPlacement = (chord) => {
  const notes = [...voiceTextChordForAudition(chord)].sort((a, b) => a - b);
  return notes.length < 2 ? undefined : { left: notes.slice(0, 1), right: notes.slice(1) };
};

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

function relativeBass(chord: ChordSymbol): number | null {
  if (chord.bass === undefined || mod12(chord.bass) === mod12(chord.root)) return null;
  return mod12(chord.bass - chord.root);
}

export function recChordOf(chord: ChordSymbol): RecChord {
  return new RecChord(chord.quality, chord.tensions, chord.altered === true, relativeBass(chord));
}

const SHAPE_OF: Readonly<Record<VoicingShapeId, RecShape>> = { shell: "shell", rootless: "rootless", triad: "triad", quartal: "quartal" };

function usedName(raw: string): UsedVoicingShape {
  return raw.replace("+color", "+tension") as UsedVoicingShape;
}

function legacyResult(chord: ChordSymbol, options: VoicingShapeOptions, used: "legacy" | "close", legacy: LegacyPlacement): ShapeVoicingResult {
  let placement: ShapeVoicingPlacement | undefined;
  try { placement = legacy(chord); } catch { placement = undefined; }
  return {
    requested: options, used, fellBack: true, freeOrder: true, oneHand: false,
    forms: placement ? [{ form: null, candidates: [placement], staticChoice: placement }] : [],
  };
}

function fromBuild(options: VoicingShapeOptions, built: BuildResult): ShapeVoicingResult {
  const used = usedName(built.used);
  const requestedUsed = built.shape === SHAPE_OF[options.shape];
  return {
    requested: options,
    used,
    fellBack: !requestedUsed,
    freeOrder: !built.fixed,
    oneHand: built.oneHand,
    forms: built.forms.map((form) => ({
      form: form.name === "A" || form.name === "B" ? form.name : null,
      candidates: form.candidates.map(([left, right]) => ({ left, right })),
      staticChoice: { left: form.left, right: form.right },
    })),
    ...(built.addedColor === undefined ? {} : { addedTension: built.addedColor }),
  };
}

/** K1. Never throws. */
export function buildShapeVoicing(
  chord: ChordSymbol,
  options: VoicingShapeOptions,
  legacy: LegacyPlacement = textLegacyPlacement,
): ShapeVoicingResult {
  if (chord.omissions && chord.omissions.length > 0) return legacyResult(chord, options, "close", legacy);
  let built: BuildResult | undefined;
  try {
    built = build(recChordOf(chord), mod12(chord.root), SHAPE_OF[options.shape], options.tension, options.spread);
  } catch {
    built = undefined;
  }
  return built ? fromBuild(options, built) : legacyResult(chord, options, "legacy", legacy);
}

/** K3 cost of one placement within a result (used by the static choice and by the optimizer, K6). */
export function shapePlacementStaticCost(result: ShapeVoicingResult, placement: ShapeVoicingPlacement): number {
  return shapeStaticCost(placement.left, placement.right, !result.freeOrder, result.oneHand);
}

/**
 * The form a card plays: the requested ② order when that order can be placed, otherwise the
 * cheaper static choice (K3「A と B のうち近い方」; a tie keeps A).
 */
export function pickShapeForm(result: ShapeVoicingResult, order: RootlessOrder): ShapeVoicingForm | undefined {
  if (result.forms.length === 0) return undefined;
  if (order !== "auto") {
    const fixed = result.forms.find((form) => form.form === order);
    if (fixed) return fixed;
  }
  let best = result.forms[0]!;
  for (const form of result.forms.slice(1)) {
    if (shapePlacementStaticCost(result, form.staticChoice) < shapePlacementStaticCost(result, best.staticChoice)) best = form;
  }
  return best;
}

export function placementNotes(placement: ShapeVoicingPlacement): number[] {
  return [...placement.left, ...placement.right].sort((a, b) => a - b);
}

/** Candidates the optimizer may choose from (K6): ② auto → both orders; A/B → that order (or the placeable one). */
export function optimizerCandidates(result: ShapeVoicingResult, order: RootlessOrder): readonly ShapeVoicingPlacement[] {
  if (order === "auto" || result.forms.every((form) => form.form === null)) return result.forms.flatMap((form) => form.candidates);
  const fixed = result.forms.find((form) => form.form === order);
  return fixed ? fixed.candidates : result.forms.flatMap((form) => form.candidates);
}

// ---- K9: what a chord's notes may and must contain ----

export interface ChordMatchSets {
  /** Pitch classes that must all sound. */
  readonly required: ReadonlySet<number>;
  /** For altered dominants only: at least one of these must sound (♭9・♯9・♯11・♭13). */
  readonly requiredOneOf?: ReadonlySet<number>;
  /** Pitch classes that may sound. */
  readonly allowed: ReadonlySet<number>;
  /** A slash chord's bass: the lowest judged note must be this pitch class. */
  readonly bass?: number;
  /** Written chord tones (rec.py `tones()`), for the key colours (C3). */
  readonly tones: ReadonlySet<number>;
  /** Tension pitch classes: the safe colours and the written tensions (C3). */
  readonly tensions: ReadonlySet<number>;
}

const TENSION_DEGREES = new Set(["b9", "9", "#9", "11", "#11", "b13", "13"]);

export function chordMatchSets(chord: ChordSymbol): ChordMatchSets {
  const root = mod12(chord.root);
  const pc = (degree: string): number => mod12(root + SEMI[degree]!);
  let c: RecChord;
  try { c = recChordOf(chord); } catch { c = new RecChord(QUAL[chord.quality] ? chord.quality : "maj"); }
  const bass = relativeBass(chord) === null ? undefined : mod12(chord.bass!);
  const omitted = new Set<number>();
  if (chord.omissions?.includes("3") && c.T3) omitted.add(pc(c.T3));
  if (chord.omissions?.includes("5") && c.T5) omitted.add(pc(c.T5));
  if (chord.omissions?.includes("5") && !c.T5) omitted.add(pc("5"));
  const tones = new Set(c.tones().map(pc));
  const tensions = new Set([...c.safe, ...c.tones().filter((d) => TENSION_DEGREES.has(d))].map(pc));
  let required: Set<number>; let allowed: Set<number>; let requiredOneOf: Set<number> | undefined;
  if (c.alt) {
    required = new Set(["3", "b7"].map(pc));
    requiredOneOf = new Set(["b9", "#9", "#11", "b13"].map(pc));
    allowed = new Set(["R", "3", "b7", "b9", "#9", "#11", "b13"].map(pc));
  } else if (c.fam === "power") {
    required = new Set(["R", "5"].map(pc));
    allowed = new Set([...c.tones().map(pc), ...c.safe.map(pc)]);
  } else {
    required = new Set(c.must().map(pc));
    allowed = new Set([...c.tones().map(pc), ...c.safe.map(pc)]);
  }
  if (bass !== undefined) { required.add(bass); allowed.add(bass); }
  for (const p of omitted) { required.delete(p); allowed.delete(p); requiredOneOf?.delete(p); }
  return {
    required, allowed, tones, tensions,
    ...(requiredOneOf ? { requiredOneOf } : {}),
    ...(bass === undefined ? {} : { bass }),
  };
}

/** True when the notes satisfy the chord's match sets (all required, nothing outside allowed, slash bass lowest). */
export function notesMatchChord(sets: ChordMatchSets, notes: readonly number[]): boolean {
  if (notes.length === 0) return false;
  const pcs = new Set(notes.map(mod12));
  for (const p of sets.required) if (!pcs.has(p)) return false;
  if (sets.requiredOneOf && ![...sets.requiredOneOf].some((p) => pcs.has(p))) return false;
  for (const p of pcs) if (!sets.allowed.has(p)) return false;
  if (sets.bass !== undefined && mod12(Math.min(...notes)) !== sets.bass) return false;
  return true;
}

export { SAFE, SEMI, textbookLowIntervalLimit } from "./recipe";
