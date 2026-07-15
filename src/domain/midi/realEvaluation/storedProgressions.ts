import type { ChordTimelineItem, SavedProgressionBlock, VaultFile } from "../../types";
import type { ExpectedChordSegment } from "../evaluation/types";
import type { RealMidiEvaluationCase } from "./types";

const DEFAULT_BEATS_PER_BAR = 4;

export interface StoredProgressionReference {
  ideaId: string;
  ideaTitle: string;
  block: SavedProgressionBlock;
  asset?: VaultFile["ideas"][number]["assets"][number];
}

export interface StoredProgressionComparisonItem {
  startBeat: number;
  endBeat: number;
  saved: string;
  legacy?: string;
  reranker?: string;
  legacyMatches: boolean;
  rerankerMatches: boolean;
}

export function enumerateStoredProgressions(vault: VaultFile): StoredProgressionReference[] {
  return vault.ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({
    ideaId: idea.id,
    ideaTitle: idea.title,
    block,
    asset: block.sourceAssetId
      ? idea.assets.find((asset) => asset.id === block.sourceAssetId)
      : undefined,
  })));
}

export function resolveStoredProgressionRange(
  block: SavedProgressionBlock,
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
): { startBeat: number; endBeat: number } | undefined {
  if (
    block.sourceStartBeat !== undefined
    && block.sourceEndBeat !== undefined
    && block.sourceEndBeat > block.sourceStartBeat
  ) {
    return { startBeat: block.sourceStartBeat, endBeat: block.sourceEndBeat };
  }
  if (block.chords.length === 0) return undefined;
  const ranges = block.chords.map((item) => timelineRange(item, beatsPerBar));
  return {
    startBeat: Math.min(...ranges.map((range) => range.startBeat)),
    endBeat: Math.max(...ranges.map((range) => range.endBeat)),
  };
}

export function buildStoredProgressionCase(
  reference: StoredProgressionReference,
  fingerprint: string,
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
): RealMidiEvaluationCase | undefined {
  const { block } = reference;
  const range = resolveStoredProgressionRange(block, beatsPerBar);
  if (!range || block.chords.length === 0) return undefined;
  const strength = block.userVerified ? "gold" : block.userEdited ? "silver" : "bronze";
  return {
    schemaVersion: 1,
    id: `stored-${block.id}`,
    source: {
      fingerprint,
      ...(block.sourceAssetId ? { assetId: block.sourceAssetId } : {}),
      ...(block.sourceFileName ? { fileName: block.sourceFileName } : {}),
    },
    range: {
      ...range,
      ...(block.startBar ? { startBar: block.startBar } : {}),
      ...(block.endBar ? { endBar: block.endBar } : {}),
    },
    expected: { primary: block.chords.map((item) => toExpectedSegment(item, beatsPerBar)) },
    label: {
      strength,
      origin: block.userEdited || block.userVerified ? "stored-progression" : "implicit-save",
      ...(block.userVerified ? { reviewedAt: block.capturedAt, reviewer: "local-user" as const } : {}),
    },
    ...(block.detectedKey ? { context: { key: block.detectedKey } } : {}),
    analyzerContext: {
      sourceAnalyzerVersion: block.analyzerVersion,
      ...(block.weightsVersion ? { sourceWeightsVersion: block.weightsVersion } : {}),
    },
  };
}

export function compareStoredProgression(
  expected: readonly ExpectedChordSegment[],
  legacy: readonly ChordTimelineItem[],
  reranker: readonly ChordTimelineItem[],
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
): StoredProgressionComparisonItem[] {
  return expected.map((segment) => {
    const legacyLabel = bestOverlappingLabel(segment, legacy, beatsPerBar);
    const rerankerLabel = bestOverlappingLabel(segment, reranker, beatsPerBar);
    return {
      startBeat: segment.startBeat,
      endBeat: segment.endBeat,
      saved: segment.primary,
      ...(legacyLabel ? { legacy: legacyLabel } : {}),
      ...(rerankerLabel ? { reranker: rerankerLabel } : {}),
      legacyMatches: legacyLabel === segment.primary,
      rerankerMatches: rerankerLabel === segment.primary,
    };
  });
}

function toExpectedSegment(item: ChordTimelineItem, beatsPerBar: number): ExpectedChordSegment {
  const range = timelineRange(item, beatsPerBar);
  return {
    ...range,
    primary: item.chord.label,
    root: item.chord.root,
    quality: item.chord.quality,
    ...(item.chord.bass !== undefined ? { bass: item.chord.bass } : {}),
    ...(item.alternatives.length > 0
      ? { acceptableAlternatives: item.alternatives.map((alternative) => alternative.chord.label) }
      : {}),
  };
}

function bestOverlappingLabel(
  expected: Pick<ExpectedChordSegment, "startBeat" | "endBeat">,
  timeline: readonly ChordTimelineItem[],
  beatsPerBar: number,
): string | undefined {
  return timeline
    .map((item) => {
      const range = timelineRange(item, beatsPerBar);
      return {
        label: item.chord.label,
        startBeat: range.startBeat,
        overlap: Math.max(0, Math.min(expected.endBeat, range.endBeat) - Math.max(expected.startBeat, range.startBeat)),
      };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.startBeat - right.startBeat)[0]?.label;
}

function timelineRange(item: ChordTimelineItem, beatsPerBar: number) {
  const startBeat = (item.bar - 1) * beatsPerBar + item.beat - 1;
  return { startBeat, endBeat: startBeat + item.durationBeats };
}
