import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import { selectQuickChordAlternatives } from "../chordAlternatives";
import { extractHybridBlocks } from "./blocks";
import { scoreChordCandidates, type ScoredSegment } from "./candidates";
import { decodeChordPath, decodeTwoPass } from "./decoder";
import { estimateKeyCandidates } from "./keyPrior";
import { analyzeMidiWithRankingScores } from "./legacy";
import { materializeDecodedSegments, mergeDecodedSegments } from "./merge";
import { normalizeNotes } from "./normalize";
import { extractOrnamentFeatures } from "./ornaments";
import { parseMidi } from "./parser";
import { buildCumulativePitchFeatures, buildWeightedPitchProfile, profileFromCumulative } from "./profiles";
import { buildSegmentLattice, generateBoundaries } from "./segmentation";
import { beatsPerBar as beatsPerBarFor } from "./timing";
import { inferTrackRoleProfiles } from "./trackRoles";
import type { AnalyzeMidiOptions, HybridFeatureFlags } from "./types";
import { defaultAnalyzerWeights, type AnalyzerWeights } from "./weights";
import type { BoundaryCandidate } from "./segmentation";
import type { DecodedSegment } from "./decoder";
import type { KeyRegionCandidate } from "./keyPrior";
import type { MergedDecodedSegment } from "./merge";
import type { MidiSongData } from "./types";
import { selectChordEvidenceNotes } from "./voices";

export const hybridAnalyzerVersion = "hybrid-symbolic-v1";
export const defaultHybridFeatures: Readonly<HybridFeatureFlags> = {
  trackRoleEstimation: true,
  ornamentSuppression: true,
  adaptiveSegmentation: true,
  keyPrior: true,
  twoPassDecoding: true,
  adjacentMerge: true,
};
const pitchNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export interface HybridPipelineResult {
  data: MidiSongData;
  beatsPerBar: number;
  boundaries: BoundaryCandidate[];
  scored: ScoredSegment[];
  decoded: DecodedSegment[];
  merged: MergedDecodedSegment[];
  key?: KeyRegionCandidate;
}

export function analyzeMidiHybrid(bytes: Uint8Array, options: AnalyzeMidiOptions = {}): MidiProgressionAnalysis {
  const pipeline = buildHybridPipeline(bytes, options);
  const { data, beatsPerBar, key, merged } = pipeline;
  if (!merged.length) return analyzeEmpty(data, options);
  const legacyInternal = analyzeMidiWithRankingScores(bytes, options);
  const legacyTimeline = legacyInternal.analysis.fullTimeline;
  const fullTimeline: ChordTimelineItem[] = legacyTimeline.map((legacy) => {
    const startBeat = (legacy.bar - 1) * beatsPerBar + legacy.beat - 1;
    const segment = decodedSegmentAtBeat(merged, startBeat);
    if (!segment) return legacy;
    const alternatives = selectQuickChordAlternatives(legacy.chord, [
      { chord: segment.candidate.chord, confidence: segment.candidate.totalScore },
      ...segment.alternatives.map((candidate) => ({
        chord: candidate.chord,
        confidence: candidate.totalScore,
      })),
    ]);
    return {
      ...legacy,
      alternatives: alternatives.map((alternative, index) => ({
        chord: alternative.chord,
        confidence: Math.max(0.34, 0.58 - index * 0.08),
      })),
      warnings: [...new Set([...legacy.warnings, ...segment.warnings, "legacy-primary"])]
    };
  });
  return {
    ...(options.sourceAssetId ? { sourceAssetId: options.sourceAssetId } : {}),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    totalBars: data.totalBars,
    ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}),
    ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
    ...(key ? { detectedKey: `${pitchNames[key.tonicPitchClass]} ${key.mode}` } : {}),
    fullTimeline,
    blockCandidates: extractHybridBlocks(
      fullTimeline,
      data.totalBars,
      beatsPerBar,
      legacyInternal.timelineRankingScores,
    ),
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: hybridAnalyzerVersion,
  };
}

