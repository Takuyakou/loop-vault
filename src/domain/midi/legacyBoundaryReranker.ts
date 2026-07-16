import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import { extractHybridBlocks } from "./blocks";
import {
  scoreChordCandidates,
  scoreStructuredChordCandidate,
  type ChordCandidateScore,
} from "./candidates";
import { estimateKeyCandidates } from "./keyPrior";
import { analyzeMidi as analyzeMidiLegacy } from "./legacy";
import { normalizeNotes } from "./normalize";
import { extractOrnamentFeatures } from "./ornaments";
import { parseMidi } from "./parser";
import { buildWeightedPitchProfile } from "./profiles";
import { inferTrackRoleProfiles } from "./trackRoles";
import { beatsPerBar } from "./timing";
import type { AnalyzeMidiOptions } from "./types";
import { defaultAnalyzerWeights, type AnalyzerWeights } from "./weights";
import { selectChordEvidenceNotes } from "./voices";

export const legacyBoundaryRerankerVersion = "legacy-boundary-rerank-v1";

export interface LegacyBoundaryRerankerThresholds {
  minimumScoreLead: number;
  minimumCoreCoverage: number;
  minimumRootEvidence: number;
  maximumForeignPenalty: number;
  maximumMissingCorePenalty: number;
}

export const defaultLegacyBoundaryRerankerThresholds: Readonly<LegacyBoundaryRerankerThresholds> = {
  minimumScoreLead: 0.6,
  minimumCoreCoverage: 0.62,
  minimumRootEvidence: 0.08,
  maximumForeignPenalty: 0.14,
  maximumMissingCorePenalty: 0.17,
};

export interface RerankDecision {
  selected: ChordCandidateScore;
  legacy: ChordCandidateScore;
  candidates: ChordCandidateScore[];
  replacedLegacy: boolean;
  scoreLead: number;
  reasons: string[];
}

export function chooseLegacyBoundaryCandidate(
  legacy: ChordCandidateScore,
  candidates: readonly ChordCandidateScore[],
  thresholds: LegacyBoundaryRerankerThresholds = defaultLegacyBoundaryRerankerThresholds,
): RerankDecision {
  const candidateSet = distinctCandidates([legacy, ...candidates]);
  const bestHybrid = candidates.find((candidate) => candidate.chord.label !== legacy.chord.label);
  if (!bestHybrid) return { selected: legacy, legacy, candidates: candidateSet, replacedLegacy: false, scoreLead: 0, reasons: ["no-hybrid-alternative"] };
  const scoreLead = bestHybrid.totalScore - legacy.totalScore;
  const rootEvidence = bestHybrid.evidence.find((entry) => entry.kind === "root-evidence")?.value ?? 0;
  const checks = [
    [scoreLead >= thresholds.minimumScoreLead, "score-lead"],
    [bestHybrid.coreCoverageScore >= thresholds.minimumCoreCoverage, "core-coverage"],
    [rootEvidence >= thresholds.minimumRootEvidence, "root-evidence"],
    [bestHybrid.foreignNotePenalty <= thresholds.maximumForeignPenalty, "foreign-note-penalty"],
    [bestHybrid.missingCoreTonePenalty <= thresholds.maximumMissingCorePenalty, "missing-core-penalty"],
  ] as const;
  const failed = checks.filter(([passed]) => !passed).map(([, reason]) => reason);
  const replacedLegacy = failed.length === 0;
  return {
    selected: replacedLegacy ? bestHybrid : legacy,
    legacy,
    candidates: candidateSet,
    replacedLegacy,
    scoreLead,
    reasons: replacedLegacy ? ["hybrid-clear-advantage"] : failed,
  };
}

