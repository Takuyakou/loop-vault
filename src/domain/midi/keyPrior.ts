import type { WeightedPitchProfile } from "./profiles";

export interface KeyRegionCandidate {
  startBeat: number;
  endBeat: number;
  tonicPitchClass: number;
  mode: "major" | "minor";
  score: number;
}

const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function estimateKeyCandidates(
  profile: WeightedPitchProfile, startBeat: number, endBeat: number, topK = 3,
): KeyRegionCandidate[] {
  const total = profile.qualityPcs.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  const candidates: KeyRegionCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const mode of ["major", "minor"] as const) {
      const template = mode === "major" ? major : minor;
      const score = profile.qualityPcs.reduce((sum, value, pc) =>
        sum + value / total * template[(pc - tonic + 12) % 12], 0);
      candidates.push({ startBeat, endBeat, tonicPitchClass: tonic, mode, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.tonicPitchClass - b.tonicPitchClass || a.mode.localeCompare(b.mode)).slice(0, topK);
}

export function chordKeyCompatibility(root: number, quality: string, key?: KeyRegionCandidate): number {
  if (!key) return 0;
  const scale = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const interval = (root - key.tonicPitchClass + 12) % 12;
  if (!scale.includes(interval)) return -0.08;
  const expectedMinor = key.mode === "major" ? [2, 4, 9] : [0, 5, 7];
  const isMinor = quality.startsWith("min") || quality === "dim" || quality === "dim7";
  return isMinor === expectedMinor.includes(interval) ? 0.08 : 0.025;
}
