/**
 * P25 V23 Stage 1: the next-chord suggestions (proposal v4 §2–§4, v3 §3.1–§3.5).
 *
 * Pure TypeScript. The key estimate is internal (it never reaches `keyDecision.key`), the fit score is
 * frozen before the texture conversion, and the selection is the proposal's five slots with a fully
 * deterministic order (score, fit score, taste score, relative degree, quality signature).
 */
import { formatChordSymbol, normalizePc } from "../chords";
import { chordIdentityKey, normalizeChordSymbol } from "../chordIdentity";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import { defaultCardNotes } from "../textCardSound";
import type { ChordSymbol } from "../types";
import { estimateCandidateKeys, familyOf, keyContextFor, type EstimatedKey, type KeyMode, type QualityFamily } from "./estimateKey";
import {
  candidateChord, convertQuality, fallbackRows, keyChordsFor, loopClosingCandidates, reasonFor, textureOfChords, threeGramPatterns, transitionRows,
  type BaseQuality, type CandidateCategory, type SuggestionCategory, type Texture, type TransitionRow,
} from "./harmonyTables";

export interface NextChordInput {
  /** The written chords (rests removed). */
  readonly chords: readonly ChordSymbol[];
  /** A manual / confirmed key such as "C major" or "A minor"; when absent the internal estimate is used. */
  readonly keySignature?: string;
  /** 1-based number of the bar the new chord goes into. */
  readonly nextBarNumber: number;
  readonly beatsPerBar: number;
  /** Beats already used in the open (pending) bar; 0 when the next chord opens a new bar. */
  readonly filledBeats?: number;
  /** The length the palette will add (defaults to a whole bar). */
  readonly lengthBeats?: number;
  /** Stage 2: the Vault taste profile; absent in Stage 1. */
  readonly taste?: TasteHints;
}

export interface NextChordSuggestion {
  readonly chord: ChordSymbol;
  readonly label: string;
  readonly category: SuggestionCategory;
  readonly fitScore: number;
  readonly tasteScore: number;
  readonly reason: string;
  readonly key: EstimatedKey;
}

/** Stage 2 fills this; Stage 1 passes nothing and every taste score is 0. */
export interface TasteHints {
  readonly mode: KeyMode;
  readonly flow: (previous: readonly ChordSymbol[], candidate: ChordSymbol, key: EstimatedKey) => number;
  readonly quality: (candidate: ChordSymbol, key: EstimatedKey) => number;
  readonly degree: (candidate: ChordSymbol, key: EstimatedKey) => number;
  readonly variants: (candidate: ChordSymbol, key: EstimatedKey) => readonly ChordSymbol[];
  readonly preference: readonly string[];
}

interface Candidate {
  chord: ChordSymbol;
  label: string;
  category: SuggestionCategory;
  fitScore: number;
  tasteScore: number;
  key: EstimatedKey;
  gram: boolean;
  loop: boolean;
  injected: boolean;
  baseQuality: BaseQuality;
}

const ROOTS: Readonly<Record<string, number>> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function parseSuggestionKey(value: string | undefined): EstimatedKey | undefined {
  if (!value) return undefined;
  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|\s*(m))?$/i.exec(value.trim().replace(/♯/g, "#").replace(/♭/g, "b"));
  if (!match) return undefined;
  const tonic = ROOTS[match[1]];
  if (tonic === undefined) return undefined;
  return { tonic, mode: match[2]?.toLowerCase() === "minor" || Boolean(match[3]) ? "minor" : "major" };
}

function baseFamily(base: BaseQuality): QualityFamily {
  if (base === "min7b5" || base === "dim7") return "dim";
  if (base === "min6" || base === "min7") return "min";
  if (base === "aug") return "aug";
  if (base === "dom7" || base === "dom7sus4" || base === "dom9") return "dom";
  return "maj";
}

