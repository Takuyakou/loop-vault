import { parseRawSmf } from "./rawSmf";
import { beatsPerBar } from "./timing";
import type { MidiSongData, MidiTrackInfo, TrackRole } from "./types";

export function parseMidi(bytes: Uint8Array): MidiSongData {
  const raw = parseRawSmf(bytes);
  const timeSignatureParts = raw.timeSignature;
  const barLengthBeats = beatsPerBar(timeSignatureParts);
  const tracks: MidiTrackInfo[] = raw.tracks.map((track) => {
    const roleHint = roleFromName(track.name);
    const trackNotes = raw.notes.filter((note) => note.trackIndex === track.index);
    const commonExplicitProgram = trackNotes.length > 0
      && trackNotes.every(
        (note) => note.programExplicit === true && note.program === trackNotes[0].program,
      )
      ? trackNotes[0].program
      : undefined;
    return {
      index: track.index,
      name: track.name,
      ...(track.channels.length === 1 ? { channel: track.channels[0] } : {}),
      ...(commonExplicitProgram !== undefined
        ? { program: commonExplicitProgram }
        : {}),
      ...(roleHint ? { roleHint } : {}),
    };
  });

  const lastTick = raw.notes.reduce(
    (max, note) => Math.max(max, note.startTick + note.durationTick),
    0,
  );
  const totalBeats = lastTick / raw.ticksPerBeat;
  const totalBars = Math.max(1, Math.ceil(totalBeats / barLengthBeats));

  return {
    notes: raw.notes,
    ...(raw.tempo !== undefined ? { tempo: raw.tempo } : {}),
    tempoChanges: raw.tempoChanges,
    timeSignature: `${timeSignatureParts[0]}/${timeSignatureParts[1]}`,
    ticksPerBeat: raw.ticksPerBeat,
    totalBars,
    tracks,
    controlChanges: raw.controlChanges,
  };
}

function roleFromName(name: string): TrackRole | undefined {
  if (/drum|perc|kick|snare|hat/i.test(name)) {
    return "percussion";
  }
  if (/bass|sub|808/i.test(name)) {
    return "bass";
  }
  if (/pad|chord|keys|piano|guitar|string|organ|rhodes/i.test(name)) {
    return "harmony";
  }
  if (/lead|melody|topline|vocal|solo/i.test(name)) {
    return "melody";
  }
  return undefined;
}
