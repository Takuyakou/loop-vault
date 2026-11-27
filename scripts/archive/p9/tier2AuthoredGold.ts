/** Public authored Tier 2 roles. These are independent of Product and P8.6 candidate output. */
import { harmonicGoldExamples } from "../p7/harmonicTruth";
import type { Tier2Gold } from "./tier2Scorer";
const roles: Record<string, { defining: number[]; optional: number[] }> = {
  "equivalent-c6-am7c": { defining: [4, 9], optional: [7] },
  "rootless-c9": { defining: [4, 10, 2], optional: [] },
  "omitted-fifth": { defining: [4, 11], optional: [] },
  "altered-dominant": { defining: [4, 10, 1, 6], optional: [] },
  "extension-thirteen": { defining: [4, 10, 9], optional: [2] },
  "slash-bass": { defining: [4, 11], optional: [7] },
};
export const tier2AuthoredGold: readonly Tier2Gold[] = harmonicGoldExamples.map((harmonic) => {
  const role = roles[harmonic.id];
  if (!role) throw new Error(`Missing authored role truth: ${harmonic.id}`);
  return { harmonic, definingPitchClasses: role.defining, optionalPitchClasses: role.optional,
    identityStatus: "RESOLVED", vocabularyStatus: "SUPPORTED" };
});
