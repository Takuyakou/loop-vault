import { labelFromSymbol, makeChordSymbol, normalizePc } from "../chords";
import type {
  ChordQuality,
  ChordSymbol,
  ChordTimelineItem,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
} from "../types";
import { parseMidi } from "./parser";
import {
  selectProgressionCandidates,
  type CandidateSelectionEntry,
} from "./candidateSelection";
import { beatsPerBar } from "./timing";
import type { AnalyzeMidiOptions, MidiSongData, TimedNote, TrackRole } from "./types";
import { selectChordEvidenceNotes } from "./voices";

export const analyzerVersion = "legacy-v1";

interface WeightedWindow {
  bar: number;
  beat: number;
  durationBeats: number;
  histogram: number[];
  bassHistogram: number[];
  totalWeight: number;
  melodyWeight: number;
}

interface RankedTimelineItem {
  item: ChordTimelineItem;
  rankingScore: number;
}

// Keep above-clamp ordering without letting the raw matcher scale overpower block bonuses.
const rankingResolution = 1e-6;

export interface LegacyAnalysisInternal {
  analysis: MidiProgressionAnalysis;
  timelineRankingScores: number[];
}

interface ChordTemplate {
  quality: ChordQuality;
  intervals: number[];
}

const templates: ChordTemplate[] = [
  { quality: "maj", intervals: [0, 4, 7] },
  { quality: "min", intervals: [0, 3, 7] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "aug", intervals: [0, 4, 8] },
  { quality: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "min7", intervals: [0, 3, 7, 10] },
  { quality: "dom7", intervals: [0, 4, 7, 10] },
  { quality: "min7b5", intervals: [0, 3, 6, 10] },
  { quality: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "six", intervals: [0, 4, 7, 9] },
  { quality: "min6", intervals: [0, 3, 7, 9] },
  { quality: "sixNine", intervals: [0, 2, 4, 7, 9] },
  { quality: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", intervals: [0, 5, 7] },
  { quality: "dom7sus4", intervals: [0, 5, 7, 10] },
  { quality: "add9", intervals: [0, 2, 4, 7] },
  { quality: "maj9", intervals: [0, 2, 4, 7, 11] },
  { quality: "min9", intervals: [0, 2, 3, 7, 10] },
  { quality: "dom9", intervals: [0, 2, 4, 7, 10] },
  { quality: "min11", intervals: [0, 2, 3, 5, 7, 10] },
  { quality: "dom13", intervals: [0, 2, 4, 7, 10, 21] },
];

export function analyzeMidi(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options).analysis;
}

export function analyzeMidiWithRankingScores(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): LegacyAnalysisInternal {
  const data = parseMidi(bytes);
  const evidenceNotes = selectChordEvidenceNotes(data.notes);
  const evidenceData = { ...data, notes: evidenceNotes };
  if (evidenceNotes.length === 0) {
    return { analysis: emptyAnalysis(data, options), timelineRankingScores: [] };
  }
  const barLengthBeats = beatsPerBar(data.timeSignature);
  const roles = inferTrackRoles(evidenceData);
  const windows = buildWeightedWindows(evidenceData, roles, options.beatsPerWindow ?? 2);
  const rankedTimeline: RankedTimelineItem[] = [];
  for (const window of windows) {
    rankedTimeline.push(matchWindowWithRankingScore(
      window,
      rankedTimeline[rankedTimeline.length - 1]?.item.chord,
    ));
  }
  const smoothedTimeline = smoothTimelineWithRankingScores(rankedTimeline, barLengthBeats);
  const fullTimeline = smoothedTimeline.map(({ item }) => item);
  const timelineRankingScores = smoothedTimeline.map(({ rankingScore }) => rankingScore);
  const blockCandidates = extractBlockCandidates(
    fullTimeline,
    data.totalBars,
    timelineRankingScores,
  );

  return {
    analysis: {
      ...(options.sourceAssetId ? { sourceAssetId: options.sourceAssetId } : {}),
      ...(options.fileName ? { fileName: options.fileName } : {}),
      totalBars: data.totalBars,
      ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}),
      ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
      detectedKey: detectKey(evidenceNotes),
      fullTimeline,
      blockCandidates,
      analyzedAt: "1970-01-01T00:00:00.000Z",
      analyzerVersion,
    },
    timelineRankingScores,
  };
}

