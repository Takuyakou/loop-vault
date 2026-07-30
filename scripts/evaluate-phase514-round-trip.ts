import { performance } from "node:perf_hooks";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { makeChordSymbol } from "../src/domain/chords";
import { buildProgressionMidi } from "../src/domain/midiExport";
import type {
  ChordQuality,
  ChordSymbol,
  ChordTimelineItem,
  SavedProgressionBlock,
} from "../src/domain/types";

const qualities: readonly ChordQuality[] = [
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
];

const vocabulary = qualities.map((quality, index) =>
  makeChordSymbol((index * 5) % 12, quality),
);
const vocabularyBlock = blockFromChords(vocabulary);
const exported = buildProgressionMidi(vocabularyBlock);
const analysis = analyzeMidi(exported.bytes, {
  mode: "legacy",
  fileName: "phase5.14-round-trip.mid",
});
const comparisons = vocabulary.map((expected, index) => {
  const startBeat = index * 4;
  const actualItem = analysis.fullTimeline.find((item) => {
    const itemStart = (item.bar - 1) * 4 + item.beat - 1;
    return itemStart <= startBeat && startBeat < itemStart + item.durationBeats;
  });
  return {
    index,
    expected: expected.label,
    actual: actualItem?.chord.label,
    classification: classify(expected, actualItem?.chord),
  };
});

const eightChord = blockFromChords(vocabulary.slice(0, 8));
const hundredChord = blockFromChords(
  Array.from({ length: 100 }, (_, index) => vocabulary[index % vocabulary.length]!),
);
const eightTimings = benchmark(() => buildProgressionMidi(eightChord), 100);
const hundredTimings = benchmark(() => buildProgressionMidi(hundredChord), 50);
const heapBefore = process.memoryUsage().heapUsed;
for (let index = 0; index < 500; index += 1) {
  buildProgressionMidi(hundredChord);
}
const heapAfter = process.memoryUsage().heapUsed;

const counts = Object.fromEntries(
  ["exact", "same-root-different-quality", "same-family", "mismatch", "missing"]
    .map((classification) => [
      classification,
      comparisons.filter((item) => item.classification === classification).length,
    ]),
);

console.log(JSON.stringify({
  analyzerMode: "legacy",
  analyzerVersion: analysis.analyzerVersion,
  exporterVersion: "p5.14-v1",
  vocabularySize: vocabulary.length,
  timelineItems: analysis.fullTimeline.length,
  counts,
  comparisons,
  performanceMs: {
    eightChord: summarize(eightTimings),
    hundredChord: summarize(hundredTimings),
  },
  repeatedExport: {
    iterations: 500,
    heapDeltaBytes: heapAfter - heapBefore,
    note: "Heap delta is observational because Node.js GC is not forced.",
  },
}, null, 2));

function blockFromChords(chords: readonly ChordSymbol[]): SavedProgressionBlock {
  return {
    id: "phase5.14-round-trip",
    summaryText: "Synthetic round trip",
    chords: chords.map((chord, index): ChordTimelineItem => ({
      eventId: `event-${index + 1}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    bpm: 120,
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-30T00:00:00.000Z",
    analyzerVersion: "synthetic",
  };
}

function classify(
  expected: ChordSymbol,
  actual: ChordSymbol | undefined,
): "exact" | "same-root-different-quality" | "same-family" | "mismatch" | "missing" {
  if (!actual) return "missing";
  if (
    expected.root === actual.root
    && expected.quality === actual.quality
    && (expected.bass ?? expected.root) === (actual.bass ?? actual.root)
  ) {
    return "exact";
  }
  if (expected.root === actual.root) return "same-root-different-quality";
  if (qualityFamily(expected.quality) === qualityFamily(actual.quality)) {
    return "same-family";
  }
  return "mismatch";
}

function qualityFamily(quality: ChordQuality): string {
  if (["maj", "maj7", "maj9", "add9", "six", "sixNine"].includes(quality)) {
    return "major";
  }
  if (["min", "min7", "min9", "min11", "min6"].includes(quality)) {
    return "minor";
  }
  if (["dom7", "dom9", "dom13", "dom7sus4"].includes(quality)) {
    return "dominant";
  }
  if (["dim", "dim7", "min7b5"].includes(quality)) return "diminished";
  if (["sus2", "sus4"].includes(quality)) return "suspended";
  return quality;
}

function benchmark(callback: () => unknown, iterations: number): number[] {
  return Array.from({ length: iterations }, () => {
    const started = performance.now();
    callback();
    return performance.now() - started;
  });
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    iterations: values.length,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted.at(-1) ?? 0,
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return Number((sorted[index] ?? 0).toFixed(3));
}
