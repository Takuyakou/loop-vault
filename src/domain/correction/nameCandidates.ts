import { noteNameFromPitchClass } from "../chords";
import { chordPitchClasses } from "../chordVoicing";
import { detectLiveChord } from "../liveMidi/liveChordDetector";
import { createLiveNoteState, toNoteKey } from "../liveMidi/noteState";
import type { ChordSymbol } from "../types";

/** Name candidates and chord-tone hints for one card (spec v2.2 §8.4, §6.4). */

const MAX_CANDIDATES = 4;

interface PitchedNote {
  pitch: number;
  used: boolean;
}

function detect(pitches: readonly number[]) {
  const state = createLiveNoteState();
  for (const pitch of pitches) state.held.set(toNoteKey(0, pitch), { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 });
  return detectLiveChord(state);
}

/**
 * Up to four names: the used notes' own reading (detectLiveChord, at most three)
 * first, then the analysis alternatives, without repeats. Never padded.
 * Two or fewer pitch classes give only the analysis alternatives.
 */
export function nameCandidatesFor(
  card: { alternatives: readonly ChordSymbol[] },
  notes: readonly PitchedNote[],
): ChordSymbol[] {
  const pitches = [...new Set(notes.filter((note) => note.used).map((note) => note.pitch))];
  const detection = new Set(pitches.map((pitch) => pitch % 12)).size >= 3 ? detect(pitches) : undefined;
  const detected = detection?.kind === "chord" && detection.chord
    ? [detection.chord, ...detection.alternatives.map((alternative) => alternative.chord)]
    : [];
  const out: ChordSymbol[] = [];
  for (const chord of [...detected, ...card.alternatives]) {
    if (out.length === MAX_CANDIDATES) break;
    if (!out.some((existing) => existing.label === chord.label)) out.push(chord);
  }
  return out;
}

/** The name the used notes would read as without one pitch, when one is found. */
export function nameAfterRemoving(notes: readonly PitchedNote[], pitch: number): string | undefined {
  const rest = [...new Set(notes.filter((note) => note.used && note.pitch !== pitch).map((note) => note.pitch))];
  if (new Set(rest.map((value) => value % 12)).size < 3) return undefined;
  const detection = detect(rest);
  return detection.kind === "chord" ? detection.label : undefined;
}

export interface ChordToneDiff {
  chordTones: string[];
  currentTones: string[];
  /** In the name's chord tones but not in the used notes: shown as "追加候補（参考）". */
  addable: string[];
}

export function chordToneDiff(name: ChordSymbol, notes: readonly PitchedNote[]): ChordToneDiff {
  const tones = chordPitchClasses(name);
  const current = [...new Set(notes.filter((note) => note.used).map((note) => note.pitch % 12))].sort((a, b) => a - b);
  // Chord tones from the root upwards, as a player would say them.
  const fromRoot = [...tones].sort((a, b) => ((a - name.root + 12) % 12) - ((b - name.root + 12) % 12));
  return {
    chordTones: fromRoot.map(noteNameFromPitchClass),
    currentTones: current.map(noteNameFromPitchClass),
    addable: fromRoot.filter((pc) => !current.includes(pc)).map(noteNameFromPitchClass),
  };
}
