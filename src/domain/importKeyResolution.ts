import { displayKey } from "./displayLabels";
import { inferTextProgressionKeyCandidates } from "./textProgression";
import type { ChordSymbol } from "./types";

/**
 * P23-33: the key an import is saved and shown with, and where that key came from.
 *
 * The inference is deliberately conservative (design §4): it only settles a key for a clear,
 * at-least-three-chord progression, and it never reports a confidence. A session-only origin is
 * kept here; the file format has no provenance field (design §5), so a reloaded block shows the
 * key like any other key.
 */
export type ImportKeyMode = "auto" | "manual" | "unset";

/** The key select's three states: keep it automatic, remove it on purpose, or pin a key by hand. */
export type ImportKeyChoice =
  | { readonly kind: "auto" }
  | { readonly kind: "unset" }
  | { readonly kind: "manual"; readonly key: string };

export type ImportKeyOrigin = "manual" | "existing" | "inherited" | "inferred" | "unknown";

/** Why the automatic rule did not settle a key. For the UI's help text and the reports only. */
export type ImportKeyUnknownReason =
  | "settled"
  | "unset"
  | "too-few-chords"
  | "too-few-distinct-chords"
  | "coverage-below-threshold"
  | "not-unique"
  | "cadence-not-conclusive";

export interface ImportKeyCandidate {
  /** Canonical spelling (`C major`), the same form the text parser writes. */
  readonly key: string;
  readonly tonicPitchClass: number;
  readonly mode: "major" | "minor";
  readonly support: number;
  readonly conflicts: number;
}

export interface ImportKeyDecision {
  /** The effective key for display and save, undefined when the decision is 「未確定」. */
  readonly key?: string;
  readonly origin: ImportKeyOrigin;
  readonly reason: ImportKeyUnknownReason;
  /** Every compared key, best first — display order only, never part of the adoption rule. */
  readonly candidates: readonly ImportKeyCandidate[];
}

export interface ResolveImportKeyInput {
  /** Defaults to `auto`. */
  readonly mode?: ImportKeyMode;
  /** The key the user picked by hand (`mode: "manual"`). */
  readonly manualKey?: string;
  /** The object's own key (for example a MIDI `analysis.detectedKey`). Never overwritten. */
  readonly existingKey?: string;
  /** The destination progression's key, used only when the object has none. */
  readonly inheritedKey?: string;
  /** The chords that will be saved, in order. The caller drops rests. */
  readonly chords: readonly ChordSymbol[];
}

/** The adoption thresholds (design §4: an initial, uncalibrated policy — not an accuracy claim). */
const MIN_CHORDS = 3;
const MIN_DISTINCT_CHORDS = 3;
const MIN_COVERAGE = 0.75;
const MAX_CANDIDATES = 24;

const DOMINANT_QUALITIES: ReadonlySet<string> = new Set(["maj", "dom7", "dom9", "dom13"]);
const MAJOR_ARRIVALS: ReadonlySet<string> = new Set(["maj", "maj7", "maj9"]);
const MINOR_ARRIVALS: ReadonlySet<string> = new Set(["min", "min7", "min9", "min11"]);

function unknownKey(reason: ImportKeyUnknownReason, candidates: readonly ImportKeyCandidate[] = []): ImportKeyDecision {
  return Object.freeze({ origin: "unknown" as const, reason, candidates });
}

/**
 * Resolves the import key in the design's priority order: a manual pick, the object's own key, the
 * destination's key, then the automatic rule. `unset` suppresses only the automatic rule, so an
 * existing or inherited key is never silently dropped (design §3).
 */
export function resolveImportKey(input: ResolveImportKeyInput): ImportKeyDecision {
  const mode = input.mode ?? "auto";
  const manualKey = trimKey(input.manualKey);
  if (mode === "manual" && manualKey) {
    return Object.freeze({ key: manualKey, origin: "manual" as const, reason: "settled" as const, candidates: [] });
  }
  const existingKey = trimKey(input.existingKey);
  if (existingKey) {
    return Object.freeze({ key: existingKey, origin: "existing" as const, reason: "settled" as const, candidates: [] });
  }
  const inheritedKey = trimKey(input.inheritedKey);
  if (inheritedKey) {
    return Object.freeze({ key: inheritedKey, origin: "inherited" as const, reason: "settled" as const, candidates: [] });
  }
  if (mode === "unset") return unknownKey("unset");
  return inferImportKey(input.chords);
}