export function inferTrackRoles(data: MidiSongData): Map<number, TrackRole> {
  const roles = new Map<number, TrackRole>();

  for (const track of data.tracks) {
    if (track.roleHint === "percussion") {
      roles.set(track.index, "percussion");
      continue;
    }

    const notes = data.notes.filter((note) => note.trackIndex === track.index);
    if (notes.length === 0) {
      roles.set(track.index, track.roleHint ?? "mixed");
      continue;
    }

    const avgPitch = average(notes.map((note) => note.pitch));
    const avgDuration = average(notes.map((note) => note.durationTick / data.ticksPerBeat));
    const density = notes.length / Math.max(1, data.totalBars);
    const simultaneity = averageSimultaneity(notes);

    if (avgPitch < 52 && avgDuration >= 0.7) {
      roles.set(track.index, "bass");
      continue;
    }

    if (simultaneity >= 2.2 || avgDuration >= 1.3) {
      roles.set(track.index, "harmony");
      continue;
    }

    if (avgPitch > 67 && density > 3) {
      roles.set(track.index, "melody");
      continue;
    }

    roles.set(track.index, track.roleHint ?? "mixed");
  }

  return roles;
}

export function buildWeightedWindows(
  data: MidiSongData,
  roles: Map<number, TrackRole>,
  durationBeats: 1 | 2 | 4 = 2,
): WeightedWindow[] {
  const barLengthBeats = beatsPerBar(data.timeSignature);
  const totalBeats = data.totalBars * barLengthBeats;
  const windows: WeightedWindow[] = [];

  for (let startBeat = 0; startBeat < totalBeats; startBeat += durationBeats) {
    const histogram = Array(12).fill(0) as number[];
    const bassHistogram = Array(12).fill(0) as number[];
    let totalWeight = 0;
    let melodyWeight = 0;
    const startTick = startBeat * data.ticksPerBeat;
    const endTick = (startBeat + durationBeats) * data.ticksPerBeat;
    const overlapping = data.notes.filter((note) =>
      overlaps(note, startTick, endTick),
    );
    const simultaneityBonus = overlapping.length >= 3 ? 1.2 : 1;

    for (const note of overlapping) {
      const role = roles.get(note.trackIndex) ?? "mixed";
      if (role === "percussion") {
        continue;
      }

      const overlapTick =
        Math.min(note.startTick + note.durationTick, endTick) -
        Math.max(note.startTick, startTick);
      const overlapBeats = Math.max(0, overlapTick / data.ticksPerBeat);
      const weight =
        overlapBeats *
        beatPositionFactor(startBeat, barLengthBeats) *
        rangeFactor(note.pitch) *
        velocityFactor(note.velocity) *
        roleFactor(role) *
        simultaneityBonus;
      const pc = normalizePc(note.pitch);
      histogram[pc] += weight;
      totalWeight += weight;

      if (note.pitch < 60 || role === "bass") {
        bassHistogram[pc] += weight * 1.25;
      }
      if (role === "melody") {
        melodyWeight += weight;
      }
    }

    windows.push({
      bar: Math.floor(startBeat / barLengthBeats) + 1,
      beat: (startBeat % barLengthBeats) + 1,
      durationBeats,
      histogram,
      bassHistogram,
      totalWeight,
      melodyWeight,
    });
  }

  return windows;
}

export function matchWindow(window: WeightedWindow, previous?: ChordSymbol): ChordTimelineItem {
  return matchWindowWithRankingScore(window, previous).item;
}

function matchWindowWithRankingScore(
  window: WeightedWindow,
  previous?: ChordSymbol,
): RankedTimelineItem {
  const bassPc = maxIndex(window.bassHistogram);
  const scored = scoreTemplates(window.histogram, bassPc, previous)
    .sort((a, b) => b.confidence - a.confidence || a.chord.label.localeCompare(b.chord.label));
  const best = scored[0] ?? {
    chord: makeChordSymbol(0, "maj"),
    confidence: 0,
  };
  const warnings: string[] = [];

  if (window.totalWeight < 0.4) {
    warnings.push("sparse-evidence");
  }
  if (window.totalWeight > 0 && window.melodyWeight / window.totalWeight > 0.45) {
    warnings.push("melody-heavy");
  }
  if (scored[1] && Math.abs(best.confidence - scored[1].confidence) < 0.05) {
    warnings.push("ambiguous-bass");
  }

  return {
    item: {
      bar: window.bar,
      beat: window.beat,
      durationBeats: window.durationBeats,
      chord: best.chord,
      confidence: clamp(best.confidence),
      alternatives: scored.slice(1, 3).map((entry) => ({
        chord: entry.chord,
        confidence: clamp(entry.confidence),
      })),
      warnings,
    },
    rankingScore: rankingScoreFor(best.confidence),
  };
}

export function smoothTimeline(items: ChordTimelineItem[], barLengthBeats = 4): ChordTimelineItem[] {
  return smoothTimelineWithRankingScores(
    items.map((item) => ({ item, rankingScore: item.confidence })),
    barLengthBeats,
  ).map(({ item }) => item);
}

