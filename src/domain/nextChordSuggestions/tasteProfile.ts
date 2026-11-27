/**
 * P25 V23 Stage 2: the Vault taste profile (proposal v4 §7, v3 §4) with the three cues the accepted design
 * keeps — flow (2/3-gram), quality (tension-inclusive signature) and the degrees the person uses.
 *
 * The profile is built only from blocks that carry enough evidence (text saves are trusted, MIDI saves need
 * verified / pinned / edited or a 0.65 average confidence), a key must be readable, and a mode needs three
 * independent blocks before it may suggest anything. Everything is counted relative to that key, so the
 * hints transpose with the chart like the table candidates do.
 */
import { makeChordSymbol } from "../chords";
import { estimateCandidateKeys, familyOf, type EstimatedKey, type KeyMode, type QualityFamily } from "./estimateKey";
import { parseSuggestionKey, type TasteHints } from "./suggestNextChords";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import type { ChordQuality, ChordSymbol, Tension } from "../types";

export interface TasteBlock {
  readonly chords: readonly ChordSymbol[];
  readonly key?: string;
  readonly pinned?: boolean;
  readonly userVerified?: boolean;
  readonly userEdited?: boolean;
  readonly confidence?: number;
  readonly text?: boolean;
}

interface FlowCount {
  readonly weight: number;
  readonly blocks: Set<number>;
}

interface QualityCount {
  readonly signature: string;
  readonly family: QualityFamily;
  readonly weight: number;
  readonly blocks: Set<number>;
}

export interface TasteData {
  readonly mode: KeyMode;
  readonly blocks: number;
  readonly totalWeight: number;
  readonly flow2: ReadonlyMap<string, FlowCount>;
  readonly flow3: ReadonlyMap<string, FlowCount>;
  readonly qualities: ReadonlyMap<string, QualityCount>;
  readonly qualityFamilyWeight: ReadonlyMap<QualityFamily, number>;
  readonly degrees: ReadonlyMap<number, FlowCount>;
}

export interface VaultTasteProfile {
  readonly major?: TasteData;
  readonly minor?: TasteData;
}

/** v3 §4.1: the evidence rules. */
function usable(block: TasteBlock): boolean {
  if (block.chords.length < 2) return false;
  if (block.text) return true;
  if (block.pinned || block.userVerified || block.userEdited) return true;
  return (block.confidence ?? 0) >= 0.65;
}

/** The written signature distinguishes dom7sus4 from dom7sus4+13 and dom7 from 7alt (v4 §7.2-3). */
export function voicingQualityKey(chord: ChordSymbol): string {
  return [chord.quality, [...chord.tensions].sort().join(","), chord.altered ? "alt" : "", chord.bass === undefined ? "" : `/${chord.bass}`].join("|");
}

function bump(map: Map<string, FlowCount>, key: string, weight: number, block: number): void {
  const current = map.get(key) ?? { weight: 0, blocks: new Set<number>() };
  current.blocks.add(block);
  map.set(key, { weight: current.weight + weight, blocks: current.blocks });
}

function bumpDegree(map: Map<number, FlowCount>, key: number, weight: number, block: number): void {
  const current = map.get(key) ?? { weight: 0, blocks: new Set<number>() };
  current.blocks.add(block);
  map.set(key, { weight: current.weight + weight, blocks: current.blocks });
}

/** Builds the profile; blocks whose key cannot be read (and cannot be estimated confidently) are skipped. */
export function buildTasteProfile(blocks: readonly TasteBlock[]): VaultTasteProfile {
  const flow2: Record<KeyMode, Map<string, FlowCount>> = { major: new Map(), minor: new Map() };
  const flow3: Record<KeyMode, Map<string, FlowCount>> = { major: new Map(), minor: new Map() };
  const qualities: Record<KeyMode, Map<string, QualityCount>> = { major: new Map(), minor: new Map() };
  const familyWeight: Record<KeyMode, Map<QualityFamily, number>> = { major: new Map(), minor: new Map() };
  const degrees: Record<KeyMode, Map<number, FlowCount>> = { major: new Map(), minor: new Map() };
  const counts: Record<KeyMode, { blocks: number; weight: number }> = { major: { blocks: 0, weight: 0 }, minor: { blocks: 0, weight: 0 } };

  blocks.forEach((block, index) => {
    if (!usable(block)) return;
    const explicit = parseSuggestionKey(block.key);
    const estimated = explicit ?? estimateCandidateKeys(block.chords)?.keys[0];
    if (!estimated) return;
    const mode = estimated.mode;
    const weight = block.pinned || block.userVerified ? 2 : 1;
    counts[mode].blocks += 1;
    counts[mode].weight += weight;
    const relative = block.chords.map((chord) => ((chord.root - estimated.tonic) % 12 + 12) % 12);
    relative.forEach((deg) => bumpDegree(degrees[mode], deg, weight, index));
    for (let i = 0; i + 1 < relative.length; i += 1) bump(flow2[mode], `${relative[i]}>${relative[i + 1]}`, weight, index);
    for (let i = 0; i + 2 < relative.length; i += 1) bump(flow3[mode], `${relative[i]}>${relative[i + 1]}>${relative[i + 2]}`, weight, index);
    block.chords.forEach((chord) => {
      const signature = voicingQualityKey(chord);
      const family = familyOf(chord);
      const current = qualities[mode].get(signature) ?? { signature, family, weight: 0, blocks: new Set<number>() };
      current.blocks.add(index);
      qualities[mode].set(signature, { ...current, weight: current.weight + weight });
      familyWeight[mode].set(family, (familyWeight[mode].get(family) ?? 0) + weight);
    });
  });

  const result = (mode: KeyMode): TasteData | undefined => counts[mode].blocks >= 3 ? {
    mode, blocks: counts[mode].blocks, totalWeight: counts[mode].weight,
    flow2: flow2[mode], flow3: flow3[mode], qualities: qualities[mode], qualityFamilyWeight: familyWeight[mode], degrees: degrees[mode],
  } : undefined;
  const major = result("major");
  const minor = result("minor");
  return { ...(major === undefined ? {} : { major }), ...(minor === undefined ? {} : { minor }) };
}