/** The automatic rule alone (design §4). Pure: the input chords are never changed. */
export function inferImportKey(chords: readonly ChordSymbol[]): ImportKeyDecision {
  const valid = chords.filter((chord) => chord !== undefined && chord !== null);
  // The compared keys are listed even when nothing is adopted (design §4 rule 7: 「候補一覧は表示可能」).
  const candidates = valid.length
    ? inferTextProgressionKeyCandidates(valid, MAX_CANDIDATES).map((candidate) => Object.freeze({
      key: candidate.key,
      tonicPitchClass: candidate.tonicPitchClass,
      mode: candidate.mode,
      support: candidate.support,
      conflicts: candidate.conflicts,
    }))
    : [];
  if (valid.length < MIN_CHORDS) return unknownKey("too-few-chords", candidates);
  if (countDistinctHarmonies(valid) < MIN_DISTINCT_CHORDS) return unknownKey("too-few-distinct-chords", candidates);
  if (!candidates.length) return unknownKey("not-unique");

  const maxSupport = Math.max(...candidates.map((candidate) => candidate.support));
  const best = candidates.filter((candidate) => candidate.support === maxSupport);
  const coverage = (candidate: ImportKeyCandidate) => candidate.support / valid.length;

  if (best.length === 1) {
    const winner = best[0]!;
    if (coverage(winner) < MIN_COVERAGE) return unknownKey("coverage-below-threshold", candidates);
    return Object.freeze({ key: winner.key, origin: "inferred" as const, reason: "settled" as const, candidates });
  }

  // A tie is only narrowed by an adjacent V→I / V→i that really appears in the progression.
  const byCadence = best.filter((candidate) => hasCadence(valid, candidate.tonicPitchClass, candidate.mode));
  if (byCadence.length === 1) {
    const winner = byCadence[0]!;
    if (coverage(winner) < MIN_COVERAGE) return unknownKey("coverage-below-threshold", candidates);
    return Object.freeze({ key: winner.key, origin: "inferred" as const, reason: "settled" as const, candidates });
  }
  return unknownKey(byCadence.length ? "not-unique" : "cadence-not-conclusive", candidates);
}

/** Distinct root/quality pairs, ignoring consecutive repeats (design §4 rule 2). */
function countDistinctHarmonies(chords: readonly ChordSymbol[]): number {
  const seen = new Set<string>();
  let previous = "";
  for (const chord of chords) {
    const id = harmonyId(chord);
    if (id === previous) continue;
    previous = id;
    seen.add(id);
  }
  return seen.size;
}

function harmonyId(chord: ChordSymbol): string {
  return `${((chord.root % 12) + 12) % 12}:${chord.quality}`;
}

/** `V → I` (major) or `V → i` (minor) between adjacent chords, only where the pair really occurs. */
function hasCadence(chords: readonly ChordSymbol[], tonic: number, mode: "major" | "minor"): boolean {
  for (let index = 1; index < chords.length; index += 1) {
    const previous = chords[index - 1]!;
    const current = chords[index]!;
    const isDominant = ((previous.root - tonic) % 12 + 12) % 12 === 7
      && DOMINANT_QUALITIES.has(previous.quality);
    if (!isDominant) continue;
    const atTonic = ((current.root - tonic) % 12 + 12) % 12 === 0;
    const arrival = mode === "major" ? MAJOR_ARRIVALS : MINOR_ARRIVALS;
    if (atTonic && arrival.has(current.quality)) return true;
  }
  return false;
}

function trimKey(key: string | undefined): string | undefined {
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The label the key select shows: 「自動: Cメジャー」/「自動: 未確定」 (through the app's existing
 * `displayKey`). It is display only — the session's origin is never written into the Vault (design §5).
 */
export function importKeyLabel(decision: ImportKeyDecision): string {
  if (decision.key) return `自動: ${displayKey(decision.key) ?? decision.key}`;
  return "自動: 未確定";
}
