/** P9.3 public synthetic offline benchmark, no private input or Gold. */
import { performance } from "node:perf_hooks";
import type { TimedNote } from "../../src/domain/midi/types";
import { extractSourceV2 } from "./sourceExtractionV2";
const cases = [{ minutes: 3, bpm: 120 }, { minutes: 5, bpm: 120 },
  { minutes: 10, bpm: 120 }, { minutes: 10, bpm: 240 }];
const rows = [];
for (const test of cases) {
  const beats = test.minutes * test.bpm;
  const notes: TimedNote[] = [];
  for (let beat = 0; beat < beats; beat++) for (const pitch of [48, 55, 60, 64])
    notes.push({ pitch, startTick: beat * 480, durationTick: 480, velocity: 80, trackIndex: 0, channel: 0 });
  const started = performance.now();
  let maxHeapMiB = 0, selected = 0, excluded = 0;
  for (let beat = 0; beat < beats; beat++) {
    const result = extractSourceV2(notes, 480, { startBeat: beat, endBeat: beat + 1 }, [],
      [48, 55, 60, 64], "PRODUCT_GUARDED");
    selected += result.selected.length; excluded += result.excluded.length;
    if (beat % 100 === 0) maxHeapMiB = Math.max(maxHeapMiB, process.memoryUsage().heapUsed / 1048576);
  }
  rows.push({ ...test, sourceBeats: beats, noteCount: notes.length, selected,
    excluded, elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    heapUsedMiB: Math.round(maxHeapMiB * 100) / 100 });
}
process.stdout.write(JSON.stringify({ schemaVersion: 1, corpusId: "p9-public-repeated-chord-1-4",
  workload: "offline source truth + candidates + Product-guarded selection per interval", rows }, null, 2) + "\n");
