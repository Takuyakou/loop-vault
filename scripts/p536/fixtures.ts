/**
 * P5.36-01 deterministic synthetic fixtures (privacy-safe) for attack-provenance
 * instrumentation. PPQ 96, 4/4, single track; one 2-beat window (window 0) with
 * two 1-beat buckets B0=[0,1) and B1=[1,2). None reconstruct private material.
 *
 * These exercise the CRITICAL distinction (§3): multiple attack regions in one
 * 2-beat window do NOT imply multiple harmonies. Same-chord re-attack, a rolled
 * chord, an arpeggio, and a layered extended chord are single harmonies that can
 * still show >1 onset cluster or cross-bucket PC difference; only the true
 * two-harmony fixture has genuinely distinct per-bucket evidence.
 */

import type { MidiSongData, TimedNote } from "../../src/domain/midi/types";

const TPB = 96;
const BEAT = TPB;

interface NoteSpec {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity?: number;
  trackIndex?: number;
}

export function song(notes: NoteSpec[], totalBars = 1): MidiSongData {
  const built: TimedNote[] = notes.map((n) => ({
    pitch: n.pitch,
    startTick: n.startTick,
    durationTick: n.durationTick,
    velocity: n.velocity ?? 100,
    trackIndex: n.trackIndex ?? 0,
  }));
  return { notes: built, ticksPerBeat: TPB, timeSignature: "4/4", totalBars, tracks: [], controlChanges: [] };
}

// --- Hard negatives: one harmony, but not a naive single attack region. ---

/** Same chord (Bm7) struck on beat 0 and re-struck on beat 1 — identical PCs. */
export const sameChordReattack = song([
  ...[47, 50, 54, 57].map((pitch) => ({ pitch, startTick: 0, durationTick: BEAT })),
  ...[47, 50, 54, 57].map((pitch) => ({ pitch, startTick: BEAT, durationTick: BEAT })),
]);

/** One Bm7 rolled across the beat boundary, with B held as the sounding bass. */
export const rolledOneChord = song([
  { pitch: 47, startTick: 0, durationTick: 2 * BEAT }, // B held (bass sounds through both buckets)
  { pitch: 50, startTick: 48, durationTick: 144 }, // D (bucket 0)
  { pitch: 54, startTick: BEAT, durationTick: BEAT }, // F# (bucket 1)
  { pitch: 57, startTick: 144, durationTick: 48 }, // A (bucket 1)
]);

/** One C-major triad arpeggiated in four steps across the two buckets. */
export const arpeggiatedOneChord = song([
  { pitch: 48, startTick: 0, durationTick: 48 }, // C (bucket 0)
  { pitch: 52, startTick: 48, durationTick: 48 }, // E (bucket 0)
  { pitch: 55, startTick: BEAT, durationTick: 48 }, // G (bucket 1)
  { pitch: 60, startTick: 144, durationTick: 48 }, // C (bucket 1)
]);

/** One Cmaj9 layered: root/3rd/7th on beat 0, 9th/5th on beat 1, C held as bass. */
export const layeredExtendedChord = song([
  { pitch: 48, startTick: 0, durationTick: 2 * BEAT }, // C held (bass)
  { pitch: 52, startTick: 0, durationTick: 2 * BEAT }, // E
  { pitch: 59, startTick: 0, durationTick: 2 * BEAT }, // B (maj7)
  { pitch: 62, startTick: BEAT, durationTick: BEAT }, // D (9)
  { pitch: 55, startTick: BEAT, durationTick: BEAT }, // G (5)
]);

// --- True positive: two distinct harmonies in one window. ---

/** Beat 0 = C major, beat 1 = A major (distinct PCs, bass moves C -> A). */
export const trueTwoHarmony = song([
  ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: BEAT })), // C E G
  ...[45, 49, 64].map((pitch) => ({ pitch, startTick: BEAT, durationTick: BEAT })), // A C# E (A major)
]);

/** Same harmony (C major upper held), but the sounding bass moves C -> E (a C/E turn). */
export const structuralBassChange = song([
  { pitch: 36, startTick: 0, durationTick: BEAT }, // C2 bass (bucket 0)
  { pitch: 48, startTick: 0, durationTick: 2 * BEAT }, // C upper held
  { pitch: 52, startTick: 0, durationTick: 2 * BEAT }, // E held
  { pitch: 55, startTick: 0, durationTick: 2 * BEAT }, // G held
  { pitch: 40, startTick: BEAT, durationTick: BEAT }, // E2 bass (bucket 1)
]);

/** Syncopated late attack (B on beat 1.5) over a held C major. */
export const syncopatedAttack = song([
  ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: 2 * BEAT })), // C E G held
  { pitch: 59, startTick: 144, durationTick: 48 }, // B at beat 1.5 (bucket 1)
]);

/** A late attack near the B0/B1 boundary, offset by `offset` ticks (boundary ±1 test). */
export function boundaryCase(offset: number): MidiSongData {
  return song([
    ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: 2 * BEAT })), // C E G held
    { pitch: 62, startTick: BEAT + offset, durationTick: 48 }, // D near the boundary
  ]);
}

export const TICKS_PER_BEAT = TPB;
