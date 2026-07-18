import { degreeOf } from "../harmony/degrees";
import type { ChordQuality, ChordSymbol } from "../types";
import { PROGRESSION_TAXONOMY_VERSION, getProgressionTagDefinition } from "./taxonomy";
import type { DerivedProgressionTag, ProgressionClassificationInput } from "./types";

export const MOOD_CONFIDENCE_THRESHOLD = 0.78;
const MAX_MOOD_TAGS = 2;

const brightQualities = new Set<ChordQuality>(["maj", "maj7", "maj9", "add9", "six", "sixNine"]);
const darkQualities = new Set<ChordQuality>(["min", "min7", "min9", "min11", "min6", "dim", "dim7", "min7b5"]);
const dreamyQualities = new Set<ChordQuality>(["maj7", "maj9", "min9", "min11", "add9", "sus2", "sus4"]);
const warmQualities = new Set<ChordQuality>(["maj7", "maj9", "add9", "six", "sixNine"]);
const tenseQualities = new Set<ChordQuality>(["dom7", "dom9", "dom13", "dim", "dim7", "min7b5", "aug"]);
const floatingQualities = new Set<ChordQuality>(["sus2", "sus4", "add9", "sixNine"]);
const dominantQualities = new Set<ChordQuality>(["dom7", "dom9", "dom13", "dom7sus4"]);
const alteredTensions = new Set(["b9", "#9", "#11", "b13"]);

interface MoodCandidate {
  tagId: string;
  confidence: number;
  reason: string;
}

export function deriveMoodTags(input: ProgressionClassificationInput): DerivedProgressionTag[] {
  const chords = input.block.chords.map((item) => item.chord);
  if (chords.length < 3) return [];
  const candidates: MoodCandidate[] = [];
  const key = input.key ?? input.block.detectedKey;
  const majorRatio = ratio(chords, (chord) => brightQualities.has(chord.quality));
  const minorRatio = ratio(chords, (chord) => darkQualities.has(chord.quality));
  const dreamyRatio = ratio(chords, (chord) => dreamyQualities.has(chord.quality));
  const warmRatio = ratio(chords, (chord) => warmQualities.has(chord.quality));
  const tenseRatio = ratio(chords, isTenseChord);
  const floatingRatio = ratio(chords, (chord) => floatingQualities.has(chord.quality) || isSlashChord(chord));
  const dominantRatio = ratio(chords, (chord) => dominantQualities.has(chord.quality));
  const chromaticRatio = key
    ? ratio(chords, (chord) => (degreeOf(chord, key)?.accidental ?? 0) !== 0)
    : 0;
  const unusualRatio = ratio(chords, (chord) => chord.quality === "dim" || chord.quality === "dim7" || chord.quality === "aug") + chromaticRatio;

  if (key && majorRatio >= 0.75 && chromaticRatio === 0) {
    candidates.push(candidate("mood.bright", confidence(majorRatio), "At least 75% of the chords are major-color chords and all roots are diatonic."));
  }
  if (minorRatio >= 0.75) {
    candidates.push(candidate("mood.dark", confidence(minorRatio), "At least 75% of the chords use minor or diminished color."));
  }
  if (dreamyRatio >= 0.75) {
    candidates.push(candidate("mood.dreamy", confidence(dreamyRatio), "At least 75% of the chords use seventh, ninth, eleventh, add9, or suspended color."));
  }
  if (warmRatio >= 0.75) {
    candidates.push(candidate("mood.warm", confidence(warmRatio), "At least 75% of the chords use major seventh, ninth, sixth, or add9 color."));
  }
  if (tenseRatio >= 0.6) {
    candidates.push(candidate("mood.tense", confidence(tenseRatio), "At least 60% of the chords use dominant, altered, diminished, or augmented tension."));
  }
  if (unusualRatio >= 0.5) {
    candidates.push(candidate("mood.mysterious", confidence(Math.min(1, unusualRatio)), "At least half of the progression uses chromatic, diminished, or augmented evidence."));
  }
  if (floatingRatio >= 0.75) {
    candidates.push(candidate("mood.floating", confidence(floatingRatio), "At least 75% of the chords use suspended, add9, 6/9, or non-root bass color."));
  }
  if (key && dominantRatio >= 0.5 && chromaticRatio >= 0.25) {
    candidates.push(candidate("mood.dramatic", 0.82, "The progression combines frequent dominant motion with chromatic roots."));
  }

  return candidates
    .filter((entry) => entry.confidence >= MOOD_CONFIDENCE_THRESHOLD)
    .sort((left, right) => right.confidence - left.confidence || left.tagId.localeCompare(right.tagId))
    .slice(0, MAX_MOOD_TAGS)
    .flatMap((entry) => {
      const definition = getProgressionTagDefinition(entry.tagId);
      return definition ? [{
        tagId: entry.tagId,
        category: "mood" as const,
        source: "derived" as const,
        confidence: entry.confidence,
        taxonomyVersion: PROGRESSION_TAXONOMY_VERSION,
        reasons: [entry.reason],
      }] : [];
    });
}

function ratio(chords: readonly ChordSymbol[], predicate: (chord: ChordSymbol) => boolean): number {
  return chords.filter(predicate).length / chords.length;
}

function isSlashChord(chord: ChordSymbol): boolean {
  return chord.bass !== undefined && chord.bass !== chord.root;
}

function isTenseChord(chord: ChordSymbol): boolean {
  return tenseQualities.has(chord.quality)
    || chord.tensions.some((tension) => alteredTensions.has(tension));
}

function confidence(value: number): number {
  return Math.min(0.96, 0.78 + Math.max(0, value - 0.75) * 0.72);
}

function candidate(tagId: string, value: number, reason: string): MoodCandidate {
  return { tagId, confidence: value, reason };
}
