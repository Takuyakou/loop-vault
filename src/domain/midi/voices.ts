import type { MidiSongData, TimedNote, Voice, VoiceRole, VoiceRoleEvidence } from "./types";

const voiceRoles: VoiceRole[] = ["bass", "harmony", "pad", "melody", "percussion", "mixed"];

export function buildVoices(data: MidiSongData): Voice[] {
  const notesByVoice = new Map<string, TimedNote[]>();
  for (const note of data.notes) {
    if (note.channel === undefined) {
      continue;
    }
    const id = voiceId(note.trackIndex, note.channel);
    notesByVoice.set(id, [...(notesByVoice.get(id) ?? []), note]);
  }

  return [...notesByVoice.entries()]
    .map(([id, notes]) => buildVoice(id, notes, data))
    .sort((a, b) => a.trackIndex - b.trackIndex || a.channel - b.channel);
}

export function voiceId(trackIndex: number, channel: number): string {
  return `${trackIndex}:${channel}`;
}

export function isPercussionEvidence(note: TimedNote): boolean {
  return note.channel === 9;
}

export function selectChordEvidenceNotes(notes: readonly TimedNote[]): TimedNote[] {
  return notes.filter((note) => !isPercussionEvidence(note));
}

function buildVoice(id: string, notes: TimedNote[], data: MidiSongData): Voice {
  const sortedNotes = [...notes].sort(
    (a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.durationTick - b.durationTick,
  );
  const trackIndex = sortedNotes[0].trackIndex;
  const channel = sortedNotes[0].channel as number;
  const pitches = sortedNotes.map((note) => note.pitch).sort((a, b) => a - b);
  const durations = sortedNotes.map((note) => note.durationTick);
  const explicitPrograms = aggregateExplicitPrograms(sortedNotes);
  const dominant = dominantProgram(sortedNotes);
  const percussion = channel === 9;
  const trackName = data.tracks.find((track) => track.index === trackIndex)?.name;

  return {
    id,
    trackIndex,
    channel,
    ...(trackName ? { trackName } : {}),
    explicitPrograms,
    ...(dominant ? { dominantProgram: dominant.program } : {}),
    dominantProgramExplicit: dominant?.explicit ?? false,
    noteCount: sortedNotes.length,
    pitchRange: [pitches[0], pitches[pitches.length - 1]],
    medianPitch: median(pitches),
    avgDurationTick: sum(durations) / sortedNotes.length,
    noteDensity: noteDensity(sortedNotes, data.ticksPerBeat),
    maxPolyphony: maxPolyphony(sortedNotes),
    simultaneousOnsetRatio: simultaneousOnsetRatio(sortedNotes),
    lowestVoiceShare: boundaryVoiceShare(sortedNotes, data.notes, "lowest"),
    highestVoiceShare: boundaryVoiceShare(sortedNotes, data.notes, "highest"),
    inferredRole: percussion ? "percussion" : "mixed",
    roleConfidence: percussion ? 1 : 0,
    roleEvidence: neutralRoleEvidence(percussion),
  };
}

function aggregateExplicitPrograms(notes: TimedNote[]): Voice["explicitPrograms"] {
  const programs = new Map<number, { noteCount: number; durationTicks: number }>();
  for (const note of notes) {
    if (!note.programExplicit || note.program === undefined) {
      continue;
    }
    const aggregate = programs.get(note.program) ?? { noteCount: 0, durationTicks: 0 };
    aggregate.noteCount += 1;
    aggregate.durationTicks += note.durationTick;
    programs.set(note.program, aggregate);
  }
  return [...programs.entries()]
    .map(([program, aggregate]) => ({ program, ...aggregate }))
    .sort((a, b) => a.program - b.program);
}

function dominantProgram(notes: TimedNote[]): { program: number; explicit: boolean } | undefined {
  const programs = new Map<number, {
    program: number;
    noteCount: number;
    durationTicks: number;
    explicitNoteCount: number;
  }>();
  for (const note of notes) {
    if (note.program === undefined) {
      continue;
    }
    const aggregate = programs.get(note.program) ?? {
      program: note.program,
      noteCount: 0,
      durationTicks: 0,
      explicitNoteCount: 0,
    };
    aggregate.noteCount += 1;
    aggregate.durationTicks += note.durationTick;
    if (note.programExplicit === true) {
      aggregate.explicitNoteCount += 1;
    }
    programs.set(note.program, aggregate);
  }
  const dominant = [...programs.values()].sort(
    (a, b) => b.durationTicks - a.durationTicks
      || b.noteCount - a.noteCount
      || a.program - b.program,
  )[0];
  return dominant
    ? { program: dominant.program, explicit: dominant.explicitNoteCount > 0 }
    : undefined;
}

function noteDensity(notes: TimedNote[], ticksPerBeat: number): number {
  const start = Math.min(...notes.map((note) => note.startTick));
  const end = Math.max(...notes.map((note) => note.startTick + note.durationTick));
  const beats = Math.max(1 / ticksPerBeat, (end - start) / ticksPerBeat);
  return notes.length / beats;
}

function maxPolyphony(notes: TimedNote[]): number {
  const events = notes.flatMap((note) => [
    { tick: note.startTick, delta: 1 },
    { tick: note.startTick + note.durationTick, delta: -1 },
  ]).sort((a, b) => a.tick - b.tick || a.delta - b.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function simultaneousOnsetRatio(notes: TimedNote[]): number {
  const counts = countBy(notes, (note) => String(note.startTick));
  const simultaneous = notes.filter((note) => (counts.get(String(note.startTick)) ?? 0) > 1).length;
  return simultaneous / notes.length;
}

function boundaryVoiceShare(
  voiceNotes: TimedNote[],
  allNotes: TimedNote[],
  boundary: "lowest" | "highest",
): number {
  const matches = voiceNotes.filter((note) => {
    if (note.channel === 9) {
      return false;
    }
    const pitches = allNotes
      .filter((candidate) => candidate.channel !== 9
        && candidate.startTick <= note.startTick
        && candidate.startTick + candidate.durationTick > note.startTick)
      .map((candidate) => candidate.pitch);
    const target = boundary === "lowest" ? Math.min(...pitches) : Math.max(...pitches);
    return note.pitch === target;
  }).length;
  return matches / voiceNotes.length;
}

function neutralRoleEvidence(percussion: boolean): VoiceRoleEvidence {
  const measured = Object.fromEntries(voiceRoles.map((role) => [role, 0])) as Record<VoiceRole, number>;
  return {
    ...(percussion ? { channelRule: { role: "percussion" as const, confidence: 1 } } : {}),
    measured,
  };
}

function median(values: number[]): number {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function countBy<T>(values: T[], keyFor: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyFor(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