export function analyzeMidiLegacyBoundaryRerank(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
  thresholds: LegacyBoundaryRerankerThresholds = defaultLegacyBoundaryRerankerThresholds,
): MidiProgressionAnalysis {
  const data = parseMidi(bytes);
  const weights: AnalyzerWeights = { ...defaultAnalyzerWeights, ...options.weights };
  const evidenceData = { ...data, notes: selectChordEvidenceNotes(data.notes) };
  if (evidenceData.notes.length === 0) {
    return emptyAnalysis(data, options);
  }
  const notes = normalizeNotes(evidenceData);
  const barLengthBeats = beatsPerBar(data.timeSignature);
  const totalBeats = data.totalBars * barLengthBeats;
  const roles = inferTrackRoleProfiles(evidenceData, notes, weights);
  const ornaments = extractOrnamentFeatures(notes, weights);
  const wholeProfile = buildWeightedPitchProfile(notes, { startBeat: 0, endBeat: totalBeats }, roles, ornaments, barLengthBeats, weights);
  const key = estimateKeyCandidates(wholeProfile, 0, totalBeats)[0];
  const legacy = analyzeMidiLegacy(bytes, options);
  const fullTimeline = legacy.fullTimeline.map((item) => {
    const startBeat = (item.bar - 1) * barLengthBeats + item.beat - 1;
    const profile = buildWeightedPitchProfile(notes, { startBeat, endBeat: startBeat + item.durationBeats }, roles, ornaments, barLengthBeats, weights);
    const hybridCandidates = scoreChordCandidates(profile, undefined);
    const legacyCandidate = scoreStructuredChordCandidate(profile, item.chord, undefined);
    return materializeRerankedTimelineItem(
      item,
      chooseLegacyBoundaryCandidate(legacyCandidate, hybridCandidates, thresholds),
    );
  });
  return {
    ...(options.sourceAssetId ? { sourceAssetId: options.sourceAssetId } : {}),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    totalBars: data.totalBars,
    ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}),
    ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
    ...(key ? { detectedKey: `${pitchName(key.tonicPitchClass)} ${key.mode}` } : {}),
    fullTimeline,
    blockCandidates: extractHybridBlocks(fullTimeline, data.totalBars, barLengthBeats),
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: legacyBoundaryRerankerVersion,
  };
}

function emptyAnalysis(data: ReturnType<typeof parseMidi>, options: AnalyzeMidiOptions): MidiProgressionAnalysis {
  return {
    ...(options.sourceAssetId ? { sourceAssetId: options.sourceAssetId } : {}),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    totalBars: data.totalBars,
    ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}),
    ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
    fullTimeline: [],
    blockCandidates: [],
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: legacyBoundaryRerankerVersion,
  };
}

export function materializeRerankedTimelineItem(
  legacy: ChordTimelineItem,
  decision: RerankDecision,
  warningLabels: {
    replaced: string;
    retained: string;
  } = {
    replaced: "hybrid-reranked",
    retained: "legacy-boundary-retained",
  },
): ChordTimelineItem {
  const alternatives = decision.candidates
    .filter((candidate) => candidate.chord.label !== decision.selected.chord.label)
    .sort((left, right) => {
      if (left.chord.label === legacy.chord.label) return -1;
      if (right.chord.label === legacy.chord.label) return 1;
      return right.totalScore - left.totalScore || left.chord.label.localeCompare(right.chord.label);
    })
    .slice(0, 2);
  return {
    ...legacy,
    chord: decision.selected.chord,
    confidence: decision.replacedLegacy ? Math.min(0.89, 0.68 + decision.scoreLead * 0.3) : legacy.confidence,
    alternatives: alternatives.map((candidate, index) => ({ chord: candidate.chord, confidence: index === 0 ? 0.6 : 0.48 })),
    warnings: [...new Set([
      ...legacy.warnings,
      decision.replacedLegacy ? warningLabels.replaced : warningLabels.retained,
    ])],
  };
}

function distinctCandidates(candidates: readonly ChordCandidateScore[]): ChordCandidateScore[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.chord.label)) return false;
    seen.add(candidate.chord.label);
    return true;
  });
}

function pitchName(pitchClass: number): string {
  return ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][pitchClass] ?? "C";
}
