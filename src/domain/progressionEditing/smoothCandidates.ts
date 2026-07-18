import { canonicalChordAlternative } from "../chordAlternatives";
import { makeChordSymbol, normalizePc } from "../chords";
import type { ChordQuality, ChordSymbol, Tension } from "../types";
import { contextualChordPool, parseKeySignature } from "./chordSuggestions";
import {
  quickChordCandidate,
  type QuickChordCandidate,
  type QuickChordCandidateReason,
} from "./quickCandidates";

interface CanonicalVoicing {
  bass: number;
  upper: number[];
  top: number;
  chord: ChordSymbol;
}

export interface CanonicalPairAnalysis {
  commonToneCount: number;
  totalVoiceMovement: number;
  topVoiceMovement: number;
  bassMovement: number;
  guideToneStepCount: number;
  lowRegisterCollision: boolean;
}

export interface SmoothCandidateInput {
  previousChord?: ChordSymbol;
  currentChord: ChordSymbol;
  nextChord?: ChordSymbol;
  progression: readonly ChordSymbol[];
  targetIndex: number;
  keySignature?: string;
  durationBeats: number;
  analyzerCandidates?: readonly ChordSymbol[];
  loop?: boolean;
}

export function generateSmoothCandidates(input: SmoothCandidateInput): QuickChordCandidate[] {
  if (input.durationBeats <= 0) return [];
  const previous = input.previousChord
    ?? (input.loop ? input.progression[input.progression.length - 1] : undefined);
  const next = input.nextChord
    ?? (input.loop ? input.progression[0] : undefined);
  const currentKey = canonicalChordAlternative(input.currentChord);
  const candidates = smoothCandidatePool(input.currentChord, input.keySignature, input.analyzerCandidates)
    .filter((chord) => canonicalChordAlternative(chord) !== currentKey)
    .filter(isHardValidChord);
  const ranked = candidates.map((chord) => smoothScore({
    chord,
    previous,
    next,
    keySignature: input.keySignature,
  })).sort((left, right) => right.score - left.score
    || left.key.localeCompare(right.key));

  return ranked.map((entry, index) => quickChordCandidate({
    chord: entry.chord,
    source: "smoothConnection",
    sourceScore: entry.score,
    sourceRank: index,
    reasons: entry.reasons,
  }));
}

export function analyzeCanonicalVoicingPair(
  leftChord: ChordSymbol,
  rightChord: ChordSymbol,
): CanonicalPairAnalysis {
  const left = canonicalVoicing(leftChord);
  const right = canonicalVoicing(rightChord);
  const assignment = minimumMovement(left.upper, right.upper);
  const rightPitchClasses = new Set(chordPitchClasses(rightChord));
  const commonToneCount = chordPitchClasses(leftChord)
    .filter((pitchClass) => rightPitchClasses.has(pitchClass)).length;
  const guideToneStepCount = assignment.filter(([from, to]) => (
    isGuideTone(from, leftChord) && Math.abs(to - from) <= 2
  )).length;
  const low = [right.bass, ...right.upper].filter((note) => note < 48).sort((a, b) => a - b);
  return {
    commonToneCount,
    totalVoiceMovement: assignment.reduce((sum, [from, to]) => sum + Math.abs(to - from), 0),
    topVoiceMovement: Math.abs(right.top - left.top),
    bassMovement: Math.abs(right.bass - left.bass),
    guideToneStepCount,
    lowRegisterCollision: low.some((note, index) => index > 0 && note - low[index - 1]! <= 2),
  };
}

function smoothScore({
  chord,
  previous,
  next,
  keySignature,
}: {
  chord: ChordSymbol;
  previous?: ChordSymbol;
  next?: ChordSymbol;
  keySignature?: string;
}) {
  const pairs = [
    ...(previous ? [analyzeCanonicalVoicingPair(previous, chord)] : []),
    ...(next ? [analyzeCanonicalVoicingPair(chord, next)] : []),
  ];
  const commonToneBonus = sum(pairs, (pair) => pair.commonToneCount * 15);
  const guideToneBonus = sum(pairs, (pair) => pair.guideToneStepCount * 10);
  const smoothTopBonus = sum(pairs, (pair) => pair.topVoiceMovement <= 2 ? 4 : 0);
  const movementCost = sum(pairs, (pair) => pair.totalVoiceMovement);
  const topLeapCost = sum(pairs, (pair) => pair.topVoiceMovement > 7
    ? 10 + pair.topVoiceMovement
    : 0);
  const bassMotionCost = sum(pairs, (pair) => pair.bassMovement);
  const rootMotionCost = [previous, next].flatMap((neighbor) => neighbor
    ? [circularDistance(neighbor.root, chord.root)]
    : []).reduce((total, value) => total + value, 0);
  const collisionPenalty = pairs.some((pair) => pair.lowRegisterCollision) ? 100 : 0;
  const foreignToneCount = countForeignTones(chord, keySignature);
  const keyCompatibilityBonus = foreignToneCount === 0 && parseKeySignature(keySignature) ? 8 : 0;
  const score = commonToneBonus + guideToneBonus + smoothTopBonus + keyCompatibilityBonus
    - movementCost - topLeapCost - bassMotionCost - rootMotionCost
    - collisionPenalty - foreignToneCount * 4;
  const reasons: QuickChordCandidateReason[] = [
    { code: "common-tones", labelKey: "quickCandidate.reason.commonTones", value: commonToneBonus / 15 },
    { code: "voice-movement", labelKey: "quickCandidate.reason.voiceMovement", value: movementCost },
    { code: "bass-movement", labelKey: "quickCandidate.reason.bassMovement", value: bassMotionCost },
    { code: "guide-tone", labelKey: "quickCandidate.reason.guideTone", value: guideToneBonus / 10 },
  ];
  return { chord, key: canonicalChordAlternative(chord), score, reasons };
}

