import type { ChordSymbol } from "../types";
import { suggestChordAlternatives } from "./chordSuggestions";
import {
  quickChordCandidate,
  type QuickChordCandidate,
} from "./quickCandidates";

export interface ContextCandidateInput {
  currentChord: ChordSymbol;
  previousChord?: ChordSymbol;
  nextChord?: ChordSymbol;
  keySignature?: string;
}

export function generateContextCandidates({
  currentChord,
  previousChord,
  nextChord,
  keySignature,
}: ContextCandidateInput): QuickChordCandidate[] {
  return suggestChordAlternatives({
    current: currentChord,
    previous: previousChord,
    next: nextChord,
    keySignature,
  }).map((alternative, index) => quickChordCandidate({
    chord: alternative.chord,
    source: "harmonicContext",
    sourceScore: alternative.confidence,
    sourceRank: index,
    reasons: [{
      code: "harmonic-context",
      labelKey: "quickCandidate.reason.harmonicContext",
      value: alternative.confidence,
    }],
  }));
}
