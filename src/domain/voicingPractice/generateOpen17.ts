import type { ChordSymbol } from "../types";
import {
  enumerateSplitCandidates,
  pitchClassesForLabels,
  type CandidateBuildOptions,
  type StyleVoicingCandidate,
} from "./candidateTools";
import {
  chordToneDescriptors,
  getStyleTonePolicy,
} from "./tonePolicy";

export function generateOpen17Candidates(
  chord: ChordSymbol,
  options: CandidateBuildOptions,
): StyleVoicingCandidate[] {
  const tones = chordToneDescriptors(chord);
  const labels = tones.map((tone) => tone.label);
  const seventh = labels.find((label) => ["7", "b7", "bb7"].includes(label));
  const defining = labels.find((label) => ["3", "b3", "2", "4"].includes(label));
  const altered = labels.filter((label) => ["b5", "#5"].includes(label));
  const color = tones.find((tone) => tone.explicit)?.label;
  const bass = chord.bass !== undefined && chord.bass !== chord.root ? "Bass" : "R";
  const leftLabels = [bass, seventh].filter(isString);
  const rightLabels = [
    defining,
    ...altered,
    color,
    labels.find((label) => label === "5"),
    ...(seventh ? [] : ["R"]),
  ].filter(isString).slice(0, 4);
  const policy = getStyleTonePolicy(chord, "open-17");
  const tonePitchClass = (label: string) => tones.find((tone) => tone.label === label)?.pitchClass;

  return enumerateSplitCandidates(
    chord,
    "open-17",
    pitchClassesForLabels(chord, leftLabels, tonePitchClass),
    pitchClassesForLabels(chord, rightLabels, tonePitchClass),
    {
      requiredIntervals: policy.requiredIntervals,
      addedColorIntervals: [],
      omittedIntervals: labels.filter((label) => (
        label !== "R" && !leftLabels.includes(label) && !rightLabels.includes(label)
      )),
      warnings: labels.some((label) => (
        label !== "R" && !leftLabels.includes(label) && !rightLabels.includes(label)
      ))
        ? ["optional-tone-omitted"]
        : [],
    },
    { ...options, requireOpenWidth: true },
  );
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
