import { canonicalChordAlternative } from "../chordAlternatives";
import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import { beatsPerBar } from "./timing";
import type { MidiAnalyzerMode } from "./types";
import type { CandidateOccurrence } from "./occurrence";

export const accuracyCandidateUnionVersion = "accuracy-candidate-union-v1" as const;
export const ACCURACY_CANDIDATE_CATALOG_LIMIT = 32;
export const ACCURACY_CANDIDATE_HARD_CAP = 64;

export interface CandidateUnionSource {
  mode: MidiAnalyzerMode;
  analysis: MidiProgressionAnalysis;
}

/**
 * Complementary analyzers selected from the Phase 5 bake-off.
 *
 * Both rerankers improved candidate recall on at least one corpus while staying
 * far below the ten-second Product stop. Hybrid remains evaluation-only because
 * its aggregate correction cost did not beat Phase4.
 */
export const accuracyCandidateUnionModes = [
  "legacy-boundary-rerank",
  "voice-aware-rerank-v1",
] as const satisfies readonly MidiAnalyzerMode[];

/**
 * Keeps the primary timeline, winner and existing Top-3 byte-equivalent, then
 * appends evidence-backed candidates from overlapping source events.
 */
export function applyAccuracyCandidateUnion(
  primary: MidiProgressionAnalysis,
  sources: readonly CandidateUnionSource[],
): MidiProgressionAnalysis {
  const barLength = beatsPerBar(primary.timeSignature);
  const fullTimeline = primary.fullTimeline.map((item) =>
    mergeTimelineItemCandidates(item, sources, barLength));
  const byEvent = new Map(fullTimeline.map((item) => [eventKey(item), item]));
  const occurrence = (entry: CandidateOccurrence): CandidateOccurrence => ({
    ...entry,
    events: entry.events.map((event) => ({
      ...event,
      source: byEvent.get(eventKey(event.source)) ?? event.source,
    })),
  });
  return {
    ...primary,
    fullTimeline,
    blockCandidates: primary.blockCandidates.map((candidate) => ({
      ...candidate,
      chords: candidate.chords.map((item) => byEvent.get(eventKey(item)) ?? item),
      ...(candidate.events
        ? {
            events: candidate.events.map((event) => ({
              ...event,
              source: byEvent.get(eventKey(event.source)) ?? event.source,
            })),
          }
        : {}),
    })),
    ...(primary.candidatePatterns
      ? {
          candidatePatterns: primary.candidatePatterns.map((pattern) => ({
            ...pattern,
            occurrences: pattern.occurrences.map(occurrence),
          })),
        }
      : {}),
    ...(primary.candidateCatalog
      ? {
          candidateCatalog: {
            ...primary.candidateCatalog,
            patterns: primary.candidateCatalog.patterns.map((pattern) => ({
              ...pattern,
              occurrences: pattern.occurrences.map(occurrence),
            })),
          },
        }
      : {}),
  };
}

function mergeTimelineItemCandidates(
  primary: ChordTimelineItem,
  sources: readonly CandidateUnionSource[],
  barLength: number,
): ChordTimelineItem {
  const primaryStart = eventStartBeat(primary, barLength);
  const primaryEnd = primaryStart + primary.durationBeats;
  const ordered = primary.alternatives.map((entry) => ({
    chord: entry.chord,
    confidence: entry.confidence,
  }));
  const identities = new Set([
    canonicalChordAlternative(primary.chord),
    ...ordered.map((entry) => canonicalChordAlternative(entry.chord)),
  ]);
  let inspected = 0;

  for (const source of sources) {
    const sourceBarLength = beatsPerBar(source.analysis.timeSignature);
    const overlapping = source.analysis.fullTimeline
      .map((item, index) => {
        const start = eventStartBeat(item, sourceBarLength);
        const end = start + item.durationBeats;
        return {
          item,
          index,
          overlap: Math.max(0, Math.min(primaryEnd, end) - Math.max(primaryStart, start)),
          start,
        };
      })
      .filter((entry) => entry.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap
        || left.start - right.start
        || left.index - right.index);

    for (const entry of overlapping) {
      const candidates = [
        { chord: entry.item.chord, confidence: entry.item.confidence },
        ...entry.item.alternatives,
      ];
      for (const candidate of candidates) {
        if (inspected >= ACCURACY_CANDIDATE_HARD_CAP) break;
        inspected += 1;
        if (candidate.confidence <= 0) continue;
        const identity = canonicalChordAlternative(candidate.chord);
        if (identities.has(identity)) continue;
        identities.add(identity);
        ordered.push({
          chord: candidate.chord,
          confidence: candidate.confidence,
        });
        if (ordered.length >= ACCURACY_CANDIDATE_CATALOG_LIMIT - 1) break;
      }
      if (
        inspected >= ACCURACY_CANDIDATE_HARD_CAP
        || ordered.length >= ACCURACY_CANDIDATE_CATALOG_LIMIT - 1
      ) break;
    }
    if (
      inspected >= ACCURACY_CANDIDATE_HARD_CAP
      || ordered.length >= ACCURACY_CANDIDATE_CATALOG_LIMIT - 1
    ) break;
  }

  return ordered.length === primary.alternatives.length
    ? primary
    : { ...primary, alternatives: ordered };
}

function eventStartBeat(item: ChordTimelineItem, barLength: number): number {
  return (item.bar - 1) * barLength + item.beat - 1;
}

function eventKey(item: ChordTimelineItem): string {
  return [
    item.eventId ?? "",
    item.bar,
    item.beat,
    item.durationBeats,
    canonicalChordAlternative(item.chord),
  ].join(":");
}
