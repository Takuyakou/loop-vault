import type { Voice } from "../midi/types";
import { SIMULTANEOUS_MIN_DURATION_BEATS } from "./extractionConfig";
import type { VoicingCandidate, VoicingExtractionInput } from "./types";

interface BeatNote {
  pitch: number;
  startBeat: number;
  endBeat: number;
  role: Voice["inferredRole"];
  roleConfidence: number;
}

export function extractionNotes(input: VoicingExtractionInput): BeatNote[] {
  const voices = new Map(
    (input.voices ?? []).map((voice) => [`${voice.trackIndex}:${voice.channel}`, voice]),
  );
  return input.notes.flatMap((note) => {
    const voice = note.channel === undefined
      ? undefined
      : voices.get(`${note.trackIndex}:${note.channel}`);
    const startBeat = note.startTick / input.ticksPerBeat;
    const endBeat = (note.startTick + note.durationTick) / input.ticksPerBeat;
    if (
      !Number.isInteger(note.pitch)
      || note.pitch < 0
      || note.pitch > 127
      || note.durationTick <= 0
      || endBeat <= input.segment.startBeat
      || startBeat >= input.segment.endBeat
      || note.channel === 9
      || voice?.inferredRole === "percussion"
    ) {
      return [];
    }
    return [{
      pitch: note.pitch,
      startBeat: Math.max(startBeat, input.segment.startBeat),
      endBeat: Math.min(endBeat, input.segment.endBeat),
      role: voice?.inferredRole ?? "mixed",
      roleConfidence: voice?.roleConfidence ?? 0,
    }];
  });
}

export function extractSimultaneousCandidates(
  input: VoicingExtractionInput,
): VoicingCandidate[] {
  const notes = extractionNotes(input);
  const boundaries = [...new Set(notes.flatMap((note) => [note.startBeat, note.endBeat]))]
    .sort((left, right) => left - right);
  const candidates: VoicingCandidate[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    if (end - start < SIMULTANEOUS_MIN_DURATION_BEATS) continue;
    const active = notes.filter((note) => note.startBeat <= start && note.endBeat >= end);
    const pitches = [...new Set(active.map((note) => note.pitch))].sort((a, b) => a - b);
    if (pitches.length < 2) continue;
    const nonBass = active.filter((note) => note.role !== "bass");
    const bass = active.filter((note) => note.role === "bass");
    candidates.push({
      midiNotes: pitches,
      bassNote: (bass.length > 0 ? bass : active)
        .map((note) => note.pitch)
        .sort((a, b) => a - b)[0],
      representation: "simultaneous-voicing",
      durationBeats: end - start,
      onsetBeat: start,
      roleScore: average(nonBass.map(roleWeight)),
    });
  }
  return candidates;
}

function roleWeight(note: BeatNote): number {
  const base = {
    harmony: 1,
    pad: 0.72,
    mixed: 0.5,
    bass: 0.55,
    melody: 0.18,
    percussion: 0,
  }[note.role];
  return base * (0.6 + note.roleConfidence * 0.4);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0.45 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
