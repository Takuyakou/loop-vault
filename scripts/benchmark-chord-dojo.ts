import { performance } from "node:perf_hooks";
import { stdout } from "node:process";
import { makeChordSymbol } from "../src/domain/chords";
import {
  buildPracticeChordRequirements,
  matchPerformance,
  type PracticeInputSnapshot,
} from "../src/domain/practice";

const requirements = [
  makeChordSymbol(0, "maj7"),
  makeChordSymbol(2, "min7"),
  makeChordSymbol(7, "dom7", ["b9"]),
  makeChordSymbol(5, "maj9"),
].map((chord) => buildPracticeChordRequirements(chord, "normal"));
const inputs: PracticeInputSnapshot[] = [
  snapshot([48, 52, 55, 59], 1),
  snapshot([50, 53, 57, 60], 2),
  snapshot([43, 47, 50, 53, 56], 3),
  snapshot([53, 57, 60, 64, 67], 4),
];
const batchSize = 1_000;
const samples: number[] = [];
let checksum = 0;

for (let warmup = 0; warmup < 10_000; warmup += 1) {
  const result = matchPerformance(
    requirements[warmup % requirements.length]!,
    inputs[warmup % inputs.length]!,
  );
  checksum += result.heldPitchClasses.length;
}

for (let batch = 0; batch < 50; batch += 1) {
  const startedAt = performance.now();
  for (let index = 0; index < batchSize; index += 1) {
    const offset = batch * batchSize + index;
    const result = matchPerformance(
      requirements[offset % requirements.length]!,
      inputs[offset % inputs.length]!,
    );
    checksum += result.missingPitchClasses.length;
  }
  samples.push((performance.now() - startedAt) / batchSize);
}

stdout.write(`Chord Dojo matchPerformance (${samples.length * batchSize} operations)\n`);
stdout.write(`p50 ${percentile(samples, 0.5).toFixed(4)} ms/op\n`);
stdout.write(`p95 ${percentile(samples, 0.95).toFixed(4)} ms/op\n`);
stdout.write(`max ${Math.max(...samples).toFixed(4)} ms/op\n`);
stdout.write(`checksum ${checksum}\n`);

function snapshot(heldMidiNotes: number[], attackRevision: number): PracticeInputSnapshot {
  return {
    heldMidiNotes,
    sustainedMidiNotes: [],
    attackRevision,
    timestampMs: attackRevision * 10,
  };
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
