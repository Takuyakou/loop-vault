import {
  formatChordSymbol,
  makeChordSymbol,
  normalizePc,
  pitchClassFromNoteToken,
} from "../../../domain/chords";
import type { ChordQuality } from "../../../domain/types";
import {
  buildPresetChordContextSnapshot,
  type ChordContextSnapshotChord,
  type PresetChordContextSnapshotResult,
} from "./chordContextSnapshot";

export const BASSLINE_PRESET_CATALOG_VERSION = "bassline-preset-catalog-v1" as const;

export type BasslinePresetCategory = "foundation" | "functional" | "practical";
export type BasslineProgressionPresetId =
  | "legacy-generated-default"
  | "fourth-fifth-foundation"
  | "pop-four-chords"
  | "minor-descent"
  | "turnaround"
  | "ii-v-i"
  | "modal-rock"
  | "descending-bass"
  | "twelve-bar-blues";

export interface BasslinePresetChordFormula {
  readonly id: string;
  readonly degree: string;
  /** Semitone distance from the selected tonal centre; borrowed degrees are explicit. */
  readonly rootOffset: number;
  readonly quality: ChordQuality;
  readonly bassOffset?: number;
  readonly durationBeats: number;
}

export interface BasslineProgressionPreset {
  readonly id: BasslineProgressionPresetId;
  readonly name: string;
  readonly category: BasslinePresetCategory;
  readonly difficultyLabel: string;
  readonly defaultKey: string;
  readonly defaultBpm: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly skillTags: readonly string[];
  readonly chords: readonly BasslinePresetChordFormula[];
}

export interface BuildBasslinePresetSnapshotInput {
  readonly presetId: BasslineProgressionPresetId;
  /** Must retain the preset's major/minor mode; changing the tonic is deterministic. */
  readonly key?: string;
}

const FOUR_FOUR = Object.freeze({ numerator: 4 as const, denominator: 4 as const });

function preset(definition: BasslineProgressionPreset): BasslineProgressionPreset {
  return Object.freeze({
    ...definition,
    meter: FOUR_FOUR,
    skillTags: Object.freeze([...definition.skillTags]),
    chords: Object.freeze(definition.chords.map((chord) => Object.freeze({ ...chord }))),
  });
}

/**
 * The sole P5.18.1 data-driven catalog. No UI branch owns a literal chord array.
 * The legacy default is retained as an explicit compatibility preset, while its
 * pre-existing generated snapshot and History identity remain untouched.
 */
