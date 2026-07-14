import { Midi } from "@tonejs/midi";
import type { MidiControlChange, MidiSongData, MidiTrackInfo, TimedNote, TrackRole } from "./types";

export function parseMidi(bytes: Uint8Array): MidiSongData {
  const midi = new Midi(bytes);
  const ticksPerBeat = midi.header.ppq || 480;
  const timeSignatureParts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const beatsPerBar = timeSignatureParts[0] || 4;
  const tempo = midi.header.tempos[0]?.bpm;
  const tracks: MidiTrackInfo[] = [];
  const notes: TimedNote[] = [];
  const controlChanges: MidiControlChange[] = [];

  midi.tracks.forEach((track, trackIndex) => {
    const firstNote = track.notes[0] as { channel?: number } | undefined;
    const channel = firstNote?.channel;
    const name = track.name ?? "";
    const program = track.instrument?.number;
    const roleHint = roleFromName(name);
    const isPercussion =
      channel === 9 ||
      roleHint === "percussion" ||
      /drum|perc|kick|snare|hat/i.test(name);

    tracks.push({
      index: trackIndex,
      name,
      ...(channel !== undefined ? { channel } : {}),
      ...(program !== undefined ? { program } : {}),
      ...(roleHint ? { roleHint } : {}),
    });

    const sustainEvents = (track.controlChanges?.[64] ?? []) as Array<{ ticks: number; value: number }>;
    for (const event of sustainEvents) {
      controlChanges.push({ trackIndex, number: 64, tick: Math.round(event.ticks), value: event.value });
    }

    if (isPercussion) {
      return;
    }

    for (const note of track.notes) {
      const noteChannel = (note as { channel?: number }).channel;
      notes.push({
        pitch: note.midi,
        startTick: Math.round(note.ticks),
        durationTick: Math.max(1, Math.round(note.durationTicks)),
        velocity: note.velocity,
        trackIndex,
        ...(noteChannel !== undefined ? { channel: noteChannel } : {}),
      });
    }
  });

  const lastTick = notes.reduce(
    (max, note) => Math.max(max, note.startTick + note.durationTick),
    0,
  );
  const totalBeats = lastTick / ticksPerBeat;
  const totalBars = Math.max(1, Math.ceil(totalBeats / beatsPerBar));

  return {
    notes: notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch),
    ...(tempo ? { tempo } : {}),
    timeSignature: `${timeSignatureParts[0]}/${timeSignatureParts[1]}`,
    ticksPerBeat,
    totalBars,
    tracks,
    controlChanges: controlChanges.sort((a, b) => a.tick - b.tick || a.trackIndex - b.trackIndex),
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