export function buildHybridPipeline(bytes: Uint8Array, options: AnalyzeMidiOptions = {}): HybridPipelineResult {
  const data = parseMidi(bytes);
  const weights: AnalyzerWeights = { ...defaultAnalyzerWeights, ...options.weights };
  const features: HybridFeatureFlags = { ...defaultHybridFeatures, ...options.features };
  const evidenceData = { ...data, notes: selectChordEvidenceNotes(data.notes) };
  const beatsPerBar = beatsPerBarFor(data.timeSignature);
  if (evidenceData.notes.length === 0) {
    return { data, beatsPerBar, boundaries: [], scored: [], decoded: [], merged: [] };
  }

  const notes = normalizeNotes(evidenceData);
  const totalBeats = data.totalBars * beatsPerBar;
  const roles = features.trackRoleEstimation
    ? inferTrackRoleProfiles(evidenceData, notes, weights)
    : neutralTrackRoles(evidenceData, notes);
  const ornaments = features.ornamentSuppression ? extractOrnamentFeatures(notes, weights) : new Map();
  const generatedBoundaries = generateBoundaries(notes, { beatsPerBar, totalBeats });
  const boundaries = features.adaptiveSegmentation
    ? generatedBoundaries
    : generatedBoundaries.filter((boundary) => boundary.reasons.some((reason) => reason === "bar-start" || reason === "beat-start"));
  const lattice = buildSegmentLattice(notes, boundaries, { beatsPerBar, totalBeats });
  const boundaryBeats = boundaries.map((entry) => entry.beat);
  const cumulative = buildCumulativePitchFeatures(notes, boundaryBeats, roles, ornaments, beatsPerBar, weights);
  const wholeProfile = buildWeightedPitchProfile(notes, { startBeat: 0, endBeat: totalBeats }, roles, ornaments, beatsPerBar, weights);
  const key = features.keyPrior ? estimateKeyCandidates(wholeProfile, 0, totalBeats)[0] : undefined;
  const scored: ScoredSegment[] = lattice.map((segment) => {
    const startIndex = boundaryBeats.indexOf(segment.startBeat);
    const endIndex = boundaryBeats.indexOf(segment.endBeat);
    return { segment, candidates: scoreChordCandidates(profileFromCumulative(cumulative, startIndex, endIndex), key) };
  });
  const decoded = features.twoPassDecoding ? decodeTwoPass(scored, beatsPerBar) : decodeChordPath(scored, beatsPerBar);
  const merged = features.adjacentMerge ? mergeDecodedSegments(decoded) : materializeDecodedSegments(decoded);
  return { data, beatsPerBar, boundaries, scored, decoded, merged, ...(key ? { key } : {}) };
}

export function timelineFromHybridPipeline(pipeline: HybridPipelineResult): ChordTimelineItem[] {
  return pipeline.merged.map((segment) => ({
    bar: Math.floor(segment.startBeat / pipeline.beatsPerBar) + 1,
    beat: segment.startBeat % pipeline.beatsPerBar + 1,
    durationBeats: segment.endBeat - segment.startBeat,
    chord: segment.candidate.chord,
    confidence: segment.confidence,
    alternatives: segment.alternatives.map((candidate) => ({ chord: candidate.chord, confidence: 0 })),
    warnings: segment.warnings,
  }));
}

function neutralTrackRoles(data: MidiSongData, notes: ReturnType<typeof normalizeNotes>) {
  return new Map(data.tracks.map((track) => {
    const isDrum = notes.some((note) => note.trackIndex === track.index && note.isDrum);
    return [track.index, {
      trackIndex: track.index,
      role: isDrum ? "drums" as const : "unknown" as const,
      qualityWeight: isDrum ? 0 : 1,
      rootWeight: isDrum ? 0 : 1,
      confidence: 1,
      reasons: ["ablation:neutral-role"],
    }];
  }));
}

function analyzeEmpty(data: ReturnType<typeof parseMidi>, options: AnalyzeMidiOptions): MidiProgressionAnalysis {
  return { ...(options.sourceAssetId ? { sourceAssetId: options.sourceAssetId } : {}),
    ...(options.fileName ? { fileName: options.fileName } : {}), totalBars: data.totalBars,
    ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}), ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
    fullTimeline: [], blockCandidates: [], analyzedAt: "1970-01-01T00:00:00.000Z", analyzerVersion: hybridAnalyzerVersion };
}

function decodedSegmentAtBeat(segments: ReturnType<typeof mergeDecodedSegments>, beat: number) {
  return segments.find((segment) => beat >= segment.startBeat && beat < segment.endBeat);
}
