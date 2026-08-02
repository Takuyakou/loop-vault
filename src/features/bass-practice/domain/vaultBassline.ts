import { labelFromSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock } from "../../../domain/types";
import { BASSLINE_GENERATOR_VERSION, generateBasslineExercise } from "./bassline";
import type { BasslineGeneratorResult, BasslineGeneratorSnapshot } from "./types";

export type VaultBasslineResult = BasslineGeneratorResult | { readonly ok: false; readonly error: { readonly code: "source-unavailable" | "unsupported-source"; readonly message: string } };
export function createVaultBasslineExercise(block: SavedProgressionBlock | undefined, seed: string, level: 1 | 2 | 3): VaultBasslineResult {
  if (!block) return { ok: false, error: { code: "source-unavailable", message: "This saved progression is no longer available." } };
  if (!block.detectedKey || !block.bpm || !block.chords.length || !block.chords.every((entry) => entry.chord && entry.durationBeats > 0)) return { ok: false, error: { code: "unsupported-source", message: "This saved progression cannot produce a Bassline exercise." } };
  const chords = block.chords.slice(0, 8).reduce<BasslineGeneratorSnapshot["chords"]>((result, entry) => { const startBeat = Math.max(0, (entry.bar - block.chords[0].bar) * 4 + entry.beat - 1); if (startBeat >= 8) return result; return [...result, { root: entry.chord.root, bass: entry.chord.bass, label: labelFromSymbol(entry.chord), startBeat, durationBeats: Math.min(entry.durationBeats, 8 - startBeat) }]; }, []);
  return generateBasslineExercise({ generatorVersion: BASSLINE_GENERATOR_VERSION, seed, source: "vault", sourceReferenceId: block.id, sourceLabel: block.summaryText.slice(0, 80), level, tempo: Math.round(block.bpm), meter: { numerator: 4, denominator: 4 }, key: block.detectedKey, chords });
}