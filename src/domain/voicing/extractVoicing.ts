import type { VoicingSnapshot } from "../types";
import { extractAggregatedCandidate } from "./extractAggregatedNoteSet";
import { extractSimultaneousCandidates } from "./extractSimultaneousVoicing";
import {
  MAX_VOICING_NOTES,
  VOICING_AUTO_USE_CONFIDENCE,
  VOICING_EXTRACTOR_VERSION,
} from "./extractionConfig";
import { normalizeMidiNotes, normalizedChordKey } from "./normalizeVoicing";
import { scoreVoicingCandidate } from "./scoreVoicingCandidate";
import type { VoicingCandidate, VoicingExtractionInput, VoicingExtractionResult } from "./types";

export function extractVoicing(
  input: VoicingExtractionInput,
): VoicingExtractionResult {
  const simultaneous = extractSimultaneousCandidates(input);
  const candidates = simultaneous.length > 0
    ? simultaneous
    : [extractAggregatedCandidate(input)].filter(
        (candidate): candidate is VoicingCandidate => candidate !== undefined,
      );
  const ranked = candidates.map((candidate) => ({
    candidate,
    ...scoreVoicingCandidate(input.chord, candidate),
  })).sort((left, right) =>
    right.score - left.score
    || right.candidate.durationBeats - left.candidate.durationBeats
    || left.candidate.onsetBeat - right.candidate.onsetBeat
    || compareNotes(left.candidate.midiNotes, right.candidate.midiNotes)
  );
  const winner = ranked[0];
  if (!winner) return { status: "not-found", reasons: ["no-note-candidate"] };

  const midiNotes = normalizeMidiNotes(winner.candidate.midiNotes).slice(0, MAX_VOICING_NOTES);
  if (midiNotes.length < 2) return { status: "not-found", reasons: ["insufficient-notes"] };
  const confidence = clamp01(
    winner.score
      * (winner.candidate.representation === "aggregated-note-set" ? 0.82 : 1),
  );
  const reasons: string[] = [];
  if (winner.coverage.requiredCoverage < 0.67) reasons.push("low-chord-coverage");
  if (winner.coverage.foreignToneWeight > 0.34) reasons.push("foreign-tones");
  if (winner.candidate.representation === "aggregated-note-set") reasons.push("aggregated-note-set");
  const bassNote = winner.candidate.bassNote !== undefined
    && midiNotes.includes(winner.candidate.bassNote)
    ? winner.candidate.bassNote
    : midiNotes[0];
  const snapshot: VoicingSnapshot = {
    schemaVersion: 1,
    source: "midi-extracted",
    representation: winner.candidate.representation,
    midiNotes,
    ...(bassNote !== undefined ? { bassNote } : {}),
    capturedForChordKey: normalizedChordKey(input.chord),
    capturedForChordLabel: input.chord.label,
    confidence,
    extractorVersion: VOICING_EXTRACTOR_VERSION,
  };
  const usable = winner.candidate.representation === "simultaneous-voicing"
    && confidence >= VOICING_AUTO_USE_CONFIDENCE
    && winner.coverage.requiredCoverage >= 0.67;
  return { snapshot, status: usable ? "usable" : "review", reasons };
}

function compareNotes(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
