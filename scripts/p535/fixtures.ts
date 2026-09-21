/**
 * P5.35 deterministic synthetic fixtures (privacy-safe) for the temporal-evidence
 * classifier. Built as MidiSongData directly (no MIDI encode/decode needed for a
 * pure timing classifier). PPQ 96, 4/4, single track. None reconstruct any
 * private material. All pitches/onsets are fixed.
 */

import type { MidiSongData, TimedNote } from "../../src/domain/midi/types";

const TPB = 96;
const BEAT = TPB; // 1 beat
const WIN = 2 * TPB; // default 2-beat window

interface NoteSpec {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity?: number;
  trackIndex?: number;
}

export function song(notes: NoteSpec[], totalBars = 4): MidiSongData {
  const built: TimedNote[] = notes.map((n) => ({
    pitch: n.pitch,
    startTick: n.startTick,
    durationTick: n.durationTick,
    velocity: n.velocity ?? 100,
    trackIndex: n.trackIndex ?? 0,
  }));
  return { notes: built, ticksPerBeat: TPB, timeSignature: "4/4", totalBars, tracks: [], controlChanges: [] };
}

/** A chord: all pitches start together for `beats` beats from `startTick`. */
function chord(pitches: number[], startTick: number, beats: number): NoteSpec[] {
  return pitches.map((pitch) => ({ pitch, startTick, durationTick: beats * BEAT }));
}

// --- Fixtures. Each notes which window index to inspect in the test. ---

/** Held Cmaj9: attacks in window 0, all notes sustain through window 1 (no new harmony). */
export const heldHarmony = song(chord([48, 52, 55, 59, 62], 0, 4)); // C E G B D, 4 beats

/** Pad: long sustained Dm9 across windows 0..2, no new attacks after onset. */
export const padSustain = song(chord([50, 53, 57, 60, 64], 0, 6), 4); // D F A C E, 6 beats

/**
 * Common tone: Cmaj7 (window 0) with a mid-voice G sustaining, then Am9 attacks
 * (its own low A bass) at window 1. The sustained G (pc 7) is also freshly
 * attacked by Am9 -> COMMON_TONE (and G is not the bass, so it is not shadowed
 * by the structural-bass role).
 */
export const commonTone = song([
  ...chord([48, 52, 59], 0, 2), // Cmaj7: C E B, window 0 only
  { pitch: 55, startTick: 0, durationTick: 4 * BEAT }, // G sustains through window 1
  ...chord([45, 60, 64, 67, 71], 2 * BEAT, 2), // Am9: A(bass) C E G B at window 1
]);

/**
 * Contamination (P5.34 shape, not the private song): prior Cmaj tones sustain
 * briefly into a window where Bm7 (low B bass) attacks. Sustained C/E/G are
 * foreign to Bm7 -> CARRIED_IN_SUSTAIN; B is the structural bass; D/F#/A attack.
 */
export const contamination = song([
  { pitch: 48, startTick: 0, durationTick: 2 * BEAT + 48 }, // C carries ~half a beat past the boundary
  { pitch: 52, startTick: 0, durationTick: 2 * BEAT + 48 }, // E carryover
  { pitch: 55, startTick: 0, durationTick: 2 * BEAT + 48 }, // G carryover
  ...chord([47, 62, 66, 69], 2 * BEAT, 2), // Bm7: B(low) D F# A at window 1
]);

/** Structural bass slash chord C/E: bass E is a role, not the root (C). */
export const structuralBassSlash = song(chord([40, 60, 64, 67], 0, 2)); // E(bass) C E G

/** Short grace/ornament among a sustained chord (window 0). */
export const shortTransient = song([
  ...chord([48, 55, 64], 0, 2), // C G E held
  { pitch: 66, startTick: 24, durationTick: 24 }, // F# grace, 0.25 beat
]);

/**
 * Bass re-strike across a window boundary: upper C/E/G sustain through window 1
 * while the bass C re-attacks at the window-1 boundary. The re-struck pc is
 * already sustained, so window 1 introduces NO new harmony (held) — the re-strike
 * must not be read as a chord change / carryover.
 */
export const bassRestrike = song([
  { pitch: 48, startTick: 0, durationTick: 2 * BEAT }, // C bass, window 0
  { pitch: 60, startTick: 0, durationTick: 4 * BEAT }, // C upper sustains
  { pitch: 64, startTick: 0, durationTick: 4 * BEAT }, // E sustains
  { pitch: 67, startTick: 0, durationTick: 4 * BEAT }, // G sustains
  { pitch: 48, startTick: 2 * BEAT, durationTick: 2 * BEAT }, // C bass re-strike at window 1
]);

/** Arpeggio: sequential C E G B, each 0.5 beat (real attacks, not transient). */
export const arpeggio = song([
  { pitch: 48, startTick: 0, durationTick: BEAT / 2 },
  { pitch: 60, startTick: BEAT / 2, durationTick: BEAT / 2 },
  { pitch: 64, startTick: BEAT, durationTick: BEAT / 2 },
  { pitch: 67, startTick: (3 * BEAT) / 2, durationTick: BEAT / 2 },
]);

/** Genuine two-chord boundary C -> Am, each attacks fresh at its window (no carry). */
export const genuineTransition = song([
  ...chord([48, 60, 64, 67], 0, 2), // C at window 0
  ...chord([45, 57, 60, 64], 2 * BEAT, 2), // Am at window 1
]);

/** Boundary robustness: Bm7 attacks at the window-1 boundary offset by `offset` ticks. */
export function boundaryCase(offsetTicks: number): MidiSongData {
  return song([
    { pitch: 48, startTick: 0, durationTick: 2 * BEAT }, // prior C, ends at boundary
    ...chord([47, 62, 66, 69], 2 * BEAT + offsetTicks, 2), // Bm7 at boundary ± offset
  ]);
}

export const WINDOW_TICKS = WIN;
export const TICKS_PER_BEAT = TPB;
