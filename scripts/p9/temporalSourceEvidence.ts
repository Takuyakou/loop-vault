/** P9.2 research adapter: source facts only, no analyzer identity or Gold input. */
import type { MidiSongData } from "../../src/domain/midi/types";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { buildVoices } from "../../src/domain/midi/voices";
import { annotateVoiceRolesV2 } from "../../src/domain/midi/voiceRoleV2";

export interface TemporalSourceNote {
  pitch: number;
  onsetTick: number;
  offsetTick: number;
  sustainedEndTick: number;
  channel?: number;
  role: { melody: number };
  reStruck: boolean;
}
export interface SourceEvidenceBundle {
  ppq: number;
  timeSignature?: string;
  notes: TemporalSourceNote[];
}
const key = (track: number, channel: number | undefined, pitch: number) =>
  String(track) + ":" + String(channel ?? -1) + ":" + String(pitch);
export function buildTemporalSourceEvidence(data: MidiSongData): SourceEvidenceBundle {
  if (!Number.isSafeInteger(data.ticksPerBeat) || data.ticksPerBeat <= 0 || data.notes.length > 10000) {
    throw new Error("Invalid temporal source budget or PPQ");
  }
  const sourceEnd = Math.max(0, ...data.notes.map((note) => note.startTick + note.durationTick));
  if (sourceEnd / data.ticksPerBeat > 2400) throw new Error("Temporal source beat budget exceeded");
  const voices = annotateVoiceRolesV2(buildVoices(data), normalizeNotes(data));
  const roles = new Map(voices.map((voice) => [String(voice.trackIndex) + ":" + String(voice.channel), voice]));
  const nextStrike = new Map<number, number>();
  const seen = new Map<string, number>();
  for (const [index, note] of [...data.notes.entries()].sort((a, b) =>
    b[1].startTick - a[1].startTick || b[0] - a[0])) {
    const identity = key(note.trackIndex, note.channel, note.pitch);
    nextStrike.set(index, seen.get(identity) ?? Number.POSITIVE_INFINITY);
    seen.set(identity, note.startTick);
  }
  const controls = data.controlChanges.filter((control) => control.number === 64)
    .sort((a, b) => a.tick - b.tick);
  const notes = data.notes.map((note, index): TemporalSourceNote => {
    const offsetTick = note.startTick + note.durationTick;
    if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
      || !Number.isSafeInteger(note.startTick) || note.startTick < 0
      || !Number.isSafeInteger(offsetTick) || offsetTick <= note.startTick) {
      throw new Error("Invalid temporal raw source note");
    }
    const voice = roles.get(String(note.trackIndex) + ":" + String(note.channel));
    const latestPedal = [...controls].reverse().find((control) => control.tick <= offsetTick
      && control.trackIndex === note.trackIndex && control.channel === note.channel);
    const pedalEnd = latestPedal && latestPedal.value >= 0.5
      ? controls.find((control) => control.tick > offsetTick
          && control.trackIndex === note.trackIndex && control.channel === note.channel
          && control.value < 0.5)?.tick ?? sourceEnd
      : offsetTick;
    const next = nextStrike.get(index) ?? Number.POSITIVE_INFINITY;
    const sustainedEndTick = Math.max(offsetTick, Math.min(pedalEnd, next));
    return {
      pitch: note.pitch, onsetTick: note.startTick, offsetTick, sustainedEndTick,
      ...(note.channel === undefined ? {} : { channel: note.channel }),
      role: { melody: voice?.inferredRole === "melody" ? voice.roleConfidence ?? 0.5 : 0 },
      reStruck: next === offsetTick,
    };
  });
  return { ppq: data.ticksPerBeat, ...(data.timeSignature ? { timeSignature: data.timeSignature } : {}), notes };
}