export const BASSLINE_PROGRESSION_PRESETS = Object.freeze([
  preset({
    id: "legacy-generated-default",
    name: "Existing Default Classic",
    category: "foundation",
    difficultyLabel: "Classic",
    defaultKey: "C major",
    defaultBpm: 96,
    meter: FOUR_FOUR,
    skillTags: ["legacy", "ii-V-I", "cadence"],
    chords: [
      { id: "legacy:ii", degree: "ii", rootOffset: 2, quality: "min7", durationBeats: 2 },
      { id: "legacy:V", degree: "V", rootOffset: 7, quality: "dom7", durationBeats: 2 },
      { id: "legacy:I", degree: "I", rootOffset: 0, quality: "maj7", durationBeats: 4 },
    ],
  }),
  preset({
    id: "fourth-fifth-foundation",
    name: "Fourth–Fifth Foundation",
    category: "foundation",
    difficultyLabel: "Foundation",
    defaultKey: "G major",
    defaultBpm: 88,
    meter: FOUR_FOUR,
    skillTags: ["fourth", "fifth", "tonic-return"],
    chords: [
      { id: "I", degree: "I", rootOffset: 0, quality: "maj", durationBeats: 4 },
      { id: "IV", degree: "IV", rootOffset: 5, quality: "maj", durationBeats: 4 },
      { id: "V", degree: "V", rootOffset: 7, quality: "maj", durationBeats: 4 },
      { id: "I-return", degree: "I", rootOffset: 0, quality: "maj", durationBeats: 4 },
    ],
  }),
  preset({
    id: "pop-four-chords",
    name: "Pop Four Chords",
    category: "foundation",
    difficultyLabel: "Foundation",
    defaultKey: "C major",
    defaultBpm: 92,
    meter: FOUR_FOUR,
    skillTags: ["pop", "major-minor", "loop"],
    chords: [
      { id: "I", degree: "I", rootOffset: 0, quality: "maj", durationBeats: 4 },
      { id: "V", degree: "V", rootOffset: 7, quality: "maj", durationBeats: 4 },
      { id: "vi", degree: "vi", rootOffset: 9, quality: "min", durationBeats: 4 },
      { id: "IV", degree: "IV", rootOffset: 5, quality: "maj", durationBeats: 4 },
    ],
  }),
  preset({
    id: "minor-descent",
    name: "Minor Descent",
    category: "foundation",
    difficultyLabel: "Foundation",
    defaultKey: "A minor",
    defaultBpm: 82,
    meter: FOUR_FOUR,
    skillTags: ["minor", "descent", "dominant-resolution"],
    chords: [
      { id: "i", degree: "i", rootOffset: 0, quality: "min", durationBeats: 4 },
      { id: "bVII", degree: "bVII", rootOffset: 10, quality: "maj", durationBeats: 4 },
      { id: "bVI", degree: "bVI", rootOffset: 8, quality: "maj", durationBeats: 4 },
      { id: "V7", degree: "V7", rootOffset: 7, quality: "dom7", durationBeats: 4 },
    ],
  }),
  preset({
    id: "turnaround",
    name: "Turnaround",
    category: "functional",
    difficultyLabel: "Functional",
    defaultKey: "C major",
    defaultBpm: 88,
    meter: FOUR_FOUR,
    skillTags: ["turnaround", "functional-cycle", "jazz-pop"],
    chords: [
      { id: "Imaj7", degree: "Imaj7", rootOffset: 0, quality: "maj7", durationBeats: 4 },
      { id: "vi7", degree: "vi7", rootOffset: 9, quality: "min7", durationBeats: 4 },
      { id: "ii7", degree: "ii7", rootOffset: 2, quality: "min7", durationBeats: 4 },
      { id: "V7", degree: "V7", rootOffset: 7, quality: "dom7", durationBeats: 4 },
    ],
  }),
  preset({
    id: "ii-v-i",
    name: "ii–V–I",
    category: "functional",
    difficultyLabel: "Functional",
    defaultKey: "C major",
    defaultBpm: 84,
    meter: FOUR_FOUR,
    skillTags: ["ii-V-I", "dominant-resolution", "closure"],
    chords: [
      { id: "ii7", degree: "ii7", rootOffset: 2, quality: "min7", durationBeats: 4 },
      { id: "V7", degree: "V7", rootOffset: 7, quality: "dom7", durationBeats: 4 },
      { id: "Imaj7", degree: "Imaj7", rootOffset: 0, quality: "maj7", durationBeats: 4 },
      { id: "Imaj7-repeat", degree: "Imaj7", rootOffset: 0, quality: "maj7", durationBeats: 4 },
    ],
  }),
  preset({
    id: "modal-rock",
    name: "Modal Rock",
    category: "functional",
    difficultyLabel: "Functional",
    defaultKey: "E major",
    defaultBpm: 100,
    meter: FOUR_FOUR,
    skillTags: ["modal", "borrowed-bVII", "rock"],
    chords: [
      { id: "I", degree: "I", rootOffset: 0, quality: "maj", durationBeats: 4 },
      { id: "bVII", degree: "bVII", rootOffset: 10, quality: "maj", durationBeats: 4 },
      { id: "IV", degree: "IV", rootOffset: 5, quality: "maj", durationBeats: 4 },
      { id: "I-return", degree: "I", rootOffset: 0, quality: "maj", durationBeats: 4 },
    ],
  }),
  preset({
    id: "descending-bass",
    name: "Descending Bass",
    category: "practical",
    difficultyLabel: "Practical",
    defaultKey: "C major",
    defaultBpm: 80,
    meter: FOUR_FOUR,
    skillTags: ["slash-bass", "descending-line", "phrase-memory"],
    chords: [
      { id: "I", degree: "I", rootOffset: 0, quality: "maj", durationBeats: 4 },
      { id: "V-7", degree: "V/7", rootOffset: 7, bassOffset: 11, quality: "maj", durationBeats: 4 },
      { id: "vi", degree: "vi", rootOffset: 9, quality: "min", durationBeats: 4 },
      { id: "iii-5", degree: "iii/5", rootOffset: 4, bassOffset: 7, quality: "min", durationBeats: 4 },
      { id: "IV", degree: "IV", rootOffset: 5, quality: "maj", durationBeats: 4 },
      { id: "I-3", degree: "I/3", rootOffset: 0, bassOffset: 4, quality: "maj", durationBeats: 4 },
      { id: "ii7", degree: "ii7", rootOffset: 2, quality: "min7", durationBeats: 4 },
      { id: "V7", degree: "V7", rootOffset: 7, quality: "dom7", durationBeats: 4 },
    ],
  }),
  preset({
    id: "twelve-bar-blues",
    name: "12-Bar Blues",
    category: "practical",
    difficultyLabel: "Practical",
    defaultKey: "A major",
    defaultBpm: 96,
    meter: FOUR_FOUR,
    skillTags: ["blues", "form-memory", "turnaround"],
    chords: [
      { id: "I7-1", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "I7-2", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "I7-3", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "I7-4", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "IV7-1", degree: "IV7", rootOffset: 5, quality: "dom7", durationBeats: 4 },
      { id: "IV7-2", degree: "IV7", rootOffset: 5, quality: "dom7", durationBeats: 4 },
      { id: "I7-5", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "I7-6", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "V7", degree: "V7", rootOffset: 7, quality: "dom7", durationBeats: 4 },
      { id: "IV7-3", degree: "IV7", rootOffset: 5, quality: "dom7", durationBeats: 4 },
      { id: "I7-7", degree: "I7", rootOffset: 0, quality: "dom7", durationBeats: 4 },
      { id: "V7-turnaround", degree: "V7", rootOffset: 7, quality: "dom7", durationBeats: 4 },
    ],
  }),
] as const satisfies readonly BasslineProgressionPreset[]);

