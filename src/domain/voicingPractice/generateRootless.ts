import type { ChordSymbol } from "../types";
import {
  enumerateSplitCandidates,
  pitchClass,
  type CandidateBuildOptions,
  type StyleVoicingCandidate,
} from "./candidateTools";
import {
  chordToneDescriptors,
  getStyleTonePolicy,
} from "./tonePolicy";

interface RootlessTemplate {
  variant: "A" | "B";
  labels: string[];
  addedColors: string[];
}

export function generateRootlessCandidates(
  chord: ChordSymbol,
  options: CandidateBuildOptions,
): StyleVoicingCandidate[] {
  const tones = chordToneDescriptors(chord);
  const byLabel = new Map(tones.map((tone) => [tone.label, tone]));
  const policy = getStyleTonePolicy(chord, "rootless-ab");
  return rootlessTemplates(chord).flatMap((template) => {
    const pitchClasses = template.labels.map((label) => {
      const existing = byLabel.get(label);
      return existing?.pitchClass ?? pitchClass(chord.root + intervalForLabel(label));
    });
    const leftCount = 2;
    return enumerateSplitCandidates(
      chord,
      "rootless-ab",
      pitchClasses.slice(0, leftCount),
      pitchClasses.slice(leftCount),
      {
        variant: template.variant,
        requiredIntervals: policy.requiredIntervals,
        addedColorIntervals: template.addedColors,
        omittedIntervals: tones
          .map((tone) => tone.label)
          .filter((label) => label !== "R" && !template.labels.includes(label)),
        warnings: template.addedColors.length > 0
          ? ["added-neutral-color"]
          : [],
      },
      options,
    );
  });
}

function rootlessTemplates(chord: ChordSymbol): RootlessTemplate[] {
  if (chord.quality === "min7b5") {
    return variants(["b3", "b5", "b7", "9"], ["b7", "9", "b3", "b5"], chord);
  }
  if (["min7", "min9", "min11"].includes(chord.quality)) {
    return variants(["b3", "5", "b7", "9"], ["b7", "9", "b3", "5"], chord);
  }
  if (["dom7", "dom9", "dom13"].includes(chord.quality)) {
    const explicitAlterations = chord.tensions.filter((tension) => (
      ["b9", "#9", "#11", "b13"].includes(tension)
    ));
    if (explicitAlterations.length > 0) {
      const first = explicitAlterations[0];
      const second = explicitAlterations[1] ?? "13";
      return variants(["3", first, "b7", second], ["b7", first, "3", second], chord);
    }
    return variants(["3", "13", "b7", "9"], ["b7", "9", "3", "13"], chord);
  }
  return variants(["3", "5", "7", "9"], ["7", "9", "3", "5"], chord);
}

function variants(
  a: string[],
  b: string[],
  chord: ChordSymbol,
): RootlessTemplate[] {
  return [
    { variant: "A", labels: a, addedColors: addedColors(a, chord) },
    { variant: "B", labels: b, addedColors: addedColors(b, chord) },
  ];
}

function addedColors(labels: readonly string[], chord: ChordSymbol): string[] {
  const existing = new Set(chordToneDescriptors(chord).map((tone) => tone.label));
  return [...new Set(labels.filter((label) => !existing.has(label) && ["9", "13"].includes(label)))];
}

function intervalForLabel(label: string): number {
  const intervals: Record<string, number> = {
    R: 0,
    b3: 3,
    "3": 4,
    b5: 6,
    "5": 7,
    "#5": 8,
    "6": 9,
    bb7: 9,
    b7: 10,
    "7": 11,
    b9: 13,
    "9": 14,
    "#9": 15,
    "11": 17,
    "#11": 18,
    b13: 20,
    "13": 21,
  };
  return intervals[label] ?? 0;
}