function textureOf(chords: readonly ChordSymbol[]): Texture {
  const rich = new Set(["maj9", "min9", "min11", "dom9", "dom13", "dom11", "add9", "sixNine"]);
  if (chords.some((chord) => rich.has(chord.quality) || chord.altered || chord.tensions.length > 0)) return "rich";
  const triad = new Set(["maj", "min", "sus2", "sus4", "power"]);
  if (chords.length > 0 && chords.filter((chord) => triad.has(chord.quality)).length / chords.length >= 0.6) return "triad";
  return "seventh";
}

function keyOfChord(chord: ChordSymbol, key: EstimatedKey): number {
  return normalizePc(chord.root - key.tonic);
}

function sameIdentity(left: ChordSymbol, right: ChordSymbol): boolean {
  return chordIdentityKey(normalizeChordSymbol(left)) === chordIdentityKey(normalizeChordSymbol(right));
}

function identity(chord: ChordSymbol): string {
  return chordIdentityKey(normalizeChordSymbol(chord));
}

function qualitySignature(chord: ChordSymbol, key: EstimatedKey): string {
  return [
    chord.quality,
    [...chord.tensions].sort().join(","),
    chord.altered ? "alt" : "",
    chord.bass === undefined ? "" : String(keyOfChord(chord, key)),
  ].join("|");
}

function gramMatches(mode: KeyMode, a: ChordSymbol, b: ChordSymbol, nextDeg: number, nextFamily: QualityFamily, key: EstimatedKey, bassRelative: number | null): boolean {
  return threeGramPatterns(mode).some((pattern) => pattern.aDeg === keyOfChord(a, key)
    && pattern.aFamilies.includes(familyOf(a))
    && pattern.bDeg === keyOfChord(b, key)
    && pattern.bFamilies.includes(familyOf(b))
    && pattern.nextDeg === nextDeg
    && pattern.nextFamilies.includes(nextFamily)
    && pattern.bassRelative === bassRelative);
}

function loopBonus(first: ChordSymbol, candidate: ChordSymbol, key: EstimatedKey): number {
  const root = normalizePc(candidate.root);
  if (root === normalizePc(first.root + 7) && familyOf(candidate) === "dom") return 28;
  if (root === normalizePc(first.root + 1) && familyOf(candidate) === "dom") return 22;
  if (key.mode === "major" && keyOfChord(first, key) === 0 && familyOf(first) === "maj") {
    if (root === normalizePc(key.tonic + 5) && familyOf(candidate) === "min") return 16;
    if (root === normalizePc(key.tonic + 10) && familyOf(candidate) === "dom") return 16;
  }
  return 0;
}

function isSmooth(previous: ChordSymbol, next: ChordSymbol): boolean {
  const before = defaultCardNotes(previous);
  const after = defaultCardNotes(next);
  if (before.length === 0 || after.length === 0) return false;
  const bassMove = Math.abs(after[0]! - before[0]!);
  if (bassMove >= 1 && bassMove <= 2) return true;
  const common = [...new Set(before.map((note) => ((note % 12) + 12) % 12))]
    .filter((pc) => new Set(after.map((note) => ((note % 12) + 12) % 12)).has(pc)).length;
  if (common < 2) return false;
  const upperAfter = after.slice(1);
  const upperBefore = before.slice(1);
  if (upperAfter.length === 0 || upperBefore.length === 0) return false;
  let total = 0;
  for (const note of upperAfter) {
    total += Math.min(...upperBefore.map((other) => Math.abs(note - other)));
  }
  return total / upperAfter.length <= 2;
}

