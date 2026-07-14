import type {
  MidiSongData, NormalizedTimedNote, NoteSegmentOverlap, SegmentRange, TimedNote,
} from "./types";

export function normalizeNotes(data: MidiSongData): NormalizedTimedNote[] {
  const byTrackPitch = new Map<string, TimedNote[]>();
  for (const note of data.notes) {
    const key = `${note.trackIndex}:${note.pitch}`;
    byTrackPitch.set(key, [...(byTrackPitch.get(key) ?? []), note]);
  }
  const deduplicated = [...byTrackPitch.values()].flatMap((notes) => deduplicate(notes));
  const lastBeat = data.totalBars * beatsPerBar(data.timeSignature);
  return deduplicated.map((note) => {
    const track = data.tracks.find((entry) => entry.index === note.trackIndex);
    const startBeat = note.startTick / data.ticksPerBeat;
    const endBeat = (note.startTick + note.durationTick) / data.ticksPerBeat;
    const nextOnset = (byTrackPitch.get(`${note.trackIndex}:${note.pitch}`) ?? [])
      .filter((entry) => entry.startTick > note.startTick)
      .sort((a, b) => a.startTick - b.startTick)[0]?.startTick;
    const releaseTick = sustainReleaseTick(data, note.trackIndex, note.startTick + note.durationTick);
    const sustainedTick = Math.min(
      releaseTick ?? note.startTick + note.durationTick,
      nextOnset ?? Number.POSITIVE_INFINITY,
      lastBeat * data.ticksPerBeat,
    );
    return {
      ...note,
      sourceTrackIndex: note.trackIndex,
      ...(track?.program !== undefined ? { program: track.program } : {}),
      ...(track?.name ? { trackName: track.name } : {}),
      isDrum: note.channel === 9 || track?.roleHint === "percussion",
      startBeat,
      endBeat,
      sustainedEndBeat: Math.max(endBeat, sustainedTick / data.ticksPerBeat),
    };
  }).sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch || a.trackIndex - b.trackIndex);
}

export function overlapWithSegment(note: NormalizedTimedNote, segment: SegmentRange): NoteSegmentOverlap {
  const overlapBeats = Math.max(
    0,
    Math.min(note.sustainedEndBeat, segment.endBeat) - Math.max(note.startBeat, segment.startBeat),
  );
  return {
    note,
    overlapBeats,
    overlapRatio: segment.endBeat <= segment.startBeat ? 0 : overlapBeats / (segment.endBeat - segment.startBeat),
  };
}

function sustainReleaseTick(data: MidiSongData, trackIndex: number, noteEndTick: number): number | undefined {
  const events = data.controlChanges
    .filter((event) => event.trackIndex === trackIndex && event.number === 64)
    .sort((a, b) => a.tick - b.tick);
  const priorEvents = events.filter((event) => event.tick <= noteEndTick);
  const active = priorEvents[priorEvents.length - 1];
  if (!active || active.value < 0.5) return undefined;
  return events.find((event) => event.tick > noteEndTick && event.value < 0.5)?.tick;
}

function deduplicate(notes: TimedNote[]): TimedNote[] {
  return [...notes].sort((a, b) => a.startTick - b.startTick || b.durationTick - a.durationTick)
    .filter((note, index, sorted) => index === 0 || Math.abs(note.startTick - sorted[index - 1].startTick) > 1);
}

function beatsPerBar(timeSignature?: string): number {
  const numerator = Number(timeSignature?.split("/")[0]);
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
}
