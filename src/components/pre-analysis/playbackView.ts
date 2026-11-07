import type { AnalysisSession, PreAnalysisNote } from "../../domain/midi/preAnalysis";

/** Notes longer than this are kept apart, so a long held note does not widen the search for all the others. */
const LONG_NOTE_BEATS = 16;

export interface SoundingIndex {
  /** Notes up to LONG_NOTE_BEATS long, in the order they start. */
  short: readonly PreAnalysisNote[];
  /** The longest of those. */
  maxShort: number;
  /** Longer notes (few). */
  long: readonly PreAnalysisNote[];
}

/**
 * The notes that really sound when the session is played: the same rule as `sessionPreviewNotes`
 * (a part that is used, not a duplicate, its file not muted, solo / mute applied), so what is lit on
 * the roll is what is heard. `playbackView.test.ts` checks that the two agree.
 */
export function audibleNotes(session: AnalysisSession): PreAnalysisNote[] {
  const mutedSources = new Set(
    session.sources.filter((source) => source.muted).map((source) => source.id),
  );
  const voices = session.voices.filter((voice) =>
    voice.included && !voice.duplicateOf && !mutedSources.has(voice.sourceId));
  const solo = voices.filter((voice) => voice.solo);
  const audible = new Set((solo.length ? solo : voices.filter((voice) => !voice.muted)).map((voice) => voice.id));
  return session.notes
    .filter((note) => audible.has(note.voiceId))
    .sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
}

export function buildSoundingIndex(session: AnalysisSession): SoundingIndex {
  const short: PreAnalysisNote[] = [];
  const long: PreAnalysisNote[] = [];
  let maxShort = 0;
  for (const note of audibleNotes(session)) {
    if (note.durationBeats > LONG_NOTE_BEATS) {
      long.push(note);
    } else {
      short.push(note);
      maxShort = Math.max(maxShort, note.durationBeats);
    }
  }
  return { short, maxShort, long };
}

/**
 * The notes with start ≤ beat < end. Only the notes that start shortly before `beat` are looked at
 * (they are in the order they start). When the set is the one of `previous`, `previous` itself is
 * returned, so a caller can tell "nothing changed" by comparing references.
 */
export function soundingAt(
  index: SoundingIndex,
  beat: number,
  previous: readonly PreAnalysisNote[] = [],
): readonly PreAnalysisNote[] {
  const found: PreAnalysisNote[] = [];
  const { short, long } = index;
  let low = 0;
  let high = short.length;
  const from = beat - index.maxShort;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (short[middle]!.startBeat < from) low = middle + 1;
    else high = middle;
  }
  for (let position = low; position < short.length; position += 1) {
    const note = short[position]!;
    if (note.startBeat > beat) break;
    if (beat < note.startBeat + note.durationBeats) found.push(note);
  }
  for (const note of long) {
    if (note.startBeat <= beat && beat < note.startBeat + note.durationBeats) found.push(note);
  }
  return found.length === previous.length && found.every((note, position) => note === previous[position])
    ? previous
    : found;
}

const PITCH_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** 「鳴っている音 C3 E3 G3」: the pitches that sound, lowest first, each once. Empty when nothing sounds. */
export function soundingText(sounding: readonly PreAnalysisNote[]): string {
  if (!sounding.length) return "";
  const pitches = [...new Set(sounding.map((note) => note.pitch))].sort((a, b) => a - b);
  return `鳴っている音 ${pitches.map((pitch) => `${PITCH_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`).join(" ")}`;
}
