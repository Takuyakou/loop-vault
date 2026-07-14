import { Midi } from "@tonejs/midi";
import { performance } from "node:perf_hooks";
import { stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";

const bytes = buildThreeMinuteMidi();
const legacy = measure(() => analyzeMidi(bytes, { mode: "legacy" }));
const hybrid = measure(() => analyzeMidi(bytes, { mode: "hybrid-v1" }));
const reranker = measure(() => analyzeMidi(bytes, { mode: "legacy-boundary-rerank" }));

stdout.write(`Synthetic MIDI: 180 seconds, ${bytes.byteLength} bytes\n`);
stdout.write(`Legacy: ${legacy.elapsedMs.toFixed(1)} ms, heap delta ${legacy.heapDeltaMb.toFixed(2)} MB\n`);
stdout.write(`Hybrid: ${hybrid.elapsedMs.toFixed(1)} ms, heap delta ${hybrid.heapDeltaMb.toFixed(2)} MB\n`);
stdout.write(`Legacy-boundary reranker: ${reranker.elapsedMs.toFixed(1)} ms, heap delta ${reranker.heapDeltaMb.toFixed(2)} MB\n`);
stdout.write(`Ratio: ${(hybrid.elapsedMs / Math.max(legacy.elapsedMs, 0.01)).toFixed(2)}x\n`);
stdout.write(`Reranker ratio: ${(reranker.elapsedMs / Math.max(legacy.elapsedMs, 0.01)).toFixed(2)}x\n`);

function measure(run: () => unknown) {
  run();
  const samples = Array.from({ length: 5 }, () => {
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    run();
    return { elapsedMs: performance.now() - start, heapDeltaMb: (process.memoryUsage().heapUsed - beforeHeap) / 1024 / 1024 };
  });
  return {
    elapsedMs: median(samples.map((sample) => sample.elapsedMs)),
    heapDeltaMb: median(samples.map((sample) => sample.heapDeltaMb)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildThreeMinuteMidi(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  const chords = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]];
  for (let time = 0, index = 0; time < 180; time += 2, index += 1) {
    for (const pitch of chords[index % chords.length]) track.addNote({ midi: pitch, time, duration: 1.9, velocity: 0.8 });
  }
  return new Uint8Array(midi.toArray());
}
