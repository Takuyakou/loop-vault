import { labelFromSymbol } from "../../../domain/chords";
import type { SavedProgressionBlock } from "../../../domain/types";
import { BASSLINE_GENERATOR_VERSION, generateBasslineExercise } from "./bassline";
import { validateChordContextSnapshot, type VaultChordContextSnapshot } from "./chordContextSnapshot";
import type { BasslineGeneratorResult, BasslineGeneratorSnapshot } from "./types";

export type VaultBasslineResult = BasslineGeneratorResult | { readonly ok: false; readonly error: { readonly code: "source-unavailable" | "unsupported-source"; readonly message: string } };
export function createVaultBasslineExercise(block: SavedProgressionBlock | undefined, seed: string, level: 1 | 2 | 3): VaultBasslineResult {
  if (!block) return { ok: false, error: { code: "source-unavailable", message: "This saved progression is no longer available." } };
  if (!block.detectedKey || !block.bpm || !block.chords.length || !block.chords.every((entry) => entry.chord && entry.durationBeats > 0)) return { ok: false, error: { code: "unsupported-source", message: "This saved progression cannot produce a Bassline exercise." } };
  const chords = block.chords.slice(0, 8).reduce<BasslineGeneratorSnapshot["chords"]>((result, entry) => { const startBeat = Math.max(0, (entry.bar - block.chords[0].bar) * 4 + entry.beat - 1); if (startBeat >= 8) return result; return [...result, { root: entry.chord.root, bass: entry.chord.bass, label: labelFromSymbol(entry.chord), startBeat, durationBeats: Math.min(entry.durationBeats, 8 - startBeat) }]; }, []);
  return generateBasslineExercise({ generatorVersion: BASSLINE_GENERATOR_VERSION, seed, source: "vault", sourceReferenceId: block.id, sourceLabel: block.summaryText.slice(0, 80), level, tempo: Math.round(block.bpm), meter: { numerator: 4, denominator: 4 }, key: block.detectedKey, chords });
}
/**
 * P5.18 uses this distinct adapter instead of broadening the legacy Vault
 * adapter above. The source has already been section-validated and detached
 * from the mutable Vault model, so no truncation or live lookup can occur.
 */
export function createChordContextVaultBasslineExercise(
  snapshot: VaultChordContextSnapshot,
  level: 1 | 2 | 3,
): VaultBasslineResult {
  const validation = validateChordContextSnapshot(snapshot);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "unsupported-source",
        message: "Chord Context snapshot is unavailable for a Bassline exercise.",
      },
    };
  }
  const canonicalSnapshot = validation.snapshot;
  if (canonicalSnapshot.source.kind !== "vault") {
    return {
      ok: false,
      error: {
        code: "unsupported-source",
        message: "Chord Context snapshot is unavailable for a Bassline exercise.",
      },
    };
  }
  return generateBasslineExercise({
    generatorVersion: BASSLINE_GENERATOR_VERSION,
    seed: `${canonicalSnapshot.signature}:level:${level}`,
    source: "vault",
    sourceReferenceId: canonicalSnapshot.source.reference.blockId,
    sourceLabel: canonicalSnapshot.source.safeLabel,
    level,
    tempo: canonicalSnapshot.originalBpm,
    meter: canonicalSnapshot.meter,
    key: canonicalSnapshot.tonalContext.key,
    chords: canonicalSnapshot.section.chords.map((chord) => ({
      root: chord.root,
      ...(chord.bass === undefined ? {} : { bass: chord.bass }),
      label: chord.label,
      startBeat: chord.startBeat,
      durationBeats: chord.durationBeats,
    })),
  });
}
