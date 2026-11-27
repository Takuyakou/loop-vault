/**
 * P25-02 K7: the new shape snapshot id and the reading of today's ids (the saved notes are never rebuilt).
 */
import type { ChordSymbol } from "../types";
import {
  recChordOf, type GeneratedShapeChoice, type GeneratedShapeOptions, type RootlessOrder, type VoicingShapeId, type VoicingShapeOptions,
  DEFAULT_GENERATED_SHAPE_OPTIONS, GENERATED_SHAPE_CHOICES, VOICING_SHAPE_IDS,
} from ".";
import { SEMI } from "./recipe";

export const TEXT_SHAPE_EXTRACTOR_PREFIX = "text-shape-v1:";

/** `text-shape-v1:<shape>[+tension][+spread][:A|:B]`. */
export function formatShapeExtractorVersion(options: VoicingShapeOptions, form?: "A" | "B" | null): string {
  const order = options.shape === "rootless" ? (form ?? (options.rootlessOrder === "auto" ? null : options.rootlessOrder)) : null;
  return `${TEXT_SHAPE_EXTRACTOR_PREFIX}${options.shape}${options.tension ? "+tension" : ""}${options.spread ? "+spread" : ""}${order ? `:${order}` : ""}`;
}

export function parseShapeExtractorVersion(value: string | undefined): VoicingShapeOptions | undefined {
  if (!value?.startsWith(TEXT_SHAPE_EXTRACTOR_PREFIX)) return undefined;
  const match = /^([a-z]+)((?:\+tension)?)((?:\+spread)?)(?::(A|B))?$/.exec(value.slice(TEXT_SHAPE_EXTRACTOR_PREFIX.length));
  if (!match || !VOICING_SHAPE_IDS.includes(match[1] as VoicingShapeId)) return undefined;
  const shape = match[1] as VoicingShapeId;
  return { shape, tension: match[2] === "+tension", spread: match[3] === "+spread", rootlessOrder: (match[4] as RootlessOrder | undefined) ?? "auto" };
}

/** Today's text-intake style ids (`text-style-v1:<id>`). */
export type LegacyTextStyleId = "generated-close" | "shell-17" | "open-17" | "rootless-ab";

/** ② order read from notes: A has the 3rd frame lowest, B the 7th frame lowest; otherwise unknown (auto). */
export function rootlessOrderFromNotes(chord: ChordSymbol, notes: readonly number[]): RootlessOrder {
  if (notes.length === 0) return "auto";
  let c;
  try { c = recChordOf(chord); } catch { return "auto"; }
  const lowest = (((Math.min(...notes) - chord.root) % 12) + 12) % 12;
  if (c.T3 && SEMI[c.T3] === lowest) return "A";
  if (c.T7 && SEMI[c.T7] === lowest) return "B";
  return "auto";
}

/** K7: the shape button a legacy text style marks (`generated-close` = 基本; the saved notes stay as they are). */
export function shapeOfLegacyTextStyle(styleId: LegacyTextStyleId, chord: ChordSymbol, notes: readonly number[]): GeneratedShapeOptions {
  switch (styleId) {
    case "generated-close": return DEFAULT_GENERATED_SHAPE_OPTIONS;
    case "shell-17": return { ...DEFAULT_GENERATED_SHAPE_OPTIONS, shape: "shell" };
    case "open-17": return { ...DEFAULT_GENERATED_SHAPE_OPTIONS, shape: "shell", spread: true };
    case "rootless-ab": return { ...DEFAULT_GENERATED_SHAPE_OPTIONS, shape: "rootless", rootlessOrder: rootlessOrderFromNotes(chord, notes) };
  }
}

/** Voicing Loop's legacy generated selections. */
export type LegacyLoopSelection = "basic-full" | "basic-shell" | "full-shell" | "rootless-shell" | "left-hand";

export interface LegacyLoopModifiers {
  /** 「Colorを加える」 */
  readonly color?: boolean;
  /** 「Open配置」 */
  readonly open?: boolean;
  /** The left-hand Rootless A/B form (only `left-hand`). */
  readonly leftHandForm?: "A" | "B" | "auto";
}

/** K7: a legacy Voicing Loop generated selection, read as the new choice (`basic-full` = 基本; Color/Open → the parts, K11). */
export function shapeOfLegacyLoopSelection(selection: LegacyLoopSelection, modifiers: LegacyLoopModifiers = {}): GeneratedShapeOptions {
  const shape: GeneratedShapeChoice = selection === "basic-full" ? "basic"
    : selection === "rootless-shell" || selection === "left-hand" ? "rootless" : "shell";
  return {
    shape,
    tension: selection === "full-shell" || modifiers.color === true,
    spread: modifiers.open === true,
    rootlessOrder: selection === "left-hand" ? (modifiers.leftHandForm ?? "auto") : "auto",
  };
}

/** The Voicing Loop shape memory (`loop-vault:voicing-loop-shape:v1`); unreadable → 基本. */
export function parseStoredShapeOptions(raw: string | null | undefined): GeneratedShapeOptions {
  if (!raw) return DEFAULT_GENERATED_SHAPE_OPTIONS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof GeneratedShapeOptions, unknown>>;
    if (!GENERATED_SHAPE_CHOICES.includes(value.shape as GeneratedShapeChoice)) return DEFAULT_GENERATED_SHAPE_OPTIONS;
    const order = value.rootlessOrder === "A" || value.rootlessOrder === "B" ? value.rootlessOrder : "auto";
    return { shape: value.shape as GeneratedShapeChoice, tension: value.tension === true, spread: value.spread === true, rootlessOrder: order };
  } catch {
    return DEFAULT_GENERATED_SHAPE_OPTIONS;
  }
}

export const VOICING_LOOP_SHAPE_STORAGE_KEY = "loop-vault:voicing-loop-shape:v1";