function smoothCandidatePool(
  current: ChordSymbol,
  keySignature?: string,
  analyzerCandidates: readonly ChordSymbol[] = [],
): ChordSymbol[] {
  const family = qualityFamily(current.quality);
  const sameRootQualities: ChordQuality[] = family === "minor"
    ? ["min9", "min11", "min7", "min6", "min"]
    : family === "dominant"
      ? ["dom13", "dom9", "dom7sus4", "dom7", "sus4"]
      : ["maj9", "add9", "six", "maj7", "maj"];
  const base = [
    ...analyzerCandidates,
    ...sameRootQualities.map((quality) => makeChordSymbol(current.root, quality)),
    ...contextualChordPool(current, keySignature),
  ];
  const inversions = base.flatMap((chord) => chordInversions(chord));
  const seen = new Set<string>();
  return [...base, ...inversions].flatMap((chord) => {
    const key = canonicalChordAlternative(chord);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...chord, tensions: [...chord.tensions] }];
  }).slice(0, 50);
}

function chordInversions(chord: ChordSymbol): ChordSymbol[] {
  const tones = chordPitchClasses(chord).filter((pitchClass) => pitchClass !== chord.root);
  return tones.slice(0, 2).map((bass) => makeChordSymbol(
    chord.root,
    chord.quality,
    [...chord.tensions],
    bass,
  ));
}

function canonicalVoicing(chord: ChordSymbol): CanonicalVoicing {
  const bassPc = chord.bass ?? chord.root;
  const bass = nearestPitch(bassPc, 36, 47, 40);
  const pitchClasses = chordPitchClasses(chord)
    .filter((pitchClass) => pitchClass !== normalizePc(bassPc));
  const upper = pitchClasses.slice(0, 5).map((pitchClass, index) => (
    nearestPitch(pitchClass, 48, 76, 52 + index * 4)
  )).sort((left, right) => left - right);
  if (upper.length < 2) {
    upper.push(nearestPitch(chord.root, 60, 76, 64));
  }
  return { bass, upper, top: upper[upper.length - 1]!, chord };
}

function chordPitchClasses(chord: ChordSymbol): number[] {
  const [third, fifth, seventh] = qualityIntervals(chord.quality);
  const tensionIntervals: Record<Tension, number> = {
    "9": 2, b9: 1, "#9": 3, "11": 5, "#11": 6, "13": 9, b13: 8,
  };
  return [...new Set([
    chord.root,
    normalizePc(chord.root + third),
    normalizePc(chord.root + fifth),
    ...(seventh === undefined ? [] : [normalizePc(chord.root + seventh)]),
    ...chord.tensions.map((tension) => normalizePc(chord.root + tensionIntervals[tension])),
  ])];
}

function qualityIntervals(quality: ChordQuality): [number, number, number?] {
  const third = quality === "min" || quality.startsWith("min") || quality === "dim" || quality === "dim7"
    ? 3
    : quality === "sus2"
      ? 2
      : quality === "sus4" || quality === "dom7sus4"
        ? 5
        : 4;
  const fifth = quality === "dim" || quality === "dim7" || quality === "min7b5"
    ? 6
    : quality === "aug"
      ? 8
      : 7;
  const seventh = quality === "maj7" || quality === "maj9"
    ? 11
    : quality === "min7" || quality === "min9" || quality === "min11"
      || quality === "min7b5" || quality === "dim7" || quality.startsWith("dom")
      ? 10
      : undefined;
  return [third, fifth, seventh];
}

function isHardValidChord(chord: ChordSymbol): boolean {
  if (chord.bass === undefined) return true;
  return chordPitchClasses(chord).includes(normalizePc(chord.bass));
}

function countForeignTones(chord: ChordSymbol, keySignature?: string): number {
  const key = parseKeySignature(keySignature);
  if (!key) return 0;
  const scale = new Set((key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11])
    .map((interval) => normalizePc(key.root + interval)));
  return chordPitchClasses(chord).filter((pitchClass) => !scale.has(pitchClass)).length;
}

function minimumMovement(left: readonly number[], right: readonly number[]): Array<[number, number]> {
  const source = left.length <= right.length ? [...left] : [...right];
  const target = left.length <= right.length ? [...right] : [...left];
  const available = [...target];
  return source.flatMap((note) => {
    available.sort((a, b) => Math.abs(a - note) - Math.abs(b - note) || a - b);
    const nearest = available.shift();
    if (nearest === undefined) return [];
    return [left.length <= right.length ? [note, nearest] : [nearest, note]];
  });
}

function isGuideTone(note: number, chord: ChordSymbol): boolean {
  const interval = normalizePc(note - chord.root);
  return interval === 3 || interval === 4 || interval === 10 || interval === 11;
}

function nearestPitch(pitchClass: number, min: number, max: number, target: number): number {
  const candidates = Array.from({ length: max - min + 1 }, (_, index) => min + index)
    .filter((note) => normalizePc(note) === normalizePc(pitchClass));
  return candidates.sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right)[0]!;
}

function circularDistance(left: number, right: number): number {
  const distance = Math.abs(normalizePc(left) - normalizePc(right));
  return Math.min(distance, 12 - distance);
}

function qualityFamily(quality: ChordQuality): "major" | "minor" | "dominant" {
  if (quality === "min" || quality.startsWith("min") || quality === "dim" || quality === "dim7") return "minor";
  if (quality.startsWith("dom")) return "dominant";
  return "major";
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