export function extractBlockCandidates(
  timeline: ChordTimelineItem[],
  totalBars: number,
  rankingScores?: readonly number[],
): ProgressionBlockCandidate[] {
  const byBar = chordLabelsByBar(timeline, totalBars);
  const raw: CandidateSelectionEntry[] = [];

  for (const lengthBars of [4, 8, 16] as const) {
    if (totalBars < lengthBars) {
      continue;
    }

    for (let start = 1; start <= totalBars - lengthBars + 1; start += 1) {
      const labels = byBar.slice(start - 1, start - 1 + lengthBars);
      const summaryText = summaryFromLabels(labels);
      const repeatCount = countRepeats(byBar, labels);
      const rankedChords = timeline.flatMap((item, index) =>
        item.bar >= start && item.bar < start + lengthBars
          ? [{ item, rankingScore: rankingScoreAt(rankingScores, index, item.confidence) }]
          : []);
      const chords = rankedChords.map(({ item }) => item);
      const confidence = average(chords.map((item) => item.confidence));
      const rankingScore = average(rankedChords.map((entry) => entry.rankingScore));
      const uniqueCount = new Set(labels).size;
      const repeatBonus = Math.min(0.25, repeatCount * 0.08);
      const diversityBonus = Math.min(0.15, uniqueCount * 0.03);
      const score = rankingScore + repeatBonus + diversityBonus;
      const displayConfidence = confidence + repeatBonus + diversityBonus;

      raw.push({
        dedupeKey: summaryText,
        selectionScore: score,
        candidate: {
          id: `bars-${start}-${start + lengthBars - 1}`,
          startBar: start,
          endBar: start + lengthBars - 1,
          lengthBars,
          chords,
          summaryText,
          confidence: clamp(displayConfidence),
          ...(repeatCount > 1 ? { repeatCount } : {}),
          labels: blockLabels(start, lengthBars, repeatCount, displayConfidence),
          warnings: [...new Set(chords.flatMap((item) => item.warnings))],
        },
      });
    }
  }

  return selectProgressionCandidates(raw, totalBars);
}

function smoothTimelineWithRankingScores(
  items: readonly RankedTimelineItem[],
  barLengthBeats: number,
): RankedTimelineItem[] {
  const adjusted = items.map((entry) => ({
    ...entry,
    item: { ...entry.item },
  }));

  for (let index = 1; index < adjusted.length - 1; index += 1) {
    const previous = adjusted[index - 1].item;
    const current = adjusted[index].item;
    const next = adjusted[index + 1].item;
    if (
      previous.chord.label === next.chord.label
      && current.chord.label !== previous.chord.label
      && current.confidence < previous.confidence + 0.08
    ) {
      adjusted[index] = {
        ...adjusted[index],
        item: {
          ...current,
          chord: previous.chord,
          confidence: Math.max(current.confidence, previous.confidence * 0.92),
        },
      };
    }
  }

  const merged: RankedTimelineItem[] = [];
  for (const current of adjusted) {
    const previous = merged[merged.length - 1];
    if (
      previous
      && previous.item.chord.label === current.item.chord.label
      && absoluteBeat(previous.item.bar, previous.item.beat, barLengthBeats)
        + previous.item.durationBeats
        >= absoluteBeat(current.item.bar, current.item.beat, barLengthBeats)
    ) {
      previous.item.durationBeats += current.item.durationBeats;
      previous.item.confidence = clamp(
        (previous.item.confidence + current.item.confidence) / 2,
      );
      previous.item.warnings = [
        ...new Set([...previous.item.warnings, ...current.item.warnings]),
      ];
      previous.rankingScore = (previous.rankingScore + current.rankingScore) / 2;
      continue;
    }
    merged.push({ ...current, item: { ...current.item } });
  }

  return merged;
}

function rankingScoreAt(
  rankingScores: readonly number[] | undefined,
  index: number,
  fallback: number,
): number {
  const rankingScore = rankingScores?.[index];
  return rankingScore !== undefined && Number.isFinite(rankingScore)
    ? rankingScore
    : fallback;
}

function rankingScoreFor(rawMatchScore: number): number {
  if (rawMatchScore <= 1) return rawMatchScore;
  return 1 + rawMatchScore * rankingResolution;
}