export function getBasslineProgressionPreset(
  presetId: BasslineProgressionPresetId,
): BasslineProgressionPreset | undefined {
  return BASSLINE_PROGRESSION_PRESETS.find((preset) => preset.id === presetId);
}

export function buildBasslinePresetSnapshot(
  input: BuildBasslinePresetSnapshotInput,
): PresetChordContextSnapshotResult {
  const progression = getBasslineProgressionPreset(input.presetId);
  if (!progression) return unsupported(`Unknown Bassline preset: ${input.presetId}.`);
  const key = input.key?.trim() || progression.defaultKey;
  const tonic = tonicForKey(key);
  const defaultMode = modeForKey(progression.defaultKey);
  if (tonic === undefined || modeForKey(key) !== defaultMode) {
    return unsupported("Preset key must be a valid tonal centre with the preset's original major/minor mode.");
  }

  let startBeat = 0;
  const chords: ChordContextSnapshotChord[] = progression.chords.map((formula) => {
    const root = normalizePc(tonic + formula.rootOffset);
    const bass = formula.bassOffset === undefined ? undefined : normalizePc(tonic + formula.bassOffset);
    const symbol = makeChordSymbol(root, formula.quality, [], bass);
    const chord: ChordContextSnapshotChord = Object.freeze({
      id: formula.id,
      root,
      quality: formula.quality,
      tensions: Object.freeze([]),
      ...(bass === undefined ? {} : { bass }),
      label: formatChordSymbol(symbol, { keyContext: key }),
      startBeat,
      durationBeats: formula.durationBeats,
    });
    startBeat += formula.durationBeats;
    return chord;
  });

  return buildPresetChordContextSnapshot({
    presetId: progression.id,
    catalogVersion: BASSLINE_PRESET_CATALOG_VERSION,
    safeLabel: progression.name,
    key,
    bpm: progression.defaultBpm,
    chords,
  });
}

function tonicForKey(key: string): number | undefined {
  const [tonic] = key.trim().split(/\s+/, 1);
  return tonic ? pitchClassFromNoteToken(tonic) : undefined;
}

function modeForKey(key: string): "major" | "minor" | undefined {
  const parts = key.trim().split(/\s+/);
  return parts.length === 2 && (parts[1] === "major" || parts[1] === "minor") ? parts[1] : undefined;
}

function unsupported(message: string): PresetChordContextSnapshotResult {
  return { ok: false, error: { code: "unsupported-source", message } };
}