export function suggestNextChords(input: NextChordInput): NextChordSuggestion[] {
  const { chords, beatsPerBar } = input;
  if (chords.length === 0) return [];
  const previous = chords[chords.length - 1]!;
  const beforePrevious = chords.length >= 2 ? chords[chords.length - 2]! : undefined;
  const explicit = parseSuggestionKey(input.keySignature);
  // V25-4: one key for every candidate (its degrees, the heading and the seven chords all read the same key):
  // the screen's key when it is decided, otherwise the estimate's first place.
  const estimated = explicit ? undefined : estimateCandidateKeys(chords);
  const estimate = explicit ? { keys: [explicit], confident: true } : estimated && { keys: estimated.keys.slice(0, 1), confident: estimated.confident };
  if (!estimate) return [];
  const texture = textureOf(chords);
  const first = chords[0]!;
  const filled = input.filledBeats ?? 0;
  const lengthBeats = input.lengthBeats ?? beatsPerBar;
  const isLoopClosing = input.nextBarNumber % 4 === 0 && filled + lengthBeats >= beatsPerBar;

  const candidates: Candidate[] = [];
  const consensus = new Map<string, Set<number>>();
  for (const [keyIndex, key] of estimate.keys.entries()) {
    const mode = key.mode;
    const prevDeg = keyOfChord(previous, key);
    const prevFamily = familyOf(previous);
    const rows = transitionRows(mode).filter((row) => row.prevDeg === prevDeg && row.prevFamily === prevFamily);
    const usable = rows.length > 0 ? rows : fallbackRows(mode, prevDeg, prevFamily);
    for (const row of usable) {
      addFromRow(row, key, keyIndex, 0, false);
    }
    for (const loop of loopClosingCandidates(first, key)) {
      const row: TransitionRow = {
        prevDeg, prevFamily, nextDeg: normalizePc(loop.nextDeg - key.tonic), baseQuality: loop.baseQuality,
        bassRelative: null, category: loop.category, points: loop.points,
      };
      addFromRow(row, key, keyIndex, 0, true);
    }
  }

  function addFromRow(row: TransitionRow, key: EstimatedKey, keyIndex: number, extra: number, loop: boolean): void {
    const root = normalizePc(key.tonic + row.nextDeg);
    const bass = row.bassRelative === null ? undefined : normalizePc(root + row.bassRelative);
    const converted = convertQuality(row.baseQuality, texture, key.mode, row.nextDeg);
    const baseChord = candidateChord(root, converted, bass);
    const nextFamily = baseFamily(row.baseQuality);
    const gram = !loop && beforePrevious !== undefined
      && gramMatches(key.mode, beforePrevious, previous, row.nextDeg, nextFamily, key, row.bassRelative);
    let fitScore = row.points + (gram ? 25 : 0) + extra;
    if (isLoopClosing) fitScore += loopBonus(first, baseChord, key);
    if (!isLoopClosing && beforePrevious !== undefined && sameIdentity(baseChord, beforePrevious)) fitScore -= 15;
    if (fitScore < 40) return;
    const signature = `${identity(baseChord)}|${bass ?? ""}`;
    const keys = consensus.get(signature) ?? new Set<number>();
    keys.add(keyIndex);
    consensus.set(signature, keys);
    candidates.push({
      chord: baseChord,
      label: "",
      category: row.category,
      fitScore,
      tasteScore: 0,
      key,
      gram,
      loop: isLoopClosing && loopBonus(first, baseChord, key) > 0,
      injected: loop,
      baseQuality: row.baseQuality,
    });
  }

  // 2 distinct keys that produced the same candidate give it +12 (the consensus bonus is applied once).
  for (const candidate of candidates) {
    const keys = consensus.get(`${identity(candidate.chord)}|${candidate.chord.bass ?? ""}`);
    if (keys !== undefined && keys.size >= 2) candidate.fitScore += 12;
  }

  // Spell every candidate in its key, validate the written label, and merge duplicates (keep the best fit).
  const merged = new Map<string, Candidate>();
  for (const candidate of candidates) {
    let label = formatChordSymbol(candidate.chord, { keyContext: keyContextFor(candidate.key) });
    let parsed = parseExtendedTextChordLabel(label);
    if (!parsed) {
      const fallback = convertQuality(candidate.baseQuality, "seventh", candidate.key.mode, keyOfChord(candidate.chord, candidate.key));
      const chord = candidateChord(candidate.chord.root, fallback, candidate.chord.bass);
      label = formatChordSymbol(chord, { keyContext: keyContextFor(candidate.key) });
      parsed = parseExtendedTextChordLabel(label);
      if (!parsed) continue;
      candidate.chord = chord;
    }
    const spelled = { ...parsed, label };
    if (sameIdentity(spelled, previous)) continue;
    const key = identity(spelled);
    const existing = merged.get(key);
    if (existing === undefined || candidate.fitScore > existing.fitScore) {
      merged.set(key, { ...candidate, chord: spelled, label });
    }
  }

  // 「なめらか」 must really be smooth with the preview notes, otherwise it is demoted to 展開.
  const basePool = [...merged.values()].map((candidate) => {
    if (candidate.category === "なめらか" && !isSmooth(previous, candidate.chord)) {
      return { ...candidate, category: "展開" as const };
    }
    return candidate;
  });
  // v4 §3.2 Step 3 (V24-3): the previous chord's root (and bass) never comes back, except the chromatic
  // mediant (IVmaj → IVm) and the passing (I → Iaug). The rule also covers the loop-closing injections.
  const sameRootAllowed = (candidate: Candidate): boolean => {
    if (normalizePc(candidate.chord.root) !== normalizePc(previous.root)) return true;
    if (normalizePc(candidate.chord.bass ?? candidate.chord.root) !== normalizePc(previous.bass ?? previous.root)) return true;
    const prevFamily = familyOf(previous);
    const nextFamily = familyOf(candidate.chord);
    return prevFamily === "maj" && (nextFamily === "min" || nextFamily === "aug");
  };
  const pool = basePool.filter(sameRootAllowed);

  // V24-4: when the tables leave fewer than five candidates, the key's own seven chords fill the rest
  // (45 points, still passing fitScore >= 40 and the same-root rule).
  if (pool.length < 5) {
    const used = new Set(pool.map((candidate) => identity(candidate.chord)));
    const texture = textureOfChords(chords);
    for (const key of estimate.keys) {
      if (pool.length >= 5) break;
      for (const entry of keyChordsFor(key, texture)) {
        if (pool.length >= 5) break;
        const label = formatChordSymbol(entry.chord, { keyContext: keyContextFor(key) });
        const parsed = parseExtendedTextChordLabel(label);
        if (!parsed) continue;
        const chord = { ...parsed, label };
        if (used.has(identity(chord)) || sameIdentity(chord, previous)) continue;
        const candidate: Candidate = {
          chord, label, category: "定番", fitScore: 45, tasteScore: 0, key, gram: false, loop: false, injected: false, baseQuality: "maj7",
        };
        if (!sameRootAllowed(candidate)) continue;
        used.add(identity(chord));
        pool.push(candidate);
      }
    }
  }

  // Stage 2: taste scores and the varied forms (only for candidates that already passed the harmonic filter).
  const taste = input.taste;
  if (taste) {
    for (const candidate of pool) {
      const score = taste.flow(chords, candidate.chord, candidate.key)
        + taste.quality(candidate.chord, candidate.key)
        + taste.degree(candidate.chord, candidate.key);
      candidate.tasteScore = score;
    }
    // The quality-leading variants of the person's Vault are only ever candidates for the 好み slot; each
    // one is written again, parsed and scored like the table candidates.
    const extra: Candidate[] = [];
    for (const candidate of pool) {
      for (const variant of taste.variants(candidate.chord, candidate.key)) {
        const label = formatChordSymbol(variant, { keyContext: keyContextFor(candidate.key) });
        const parsed = parseExtendedTextChordLabel(label);
        if (!parsed || sameIdentity(parsed, previous)) continue;
        const chord = { ...parsed, label };
        if (pool.some((entry) => identity(entry.chord) === identity(chord)) || extra.some((entry) => identity(entry.chord) === identity(chord))) continue;
        const score = taste.flow(chords, chord, candidate.key)
          + taste.quality(chord, candidate.key)
          + taste.degree(chord, candidate.key);
        extra.push({ ...candidate, chord, label, tasteScore: score, category: "好み" });
      }
    }
    pool.push(...extra);
  }

  const score = (entry: Candidate) => entry.category === "好み" ? entry.tasteScore * 2 + entry.fitScore * 0.5 : entry.fitScore;
  const sorted = (items: Candidate[]) => [...items].sort((left, right) => {
    return score(right) - score(left)
      || right.fitScore - left.fitScore
      || right.tasteScore - left.tasteScore
      || keyOfChord(left.chord, left.key) - keyOfChord(right.chord, right.key)
      || qualitySignature(left.chord, left.key).localeCompare(qualitySignature(right.chord, right.key));
  });

  const byCategory = (category: CandidateCategory) => sorted(pool.filter((candidate) => candidate.category === category));
  const chosen: Candidate[] = [];
  // V25-5: the Vault's taste variant of a chord (Fadd9 for Fmaj7) never sits beside it in the five; the higher one stays.
  const sameRootBass = (left: Candidate, right: Candidate) => normalizePc(left.chord.root) === normalizePc(right.chord.root)
    && normalizePc(left.chord.bass ?? left.chord.root) === normalizePc(right.chord.bass ?? right.chord.root);
  const take = (candidate: Candidate | undefined) => {
    if (!candidate || chosen.some((entry) => identity(entry.chord) === identity(candidate.chord))) return false;
    chosen.push(candidate);
    return true;
  };

  const def = byCategory("定番");
  take(def[0]);
  // A loop-closing bar puts the explicitly injected candidates first (v4 change 5), so a bar that closes a
  // four-bar loop can always offer its dominant, sus4, tritone substitute and subdominant minor.
  if (isLoopClosing) {
    for (const candidate of sorted(pool.filter((entry) => entry.injected))) {
      if (chosen.length >= 4) break;
      take(candidate);
    }
  }
  const second = def.find((candidate) => candidate.chord.root !== def[0]?.chord.root) ?? def[1];
  if (chosen.length < 5) take(second);
  if (chosen.length < 5) take(byCategory("展開")[0]);
  if (chosen.length < 5) take(byCategory("なめらか")[0]);
  if (taste && chosen.length < 5) {
    const liked = sorted(pool.filter((candidate) => candidate.tasteScore >= 12))
      .sort((left, right) => (right.tasteScore * 2 + right.fitScore * 0.5) - (left.tasteScore * 2 + left.fitScore * 0.5))[0];
    if (liked) {
      const already = chosen.find((entry) => identity(entry.chord) === identity(liked.chord));
      const sameRoot = chosen.findIndex((entry) => sameRootBass(entry, liked));
      if (already) already.category = "好み";
      else if (sameRoot >= 0) {
        // The higher-scoring one of the two stays, and it is the one marked 好み.
        if (score(liked) > score(chosen[sameRoot]!)) chosen[sameRoot] = { ...liked, category: "好み" };
      } else chosen.push({ ...liked, category: "好み" });
    }
  }
  if (chosen.length < 5) {
    // 好み is only ever the one slot above, so the varied forms (category 好み) are not used to fill.
    for (const candidate of sorted(pool.filter((entry) => entry.category !== "好み"))) {
      if (chosen.length >= 5) break;
      if (chosen.some((entry) => entry.category === "好み" && sameRootBass(entry, candidate))) continue;
      take(candidate);
    }
  }

  return chosen.map((candidate) => ({
    chord: candidate.chord,
    label: candidate.label,
    category: candidate.category,
    fitScore: Math.round(candidate.fitScore),
    tasteScore: Math.round(candidate.tasteScore),
    reason: reasonFor(candidate.category, { gram: candidate.gram, loop: candidate.loop }),
    key: candidate.key,
  }));
}
