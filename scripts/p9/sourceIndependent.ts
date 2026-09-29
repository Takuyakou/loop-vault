/** P9.1 research only: source-note selection without chord identity. */
import type { TimedNote, Voice } from "../../src/domain/midi/types";

export type SourcePolicy = "densest" | "onset-support" | "duration-support" | "role-aware-union";
export interface SourceWindow {
  startBeat: number;
  endBeat: number;
}
export interface SourceSelection {
  midiNotes: number[];
  bassNote?: number;
  candidateCount: number;
}
interface Note {
  pitch: number;
  start: number;
  end: number;
  role: Voice["inferredRole"];
  confidence: number;
}
const unique = (values: number[]): number[] => [...new Set(values)].sort((a, b) => a - b);
function clipped(notes: readonly TimedNote[], ppq: number, window: SourceWindow, voices: readonly Voice[]): Note[] {
  const byTrack = new Map(voices.map((voice) => [String(voice.trackIndex) + ":" + String(voice.channel), voice]));
  return notes.flatMap((note) => {
    const voice = byTrack.get(String(note.trackIndex) + ":" + String(note.channel));
    const start = Math.max(window.startBeat, note.startTick / ppq);
    const end = Math.min(window.endBeat, (note.startTick + note.durationTick) / ppq);
    if (note.channel === 9 || voice?.inferredRole === "percussion" || end <= start || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) return [];
    return [{ pitch: note.pitch, start, end, role: voice?.inferredRole ?? "mixed", confidence: voice?.roleConfidence ?? 0 }];
  });
}
function bass(notes: Note[], selected: number[]): number | undefined {
  return unique(notes.filter((note) => note.role === "bass" && selected.includes(note.pitch)).map((note) => note.pitch))[0] ?? selected[0];
}
function intervals(notes: Note[]): Array<{ notes: Note[]; start: number; end: number }> {
  const boundaries = uniqueTimes(notes.flatMap((note) => [note.start, note.end]));
  return boundaries.slice(0, -1).map((start, index) => ({
    start, end: boundaries[index + 1]!,
    notes: notes.filter((note) => note.start <= start && note.end >= boundaries[index + 1]!),
  })).filter((period) => period.notes.length >= 2);
}
function uniqueTimes(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
export function selectSourceNotes(
  notes: readonly TimedNote[], ppq: number, window: SourceWindow,
  voices: readonly Voice[], policy: SourcePolicy,
): SourceSelection {
  if (!(ppq > 0 && window.endBeat > window.startBeat)) return { midiNotes: [], candidateCount: 0 };
  const source = clipped(notes, ppq, window, voices);
  const spans = intervals(source);
  if (source.length === 0) return { midiNotes: [], candidateCount: 0 };
  let chosen: number[];
  if (policy === "densest") {
    const best = [...spans].sort((a, b) =>
      unique(b.notes.map((note) => note.pitch)).length - unique(a.notes.map((note) => note.pitch)).length
      || (b.end - b.start) - (a.end - a.start) || a.start - b.start)[0];
    chosen = best ? unique(best.notes.map((note) => note.pitch)) : [];
  } else if (policy === "onset-support") {
    const starts = uniqueTimes(source.map((note) => note.start));
    const candidates = starts.map((start) => {
      const active = source.filter((note) => note.start <= start && note.end > start);
      const pitches = unique(active.map((note) => note.pitch));
      const support = active.reduce((sum, note) => sum + Math.min(note.end - start, window.endBeat - start), 0);
      return { start, pitches, support };
    }).filter((candidate) => candidate.pitches.length >= 2);
    const best = candidates.sort((a, b) => b.support - a.support || a.start - b.start)[0];
    chosen = best?.pitches ?? [];
  } else {
    const support = new Map<number, number>();
    for (const note of source) {
      const roleWeight = policy === "role-aware-union"
        ? note.role === "melody" && note.confidence >= 0.65 ? 0.2 : note.role === "bass" || note.role === "harmony" ? 1 : 0.75
        : 1;
      support.set(note.pitch, (support.get(note.pitch) ?? 0) + (note.end - note.start) * roleWeight);
    }
    const duration = window.endBeat - window.startBeat;
    const threshold = policy === "role-aware-union" ? 0.25 : 0.35;
    chosen = unique([...support].filter(([, value]) => value >= duration * threshold).map(([pitch]) => pitch));
  }
  chosen = chosen.slice(0, 10);
  return { midiNotes: chosen, bassNote: bass(source, chosen), candidateCount: spans.length };
}

/** Public-Gold diagnostic only; the selector never receives Gold. */
export function inspectSourceCandidates(
  notes: readonly TimedNote[], ppq: number, window: SourceWindow, voices: readonly Voice[],
): { rawUnion: number[]; simultaneous: number[][] } {
  const source = clipped(notes, ppq, window, voices);
  const simultaneous = intervals(source).map((period) => unique(period.notes.map((note) => note.pitch)));
  return { rawUnion: unique(source.map((note) => note.pitch)), simultaneous };
}
