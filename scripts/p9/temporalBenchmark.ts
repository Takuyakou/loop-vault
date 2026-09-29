/** Public synthetic P9.2 offline resource profile; no private input. */
import { performance } from "node:perf_hooks";
import type { MidiSongData } from "../../src/domain/midi/types";
import { buildTemporalSourceEvidence } from "./temporalSourceEvidence";
import { proposeTemporalHeads, selectTemporalBoundaries } from "./temporalV2";

for (const [minutes, bpm] of [[3, 120], [5, 120], [10, 120], [10, 240]] as const) {
  const beats = minutes * bpm;
  const notes = Array.from({ length: beats }, (_, beat) => [48, 55, 59, 64].map((pitch) => ({
    pitch, startTick: beat * 480, durationTick: 480, velocity: 0.8, trackIndex: 0, channel: 0,
  }))).flat();
  const data: MidiSongData = { notes, tempo: bpm, tempoChanges: [{ tick: 0, bpm }],
    timeSignature: "1/4", ticksPerBeat: 480, totalBars: beats,
    tracks: [{ index: 0, name: "Public synthetic" }], controlChanges: [] };
  const started = performance.now(), initialHeap = process.memoryUsage().heapUsed;
  const evidence = buildTemporalSourceEvidence(data);
  const source = proposeTemporalHeads(evidence);
  const selected = {
    harmonic: selectTemporalBoundaries(source, "HARMONIC", "STRUCTURAL").length,
    voicing: selectTemporalBoundaries(source, "VOICING", "STRUCTURAL").length,
    noteEvent: selectTemporalBoundaries(source, "ORNAMENT_NOTE_EVENT", "STRUCTURAL").length,
  };
  const elapsedMs = performance.now() - started;
  process.stdout.write(JSON.stringify({ minutes, bpm, noteCount: notes.length, sourceBeats: beats,
    proposalCount: source.proposals.HARMONIC.length, selected,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - initialHeap) / 1048576 * 100) / 100,
    heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1048576 * 100) / 100 }) + "\n");
}
