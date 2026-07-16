import type { ChordCandidateScore } from "./candidates";
import { confidenceForDecoded, uniqueAlternatives, type ConfidenceLevel } from "./confidence";
import type { DecodedSegment } from "./decoder";

export interface MergedDecodedSegment {
  startBeat: number;
  endBeat: number;
  candidate: ChordCandidateScore;
  alternatives: ChordCandidateScore[];
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  warnings: string[];
}

export function mergeDecodedSegments(path: readonly DecodedSegment[]): MergedDecodedSegment[] {
  const source = materializeDecodedSegments(path);
  const merged: MergedDecodedSegment[] = [];
  source.forEach((current, index) => {
    const decoded = path[index];
    const previous = merged[merged.length - 1];
    if (previous && mergeable(previous, current, decoded.scored.segment.startBoundaryStrength)) {
      previous.endBeat = current.endBeat;
      previous.confidence = Math.min(previous.confidence, current.confidence);
      previous.confidenceLevel = lower(previous.confidenceLevel, current.confidenceLevel);
      previous.alternatives = distinct([...previous.alternatives, current.candidate, ...current.alternatives], previous.candidate);
      previous.warnings = [...new Set([...previous.warnings, ...current.warnings])];
    } else {
      merged.push(current);
    }
  });
  return merged;
}

export function materializeDecodedSegments(path: readonly DecodedSegment[]): MergedDecodedSegment[] {
  return path.map((decoded, index) => {
    const confidence = confidenceForDecoded(path, index);
    return {
      startBeat: decoded.scored.segment.startBeat,
      endBeat: decoded.scored.segment.endBeat,
      candidate: decoded.candidate,
      alternatives: uniqueAlternatives(decoded.scored.candidates, decoded.candidate),
      confidence: confidence.value,
      confidenceLevel: confidence.level,
      warnings: confidence.level === "review" ? ["review-recommended"] : [],
    };
  });
}

function mergeable(left: MergedDecodedSegment, right: MergedDecodedSegment, boundaryStrength: number): boolean {
  const a = left.candidate.chord;
  const b = right.candidate.chord;
  if (a.root !== b.root || a.bass !== b.bass) return false;
  if (a.quality === b.quality) return true;
  if (boundaryStrength >= 0.9) return false;
  return qualityFamily(a.quality) === qualityFamily(b.quality);
}

function qualityFamily(quality: string): string {
  if (quality.startsWith("min")) return "minor";
  if (quality === "dom7" || quality === "dom9" || quality === "dom13") return "dominant";
  if (quality.startsWith("maj") || quality === "add9" || quality === "six" || quality === "sixNine") return "major";
  return quality;
}

function distinct(candidates: ChordCandidateScore[], primary: ChordCandidateScore): ChordCandidateScore[] {
  const seen = new Set([primary.chord.label]);
  return candidates.filter((candidate) => {
    if (seen.has(candidate.chord.label)) return false;
    seen.add(candidate.chord.label);
    return true;
  }).slice(0, 2);
}

function lower(left: ConfidenceLevel, right: ConfidenceLevel): ConfidenceLevel {
  const order: ConfidenceLevel[] = ["review", "medium", "high"];
  return order[Math.min(order.indexOf(left), order.indexOf(right))];
}
