import { labelFromSymbol, makeChordSymbol } from "../../chords";
import type { ChordQuality, ChordSymbol } from "../../types";
import type { ExpectedAlternative } from "./types";

const reducedQuality: Partial<Record<ChordQuality, ChordQuality>> = {
  maj9: "maj7",
  min9: "min7",
  dom9: "dom7",
  min11: "min7",
  dom13: "dom7",
  sixNine: "six",
};

const enharmonicNames: Partial<Record<string, string>> = {
  "C#": "Db", Eb: "D#", "F#": "Gb", Ab: "G#", Bb: "A#",
};

export function deriveAcceptableAlternatives(
  primary: ChordSymbol,
  options: { includeWeak?: boolean } = {},
): ExpectedAlternative[] {
  const strong: ExpectedAlternative[] = [];
  const weak: ExpectedAlternative[] = [];
  const canonical = labelFromSymbol(primary);
  const enharmonic = enharmonicLabel(canonical);
  if (enharmonic && enharmonic !== canonical) {
    strong.push({ chord: enharmonic, strength: "strong", reason: "enharmonic" });
  }
  if (primary.tensions.length > 0) {
    strong.push({ chord: labelFromSymbol({ ...primary, tensions: [] }), strength: "strong", reason: "tension-reduction" });
  }
  const reduction = reducedQuality[primary.quality];
  if (reduction) {
    strong.push({
      chord: labelFromSymbol({ ...primary, quality: reduction, tensions: [] }),
      strength: "strong",
      reason: "tension-reduction",
    });
  }
  if (options.includeWeak && primary.bass !== undefined && primary.bass !== primary.root) {
    weak.push({
      chord: labelFromSymbol({ ...primary, bass: undefined }),
      strength: "weak",
      reason: "equivalent-pitch-set",
    });
  }
  if (options.includeWeak && primary.quality === "six") {
    weak.push({
      chord: makeChordSymbol(primary.root + 9, "min7", [], primary.root).label,
      strength: "weak",
      reason: "equivalent-pitch-set",
    });
  }
  if (options.includeWeak && primary.quality === "min7" && primary.bass !== undefined
    && primary.bass === (primary.root + 3) % 12) {
    weak.push({
      chord: makeChordSymbol(primary.bass, "six").label,
      strength: "weak",
      reason: "equivalent-pitch-set",
    });
  }
  return uniqueAlternatives(strong, canonical).slice(0, 4)
    .concat(uniqueAlternatives(weak, canonical).slice(0, 4));
}

function enharmonicLabel(label: string): string | undefined {
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(label);
  if (!match) return undefined;
  const replacement = enharmonicNames[match[1]];
  return replacement ? `${replacement}${match[2]}` : undefined;
}

function uniqueAlternatives(values: readonly ExpectedAlternative[], primary: string): ExpectedAlternative[] {
  return [...new Map(values.filter((value) => value.chord !== primary).map((value) => [value.chord, value])).values()];
}
