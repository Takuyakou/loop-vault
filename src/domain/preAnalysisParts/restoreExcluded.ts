import { normalizeNotes } from "../midi/normalize";
import type { MidiSongData, TimedNote, Voice, VoiceRole } from "../midi/types";
import { annotateVoiceRolesV2 } from "../midi/voiceRoleV2";
import { buildVoices, voiceId } from "../midi/voices";
import type { ExcludedPart } from "./splitSession";

export interface RestoredSource {
  sourceData: MidiSongData;
  sourceVoices: Voice[];
  roleOverrides: Record<string, VoiceRole>;
  /** The ids of the parts that were put back (one per line), for the workspace's melody voices. */
  restoredVoiceIds: string[];
}

/**
 * After the analysis: the notes above a line were not handed to it, so the workspace would not
 * show them. This gives the workspace a copy of the source data in which they are one more track
 * whose role is 「メロディ」. The analysis result, the store's own source data and everything saved
 * are untouched; the notes come back unused, so nothing changes until a person uses them.
 *
 * Only calls (never changes) the analysis's own functions (`buildVoices`, `annotateVoiceRolesV2`).
 */
export function restoreExcludedNotes(input: {
  sourceData: MidiSongData;
  roleOverrides?: Readonly<Record<string, VoiceRole>>;
  excluded: readonly ExcludedPart[];
  /** The name of the part a line belongs to (the screen's part name). */
  nameOf: (partId: string) => string | undefined;
  channelOf: (partId: string) => number;
}): RestoredSource {
  const { sourceData, excluded } = input;
  const roleOverrides: Record<string, VoiceRole> = { ...(input.roleOverrides ?? {}) };
  const usedTracks = sourceData.tracks.map((track) => track.index);
  let nextTrack = Math.max(-1, ...usedTracks, ...sourceData.notes.map((note) => note.trackIndex)) + 1;
  const ppq = sourceData.ticksPerBeat;
  const notes: TimedNote[] = [...sourceData.notes];
  const tracks = [...sourceData.tracks];
  const restoredVoiceIds: string[] = [];
  const names = new Map<string, string>();

  for (const part of excluded) {
    if (!part.notes.length) continue;
    const trackIndex = nextTrack;
    nextTrack += 1;
    const channel = input.channelOf(part.partId);
    for (const note of part.notes) {
      notes.push({
        pitch: note.pitch,
        // The same rounding `buildPreparedMidiSongData` applies.
        startTick: Math.max(0, Math.round(note.startBeat * ppq)),
        durationTick: Math.max(1, Math.round(note.durationBeats * ppq)),
        velocity: note.velocity,
        trackIndex,
        channel,
        ...(note.program !== undefined ? { program: note.program } : {}),
        ...(note.programExplicit !== undefined ? { programExplicit: note.programExplicit } : {}),
      });
    }
    tracks.push({ index: trackIndex, name: "", channel, roleOverride: "melody" });
    const id = voiceId(trackIndex, channel);
    roleOverrides[id] = "melody";
    restoredVoiceIds.push(id);
    const base = input.nameOf(part.partId);
    if (base) names.set(id, `${base}（線より上）`);
  }
  if (!restoredVoiceIds.length) {
    return { sourceData, sourceVoices: [], roleOverrides, restoredVoiceIds };
  }
  notes.sort((a, b) =>
    a.startTick - b.startTick || a.trackIndex - b.trackIndex || a.pitch - b.pitch);
  const augmented: MidiSongData = { ...sourceData, notes, tracks };
  const sourceVoices = annotateVoiceRolesV2(
    buildVoices(augmented),
    normalizeNotes(augmented),
    roleOverrides,
  ).map((voice) => names.has(voice.id) ? { ...voice, trackName: names.get(voice.id)! } : voice);
  return { sourceData: augmented, sourceVoices, roleOverrides, restoredVoiceIds };
}