function scoreTemplates(histogram: number[], bassPc: number, previous?: ChordSymbol) {
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return [{ chord: previous ?? makeChordSymbol(0, "maj"), confidence: 0.2 }];
  }

  const entries: Array<{ chord: ChordSymbol; confidence: number }> = [];
  for (let root = 0; root < 12; root += 1) {
    for (const template of templates) {
      const pcs = template.intervals.map((interval) => normalizePc(root + interval));
      const hit = pcs.reduce((sum, pc) => sum + histogram[pc], 0);
      const outside = histogram.reduce(
        (sum, value, pc) => sum + (pcs.includes(pc) ? 0 : value),
        0,
      );
      const rootWeight = histogram[root] / total;
      const bassBonus = bassPc === root ? 0.18 : pcs.includes(bassPc) ? 0.08 : -0.04;
      const extensionPenalty = Math.max(0, pcs.length - 4) * 0.015;
      const confidence = hit / total - outside / total * 0.12 + rootWeight * 0.12 + bassBonus - extensionPenalty;
      const bass = bassPc !== root && pcs.includes(bassPc) ? bassPc : undefined;
      const chord = makeChordSymbol(root, template.quality, [], bass);
      entries.push({ chord: { ...chord, label: labelFromSymbol(chord) }, confidence });
    }
  }

  return entries;
}

function detectKey(notes: TimedNote[]): string | undefined {
  if (notes.length === 0) {
    return undefined;
  }
  const histogram = Array(12).fill(0) as number[];
  for (const note of notes) {
    histogram[normalizePc(note.pitch)] += Math.max(1, note.durationTick) * note.velocity;
  }
  const root = maxIndex(histogram);
  return `${["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][root]} major`;
}

function chordLabelsByBar(timeline: ChordTimelineItem[], totalBars: number): string[] {
  const labels: string[] = [];
  for (let bar = 1; bar <= totalBars; bar += 1) {
    const items = timeline.filter((item) => item.bar === bar);
    labels.push(
      items.sort((a, b) => b.durationBeats - a.durationBeats || b.confidence - a.confidence)[0]
        ?.chord.label ?? "N.C.",
    );
  }
  return labels;
}

function summaryFromLabels(labels: string[]): string {
  return `| ${labels.join(" | ")} |`;
}

function countRepeats(allLabels: string[], labels: string[]): number {
  let count = 0;
  for (let index = 0; index <= allLabels.length - labels.length; index += 1) {
    const candidate = allLabels.slice(index, index + labels.length);
    if (candidate.every((label, labelIndex) => label === labels[labelIndex])) {
      count += 1;
    }
  }
  return count;
}

function blockLabels(startBar: number, lengthBars: number, repeatCount: number, score: number): string[] {
  const labels: string[] = [];
  if (repeatCount > 1 || score > 0.78) {
    labels.push("main");
  }
  if (startBar === 1) {
    labels.push("intro-like");
  }
  if (lengthBars === 4) {
    labels.push("turnaround");
  }
  if (labels.length === 0) {
    labels.push("variation");
  }
  return labels;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageSimultaneity(notes: TimedNote[]): number {
  if (notes.length === 0) {
    return 0;
  }
  const starts = new Map<number, number>();
  for (const note of notes) {
    starts.set(note.startTick, (starts.get(note.startTick) ?? 0) + 1);
  }
  return average([...starts.values()]);
}

function overlaps(note: TimedNote, startTick: number, endTick: number): boolean {
  return note.startTick < endTick && note.startTick + note.durationTick > startTick;
}

function beatPositionFactor(startBeat: number, barLengthBeats: number): number {
  if (startBeat % barLengthBeats === 0) {
    return 1.5;
  }
  if (Number.isInteger(startBeat)) {
    return 1.2;
  }
  return 0.8;
}

function absoluteBeat(bar: number, beat: number, barLengthBeats: number): number {
  return (bar - 1) * barLengthBeats + (beat - 1);
}

function emptyAnalysis(data: MidiSongData, options: AnalyzeMidiOptions): MidiProgressionAnalysis {
  return {
    ...(options.sourceAssetId ? { sourceAssetId: options.sourceAssetId } : {}),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    totalBars: data.totalBars,
    ...(data.tempo ? { bpm: Math.round(data.tempo) } : {}),
    ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}),
    fullTimeline: [],
    blockCandidates: [],
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion,
  };
}

function rangeFactor(pitch: number): number {
  if (pitch < 48) {
    return 1.4;
  }
  if (pitch >= 72) {
    return 0.6;
  }
  return 1;
}

function velocityFactor(velocity: number): number {
  return 0.7 + clamp(velocity) * 0.5;
}

function roleFactor(role: TrackRole): number {
  if (role === "bass") return 1.5;
  if (role === "harmony") return 1.3;
  if (role === "melody") return 0.5;
  if (role === "percussion") return 0;
  return 1;
}

function maxIndex(values: number[]): number {
  let bestIndex = 0;
  let bestValue = Number.NEGATIVE_INFINITY;
  values.forEach((value, index) => {
    if (value > bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}
