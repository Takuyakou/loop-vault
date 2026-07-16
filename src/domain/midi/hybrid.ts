import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import { extractHybridBlocks } from "./blocks";
import { scoreChordCandidates, type ScoredSegment } from "./candidates";
import { decodeTwoPass } from "./decoder";
import { estimateKeyCandidates } from "./keyPrior";
import { analyzeMidi as analyzeMidiLegacy } from "./legacy";
import { mergeDecodedSegments } from "./merge";
import { normalizeNotes } from "./normalize";
import { extractOrnamentFeatures } from "./ornaments";
import { parseMidi } from "./parser";
import { buildCumulativePitchFeatures, buildWeightedPitchProfile, profileFromCumulative } from "./profiles";
import { buildSegmentLattice, generateBoundaries } from "./segmentation";
import { inferTrackRoleProfiles } from "./trackRoles";
import type { AnalyzeMidiOptions } from "./types";
import { defaultAnalyzerWeights, type AnalyzerWeights } from "./weights";
import type { BoundaryCandidate } from "./segmentation";
import type { DecodedSegment } from "./decoder";
import type { KeyRegionCandidate } from "./keyPrior";
import type { MergedDecodedSegment } from "./merge";
import type { MidiSongData } from "./types";

export const hybridAnalyzerVersion = "hybrid-symbolic-v1";
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
  const legacyTimeline = analyzeMidiLegacy(bytes, options).fullTimeline;
  const fullTimeline: ChordTimelineItem[] = legacyTimeline.map((legacy) => {
    const startBeat = (legacy.bar - 1) * beatsPerBar + legacy.beat - 1;
    const segment = decodedSegmentAtBeat(merged, startBeat);
    if (!segment) return legacy;
    const alternatives = [segment.candidate.chord, ...segment.alternatives.map((candidate) => candidate.chord)];
    return {
      ...legacy,
      alternatives: [...new Map(alternatives.map((chord) => [chord.label, chord])).values()]
        .filter((chord) => chord.label !== legacy.chord.label)
        .slice(0, 2).map((chord, index) => ({ chord, confidence: index === 0 ? 0.58 : 0.48 })),
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
    blockCandidates: extractHybridBlocks(fullTimeline, data.totalBars),
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: hybridAnalyzerVersion,
  };
}

export function buildHybridPipeline(bytes: Uint8Array, options: AnalyzeMidiOptions = {}): HybridPipelineResult {
  const data = parseMidi(bytes);
  const weights: AnalyzerWeights = { ...defaultAnalyzerWeights, ...options.weights };
  const notes = normalizeNotes(data);
  const beatsPerBar = parseBeatsPerBar(data.timeSignature);
  const totalBeats = data.totalBars * beatsPerBar;
  const roles = inferTrackRoleProfiles(data, notes, weights);
  const ornaments = extractOrnamentFeatures(notes, weights);
  const boundaries = generateBoundaries(notes, { beatsPerBar, totalBeats });
  const lattice = buildSegmentLattice(notes, boundaries, { beatsPerBar, totalBeats });
  const boundaryBeats = boundaries.map((entry) => entry.beat);
  const cumulative = buildCumulativePitchFeatures(notes, boundaryBeats, roles, ornaments, beatsPerBar, weights);
  const wholeProfile = buildWeightedPitchProfile(notes, { startBeat: 0, endBeat: totalBeats }, roles, ornaments, beatsPerBar, weights);
  const key = estimateKeyCandidates(wholeProfile, 0, totalBeats)[0];
  const scored: ScoredSegment[] = lattice.map((segment) => {
    const startIndex = boundaryBeats.indexOf(segment.startBeat);
    const endIndex = boundaryBeats.indexOf(segment.endBeat);
    return { segment, candidates: scoreChordCandidates(profileFromCumulative(cumulative, startIndex, endIndex), key) };
  });
  const decoded = decodeTwoPass(scored, beatsPerBar);
  const merged = mergeDecodedSegments(decoded);
  return { data, beatsPerBar, boundaries, scored, decoded, merged, ...(key ? { key } : {}) };
}

function analyzeEmpty(data: ReturnType<typeof parseMidi>, options: AnalyzeMidiOptions): MidiProgressionAnalysis {
  return { ...(options.fileName ? { fileName: options.fileName } : {}), totalBars: data.totalBars,
    ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}), ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
    fullTimeline: [], blockCandidates: [], analyzedAt: "1970-01-01T00:00:00.000Z", analyzerVersion: hybridAnalyzerVersion };
}

function parseBeatsPerBar(timeSignature?: string): number {
  const value = Number(timeSignature?.split("/")[0]);
  return Number.isFinite(value) && value > 0 ? value : 4;
}

function decodedSegmentAtBeat(segments: ReturnType<typeof mergeDecodedSegments>, beat: number) {
  return segments.find((segment) => beat >= segment.startBeat && beat < segment.endBeat);
}