/** The safe variants of v4 §7.2-4; a min7 → minMaj7 style change is deliberately absent. */
const VARIANTS: Readonly<Record<string, readonly string[]>> = {
  maj: ["maj9", "maj7+13", "add9", "sixNine"],
  maj7: ["maj9", "maj7+13", "add9", "sixNine"],
  min: ["min9", "min11"],
  min7: ["min9", "min11"],
  dom7: ["dom7+alt", "dom7+b13", "dom7+#9", "dom9", "dom13"],
  dom7sus4: ["dom7sus4+9", "dom7sus4+13"],
};

interface VariantSpec {
  readonly quality: ChordQuality;
  readonly tensions: readonly Tension[];
  readonly altered?: true;
}

const VARIANT_SPECS: Readonly<Record<string, VariantSpec>> = {
  maj9: { quality: "maj9", tensions: [] },
  "maj7+13": { quality: "maj7", tensions: ["13"] },
  add9: { quality: "add9", tensions: [] },
  sixNine: { quality: "sixNine", tensions: [] },
  min9: { quality: "min9", tensions: [] },
  min11: { quality: "min11", tensions: [] },
  "dom7+alt": { quality: "dom7", tensions: [], altered: true },
  "dom7+b13": { quality: "dom7", tensions: ["b13"] },
  "dom7+#9": { quality: "dom7", tensions: ["#9"] },
  dom9: { quality: "dom9", tensions: [] },
  dom13: { quality: "dom13", tensions: [] },
  "dom7sus4+9": { quality: "dom7sus4", tensions: ["9"] },
  "dom7sus4+13": { quality: "dom7sus4", tensions: ["13"] },
};

function variantChord(root: number, name: string): ChordSymbol | undefined {
  const spec = VARIANT_SPECS[name];
  if (spec === undefined) return undefined;
  const chord = makeChordSymbol(root, spec.quality, [...spec.tensions]);
  return spec.altered ? { ...chord, altered: true } : chord;
}

/** The most-used tension-inclusive signature of the candidate's family, when it clears 3 blocks and 35%. */
function dominantQuality(data: TasteData, family: QualityFamily): { signature: string; ratio: number; blocks: number } | undefined {
  const total = data.qualityFamilyWeight.get(family) ?? 0;
  if (total === 0) return undefined;
  let best: QualityCount | undefined;
  for (const entry of data.qualities.values()) {
    if (entry.family !== family || entry.blocks.size < 3) continue;
    if (best === undefined || entry.weight > best.weight) best = entry;
  }
  if (best === undefined) return undefined;
  return { signature: best.signature, ratio: best.weight / total, blocks: best.blocks.size };
}

/** The Stage 2 hints for one mode; undefined when fewer than three independent blocks support it. */
export function tasteHintsFor(profile: VaultTasteProfile, mode: KeyMode): TasteHints | undefined {
  const data = mode === "major" ? profile.major : profile.minor;
  if (data === undefined || data.blocks < 3) return undefined;
  const relative = (chords: readonly ChordSymbol[], key: EstimatedKey) => chords.map((chord) => ((chord.root - key.tonic) % 12 + 12) % 12);
  return {
    mode,
    preference: [...data.qualities.values()].sort((left, right) => right.weight - left.weight).map((entry) => entry.signature),
    flow: (previous, candidate, key) => {
      if (previous.length === 0) return 0;
      const degs = relative(previous, key);
      const cand = ((candidate.root - key.tonic) % 12 + 12) % 12;
      if (degs.length >= 2) {
        const w3 = data.flow3.get(`${degs[degs.length - 2]}>${degs[degs.length - 1]}>${cand}`)?.weight ?? 0;
        if (w3 > 0) return Math.min(50, Math.round(20 + 6 * w3));
      }
      const w2 = data.flow2.get(`${degs[degs.length - 1]}>${cand}`)?.weight ?? 0;
      return w2 > 0 ? Math.min(35, Math.round(10 + 4 * w2)) : 0;
    },
    quality: (candidate) => {
      const signature = voicingQualityKey(candidate);
      const family = familyOf(candidate);
      const total = data.qualityFamilyWeight.get(family) ?? 0;
      const entry = data.qualities.get(signature);
      if (total === 0 || entry === undefined || entry.blocks.size < 3) return 0;
      return Math.round((entry.weight / total) * 15);
    },
    degree: (candidate, key) => {
      const deg = ((candidate.root - key.tonic) % 12 + 12) % 12;
      const entry = data.degrees.get(deg);
      return entry === undefined || data.totalWeight === 0 ? 0 : Math.round((entry.weight / data.totalWeight) * 10);
    },
    variants: (candidate) => {
      const dominant = dominantQuality(data, familyOf(candidate));
      if (dominant === undefined || dominant.ratio < 0.35) return [];
      const allowed = VARIANTS[dominant.signature.split("|")[0]!];
      if (allowed === undefined) return [];
      return allowed
        .map((name) => variantChord(candidate.root, name))
        .filter((chord): chord is ChordSymbol => chord !== undefined)
        .filter((chord) => parseExtendedTextChordLabel(chord.label) !== undefined);
    },
  };
}
