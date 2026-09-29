/** P9.3 research-only, reversible note evidence and bounded snapshot candidates. */
import type { TimedNote, Voice } from "../../src/domain/midi/types";
import type { SourceWindow } from "./sourceIndependent";

export type ExtractionPolicy = "PRODUCT" | "SOURCE_RANK" | "PRODUCT_GUARDED" | "PRODUCT_SAFE_PRUNE";
export interface NoteEvidence {
  id: string; pitch: number; onsetTick: number; offsetTick: number; velocity: number;
  trackIndex: number; channel: number; role: Voice["inferredRole"]; roleConfidence: number;
}
export interface SnapshotHypothesis { kind: string; midiNotes: number[]; evidenceIds: string[]; score: number }
export interface ExcludedEvidence { id: string; reason: "percussion" | "not-selected"; restorable: boolean }
export interface ExtractionResult {
  sourceTruth: NoteEvidence[]; candidates: SnapshotHypothesis[]; selected: number[];
  excluded: ExcludedEvidence[]; selectedKind: string;
}
const unique = (values: readonly number[]) => [...new Set(values)].sort((a, b) => a - b);
const same = (left: readonly number[], right: readonly number[]) => left.length === right.length && left.every((n, i) => n === right[i]);
const overlap = (note: NoteEvidence, start: number, end: number) => Math.max(0, Math.min(note.offsetTick, end) - Math.max(note.onsetTick, start));

export function extractSourceV2(notes: readonly TimedNote[], ppq: number, window: SourceWindow,
  voices: readonly Voice[], productNotes: readonly number[] = [], policy: ExtractionPolicy = "SOURCE_RANK"): ExtractionResult {
  if (!Number.isFinite(ppq) || ppq <= 0 || !Number.isFinite(window.startBeat)
    || !Number.isFinite(window.endBeat) || window.endBeat <= window.startBeat) throw new Error("Invalid source window");
  const start = Math.round(window.startBeat * ppq), end = Math.round(window.endBeat * ppq);
  const voiceMap = new Map(voices.map((voice) => [voice.trackIndex + ":" + voice.channel, voice]));
  const sourceTruth: NoteEvidence[] = notes.map((note, index) => {
    const channel = note.channel ?? 0;
    const voice = voiceMap.get(note.trackIndex + ":" + channel);
    return { id: "n" + index, pitch: note.pitch, onsetTick: note.startTick,
      offsetTick: note.startTick + note.durationTick, velocity: note.velocity, trackIndex: note.trackIndex, channel,
      role: voice?.inferredRole ?? "mixed", roleConfidence: voice?.roleConfidence ?? 0 };
  });
  const relevant = sourceTruth.filter((note) => note.pitch >= 0 && note.pitch <= 127 && note.channel !== 9
    && note.role !== "percussion" && overlap(note, start, end) > 0);
  const baseline = unique(productNotes);
  const candidates: SnapshotHypothesis[] = [];
  const add = (kind: string, selected: readonly NoteEvidence[], bonus = 0) => {
    const midiNotes = unique(selected.map((note) => note.pitch));
    if (!midiNotes.length || midiNotes.length > 12 || candidates.some((entry) => same(entry.midiNotes, midiNotes))) return;
    const support = selected.reduce((sum, note) => sum + overlap(note, start, end) / (end - start), 0);
    const role = selected.reduce((sum, note) => sum + (note.role === "melody" && note.roleConfidence >= .65 ? -.45
      : note.role === "harmony" || note.role === "bass" ? .2 : 0), 0);
    const coherence = selected.length ? Math.max(0, 1 - (Math.max(...selected.map((n) => n.onsetTick))
      - Math.min(...selected.map((n) => n.onsetTick))) / (end - start)) : 0;
    candidates.push({ kind, midiNotes, evidenceIds: selected.map((note) => note.id),
      score: support / Math.max(1, selected.length) + role / Math.max(1, selected.length)
        + coherence * .3 + bonus - Math.max(0, midiNotes.length - 7) * .05 });
  };
  if (baseline.length) add("product-anchor", relevant.filter((note) => baseline.includes(note.pitch)), .08);
  const ticks = unique(relevant.map((note) => note.onsetTick).filter((tick) => tick >= start && tick < end));
  const onsetTicks = unique([start, ...ticks]);
  for (const tick of onsetTicks.slice(0, 128)) {
    const active = relevant.filter((note) => note.onsetTick <= tick && note.offsetTick > tick);
    add("sounding", active);
    add("sounding-role", active.filter((note) => note.role !== "melody" || note.roleConfidence < .65));
    // Delayed arpeggio support is a source-onset relation; no whole-event duration cutoff.
    add("delayed-support", relevant.filter((note) => note.onsetTick <= tick + ppq / 4
      && note.offsetTick > tick && note.onsetTick < end));
  }
  const support = new Map<number, number>();
  for (const note of relevant) support.set(note.pitch, (support.get(note.pitch) ?? 0) + overlap(note, start, end));
  const maximum = Math.max(0, ...support.values());
  for (const fraction of [0, .2, .4, .6, .8]) add("interval-" + fraction,
    relevant.filter((note) => (support.get(note.pitch) ?? 0) >= maximum * fraction));
  for (const track of unique(relevant.map((note) => note.trackIndex))) {
    add("track-" + track, relevant.filter((note) => note.trackIndex === track));
  }
  // A pitch is never erased from sourceTruth: every unselected note retains an addressable source ID.
  const usable = candidates.filter((candidate) => candidate.midiNotes.length >= 2);
  const ranked = [...usable].sort((a, b) => b.score - a.score
    || a.midiNotes.length - b.midiNotes.length || a.midiNotes.join(",").localeCompare(b.midiNotes.join(",")));
  const winner = policy === "PRODUCT" ? usable.find((candidate) => candidate.kind === "product-anchor")
    : policy === "PRODUCT_GUARDED" ? ranked.find((candidate) => baseline.every((pitch) => candidate.midiNotes.includes(pitch)))
    : ranked[0];
  let selected = winner?.midiNotes ?? baseline;
  if (policy === "PRODUCT_SAFE_PRUNE") {
    const proposal = ranked.find((candidate) => candidate.midiNotes.every((pitch) => baseline.includes(pitch)));
    const maximum = Math.max(0, ...relevant.map((note) => overlap(note, start, end)));
    const omitted = baseline.filter((pitch) => !proposal?.midiNotes.includes(pitch));
    const safe = omitted.length > 0 && omitted.every((pitch) =>
      relevant.filter((note) => note.pitch === pitch).every((note) =>
        note.velocity < 50 && overlap(note, start, end) < maximum * .3));
    selected = safe ? proposal!.midiNotes : baseline;
  }
  const excluded = sourceTruth.filter((note) => overlap(note, start, end) > 0 && !selected.includes(note.pitch))
    .map((note) => ({ id: note.id, reason: note.channel === 9 || note.role === "percussion" ? "percussion" : "not-selected", restorable: true } as ExcludedEvidence));
  return { sourceTruth, candidates, selected, excluded, selectedKind: policy === "PRODUCT_SAFE_PRUNE" && !same(selected, baseline) ? "safe-prune" : winner?.kind ?? "product-fallback" };
}
