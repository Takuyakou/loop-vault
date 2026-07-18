import { degreeOf } from "../harmony/degrees";
import type { ChordQuality, ChordSymbol } from "../types";
import { PROGRESSION_TAXONOMY_VERSION, getProgressionTagDefinition } from "./taxonomy";
import type { DerivedProgressionTag, ProgressionClassificationInput } from "./types";

const dominantQualities = new Set<ChordQuality>(["dom7", "dom9", "dom13", "dom7sus4"]);
const alteredTensions = new Set(["b9", "#9", "#11", "b13"]);

export function deriveFeatureTags(
  input: ProgressionClassificationInput,
): DerivedProgressionTag[] {
  const chords = input.block.chords.map((item) => item.chord);
  if (chords.length === 0) return [];
  const tags: DerivedProgressionTag[] = [];

  if (chords.some(hasMajorExtension)) push(tags, "feature.maj7-9", "Contains a major seventh or major ninth sonority.");
  if (chords.some(hasMinorExtension)) push(tags, "feature.minor9-11", "Contains a minor ninth or minor eleventh sonority.");
  if (chords.some((chord) => chord.bass !== undefined && chord.bass !== chord.root)) push(tags, "feature.slash-bass", "Contains a non-root bass note.");
  if (chords.some((chord) => chord.quality === "dim" || chord.quality === "dim7" || chord.quality === "min7b5")) push(tags, "feature.diminished", "Contains a diminished or half-diminished chord.");
  if (chords.some((chord) => chord.quality === "aug")) push(tags, "feature.augmented", "Contains an augmented chord.");
  if (chords.some((chord) => chord.tensions.some((tension) => alteredTensions.has(tension)))) push(tags, "feature.altered", "Contains an altered tension.");

  const dominantCount = chords.filter((chord) => dominantQualities.has(chord.quality)).length;
  if (dominantCount >= 2 && dominantCount / chords.length >= 0.5) {
    push(tags, "feature.dominant-heavy", "At least half of the chords are dominant-family chords.");
  }

  const key = input.key ?? input.block.detectedKey;
  if (key) {
    const degrees = chords.map((chord) => degreeOf(chord, key));
    if (degrees.every((degree) => degree && degree.accidental === 0)) {
      push(tags, "feature.diatonic", "Every chord root maps to an unaltered scale degree in the recorded key.");
    }
    if (degrees.some((degree) => degree && degree.accidental !== 0)) {
      push(tags, "feature.chromatic", "At least one chord root is chromatic in the recorded key.");
    }
    if (degrees.some((degree, index) => degree && degree.accidental !== 0 && !dominantQualities.has(chords[index].quality))) {
      push(tags, "feature.modal-mixture", "A non-dominant chord uses an altered scale degree in the recorded key.");
    }
    if (chords.some((chord, index) => isSecondaryDominant(chord, chords[index + 1], degrees[index]?.degree))) {
      push(tags, "feature.secondary-dominant", "A non-V dominant resolves up a fourth to the following chord root.");
    }
  }

  return tags;
}

function hasMajorExtension(chord: ChordSymbol): boolean {
  return chord.quality === "maj7" || chord.quality === "maj9"
    || (chord.quality === "maj" && chord.tensions.includes("9"));
}

function hasMinorExtension(chord: ChordSymbol): boolean {
  return chord.quality === "min9" || chord.quality === "min11"
    || (chord.quality === "min7" && chord.tensions.some((tension) => tension === "9" || tension === "11"));
}

function isSecondaryDominant(
  chord: ChordSymbol,
  nextChord: ChordSymbol | undefined,
  degree: number | undefined,
): boolean {
  return Boolean(
    nextChord
    && dominantQualities.has(chord.quality)
    && degree !== 5
    && nextChord.root === (chord.root + 5) % 12,
  );
}

function push(tags: DerivedProgressionTag[], tagId: string, reason: string) {
  const definition = getProgressionTagDefinition(tagId);
  if (!definition) return;
  tags.push({
    tagId,
    category: definition.category,
    source: "derived",
    taxonomyVersion: PROGRESSION_TAXONOMY_VERSION,
    reasons: [reason],
  });
}
