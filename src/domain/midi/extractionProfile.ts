import type { MidiSongData, TimedNote, TrackRole } from "./types";

/**
 * Robustness for AI-extracted MIDI.
 *
 * Audio-to-MIDI extraction fragments held chords into short repeated notes and
 * puts every stem on one channel. That makes a sustained pad look like a busy
 * melodic part, so role inference misreads it and harmony evidence is lost.
 *
 * The repair applies to analysis only. Raw notes are never merged, no attack is
 * removed, and playback, saving and export keep the file exactly as parsed —
 * the fragmentation is audible material, not noise to clean up.
 */

export interface ExtractionProfile {
  detected: true;
  confidence: number;
  reasons: string[];
  /** Track name hints, used as a prior once the profile has fired. */
  roleHints: Map<number, TrackRole>;
}

export interface ParsedMidi {
  /** Exactly as parsed. Used for preview, saving, display and export. */
  rawNotes: TimedNote[];
  /** Repaired copy. Used for harmony evidence, roles and segmentation. */
  analysisNotes: TimedNote[];
  extractionProfile: ExtractionProfile | null;
}

/** Gap at or below a sixteenth note is treated as one sustained tone. */
export const LEGATO_GAP_BEATS = 0.25;

const STEM_NAME_PATTERN = /^(voice|vocal|drums?|bass|lead|pad|guitar|piano|keys|synth|other|accompaniment|melody)/i;

const NAME_ROLE_HINTS: Array<[RegExp, TrackRole]> = [
  [/pad/i, "harmony"],
  [/bass/i, "bass"],
  [/lead/i, "melody"],
  [/guitar/i, "harmony"],
  [/piano|keys/i, "harmony"],
  [/voice|vocal/i, "mixed"],
  [/drum|perc/i, "percussion"],
];

function shortNoteRatio(notes: readonly TimedNote[], ticksPerBeat: number): number {
  if (notes.length === 0) return 0;
  const short = notes.filter((note) => note.durationTick / ticksPerBeat <= LEGATO_GAP_BEATS).length;
  return short / notes.length;
}

/**
 * Detects the profile from several signals at once.
 *
 * Every condition must hold: a single stem-like track name, or a single busy
 * channel, is ordinary in hand-written MIDI too. Requiring the combination is
 * what keeps this from firing on a normal arrangement.
 */
export function detectExtractionProfile(data: MidiSongData): ExtractionProfile | null {
  const pitched = data.notes.filter((note) => note.channel !== 9);
  if (pitched.length === 0) return null;

  const reasons: string[] = [];
  const channels = new Set(pitched.map((note) => note.channel ?? 0));
  const onOneChannel = channels.size === 1;
  if (onOneChannel) reasons.push("all-pitched-tracks-on-one-channel");

  const named = data.tracks.filter((track) => track.name && STEM_NAME_PATTERN.test(track.name));
  const stemNaming = named.length >= 3;
  if (stemNaming) reasons.push("stem-style-track-names");

  const fragmentation = shortNoteRatio(pitched, data.ticksPerBeat);
  const fragmented = fragmentation >= 0.1;
  if (fragmented) reasons.push("high-short-note-ratio");

  // Extraction separates parts by stem, so each track occupies its own register.
  const trackPitches = data.tracks.map((track) => {
    const notes = pitched.filter((note) => note.trackIndex === track.index);
    return notes.length === 0 ? null
      : notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length;
  }).filter((value): value is number => value !== null);
  const separated = trackPitches.length >= 3
    && Math.max(...trackPitches) - Math.min(...trackPitches) >= 12;
  if (separated) reasons.push("stem-style-role-separation");

  if (!(onOneChannel && stemNaming && fragmented && separated)) return null;

  const roleHints = new Map<number, TrackRole>();
  for (const track of data.tracks) {
    const hint = NAME_ROLE_HINTS.find(([pattern]) => track.name && pattern.test(track.name));
    if (hint) roleHints.set(track.index, hint[1]);
  }

  return {
    detected: true,
    confidence: Number(Math.min(1, 0.4 + fragmentation).toFixed(4)),
    reasons,
    roleHints,
  };
}

/**
 * Joins repeated notes of the same pitch in the same track for analysis.
 *
 * Only occupancy changes: the merged note spans from the first attack to the
 * last release, so a fragmented pad reads as the sustained chord it represents.
 */
export function repairLegato(
  notes: readonly TimedNote[],
  ticksPerBeat: number,
  gapBeats = LEGATO_GAP_BEATS,
): TimedNote[] {
  const gapTicks = gapBeats * ticksPerBeat;
  const byVoice = new Map<string, TimedNote[]>();
  for (const note of notes) {
    const key = `${note.trackIndex}:${note.channel ?? 0}:${note.pitch}`;
    byVoice.set(key, [...(byVoice.get(key) ?? []), note]);
  }

  const repaired: TimedNote[] = [];
  for (const group of byVoice.values()) {
    const ordered = [...group].sort((left, right) => left.startTick - right.startTick);
    let current = { ...ordered[0] };
    for (const note of ordered.slice(1)) {
      const currentEnd = current.startTick + current.durationTick;
      if (note.startTick - currentEnd <= gapTicks) {
        current.durationTick = Math.max(currentEnd, note.startTick + note.durationTick) - current.startTick;
        current.velocity = Math.max(current.velocity, note.velocity);
      } else {
        repaired.push(current);
        current = { ...note };
      }
    }
    repaired.push(current);
  }

  return repaired.sort(
    (left, right) => left.startTick - right.startTick
      || left.pitch - right.pitch
      || left.trackIndex - right.trackIndex,
  );
}

/** Relaxed role thresholds, applied only while the profile is active. */
export const extractionRoleThresholds = {
  harmonyPolyphony: 1.5,
  harmonyDuration: 0.9,
} as const;

export const defaultRoleThresholds = {
  harmonyPolyphony: 2.2,
  harmonyDuration: 1.3,
} as const;

export function prepareMidiForAnalysis(data: MidiSongData): ParsedMidi {
  const profile = detectExtractionProfile(data);
  return {
    rawNotes: data.notes,
    analysisNotes: profile ? repairLegato(data.notes, data.ticksPerBeat) : data.notes,
    extractionProfile: profile,
  };
}
