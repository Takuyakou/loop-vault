import type { ChordSymbol } from "../types";
import {
  compareCandidate,
  type CandidateBuildOptions,
  type StyleVoicingCandidate,
} from "./candidateTools";
import { generateOpen17Candidates } from "./generateOpen17";
import { generateRootlessCandidates } from "./generateRootless";
import { generateShell17Candidates } from "./generateShell17";
import type { VoicingStyleId } from "./types";

export const MAX_STYLE_CANDIDATES_PER_EVENT = 48;

export function generateStyleCandidates(
  chord: ChordSymbol,
  styleId: VoicingStyleId,
  options: CandidateBuildOptions,
): StyleVoicingCandidate[] {
  const candidates = styleId === "shell-17"
    ? generateShell17Candidates(chord, options)
    : styleId === "open-17"
      ? generateOpen17Candidates(chord, options)
      : generateRootlessCandidates(chord, options);
  return [...candidates]
    .sort(compareCandidate)
    .slice(0, MAX_STYLE_CANDIDATES_PER_EVENT);
}
