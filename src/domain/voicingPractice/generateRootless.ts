import type { ChordSymbol } from "../types";
import {
  enumerateSplitCandidates,
  type CandidateBuildOptions,
  type StyleVoicingCandidate,
} from "./candidateTools";
import {
  chordToneDescriptors,
  getStyleTonePolicy,
  pitchClassForDegreeLabel,
  type DegreeLabel,
} from "./tonePolicy";

export interface RootlessTemplate {
  readonly variant: "A" | "B";
  readonly labels: readonly DegreeLabel[];
  readonly addedColors: readonly DegreeLabel[];
}

export function generateRootlessCandidates(
  chord: ChordSymbol,
  options: CandidateBuildOptions,
): StyleVoicingCandidate[] {
  const tones = chordToneDescriptors(chord);
  const byLabel = new Map(tones.map((tone) => [tone.label, tone]));
  const policy = getStyleTonePolicy(chord, "rootless-ab");
  return rootlessTemplatesForChord(chord).flatMap((template) => {
    const templateLabelSet = new Set<string>(template.labels);
    const pitchClasses = template.labels.map((label) => {
      const existing = byLabel.get(label);
      return existing?.pitchClass ?? pitchClassForDegreeLabel(chord, label);
    });
    if (pitchClasses.some((value) => value === undefined)) return [];
    const resolvedPitchClasses = pitchClasses.filter(isNumber);
    const leftCount = 2;
    return enumerateSplitCandidates(
      chord,
      "rootless-ab",
      resolvedPitchClasses.slice(0, leftCount),
      resolvedPitchClasses.slice(leftCount),
      {
        variant: template.variant,
        requiredIntervals: policy.requiredIntervals,
        addedColorIntervals: [...template.addedColors],
        omittedIntervals: tones
          .map((tone) => tone.label)
          .filter((label) => label !== "R" && !templateLabelSet.has(label)),
        warnings: template.addedColors.length > 0
          ? ["added-neutral-color"]
          : [],
      },
      options,
    );
  });
}

export function rootlessTemplatesForChord(chord: ChordSymbol): readonly RootlessTemplate[] {
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
  a: readonly DegreeLabel[],
  b: readonly DegreeLabel[],
  chord: ChordSymbol,
): RootlessTemplate[] {
  return [
    { variant: "A", labels: a, addedColors: addedColors(a, chord) },
    { variant: "B", labels: b, addedColors: addedColors(b, chord) },
  ];
}

function addedColors(labels: readonly DegreeLabel[], chord: ChordSymbol): DegreeLabel[] {
  const existing = new Set(chordToneDescriptors(chord).map((tone) => tone.label));
  return [...new Set(labels.filter((label) => !existing.has(label) && ["9", "13"].includes(label)))];
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined;
}
