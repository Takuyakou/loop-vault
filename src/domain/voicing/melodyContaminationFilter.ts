import type { TimedNote, Voice } from "../midi/types";

export const defaultMelodyContaminationFilterOptions = Object.freeze({
  minimumRoleConfidence: 0.55,
  minimumConcurrentNonMelodyPitches: 3,
  minimumConcurrentSupportBeats: 0.1,
});

export interface MelodyContaminationFilterOptions {
  minimumRoleConfidence: number;
  minimumConcurrentNonMelodyPitches: number;
  minimumConcurrentSupportBeats: number;
}

export interface MelodyContaminationRemoval {
  note: TimedNote;
  voiceId: string;
  reasons: string[];
  concurrentSupportPitches: number[];
}

export interface MelodyContaminationFilterResult {
  notes: TimedNote[];
  removed: MelodyContaminationRemoval[];
}

export function filterEventLocalMelodyContamination(
  input: {
    notes: readonly TimedNote[];
    voices: readonly Voice[];
    ticksPerBeat: number;
    segment: { startBeat: number; endBeat: number };
  },
  options: MelodyContaminationFilterOptions = defaultMelodyContaminationFilterOptions,
): MelodyContaminationFilterResult {
  const voices = new Map(input.voices.map((voice) => [voice.id, voice]));
  const timed = input.notes.map((note) => ({
    note,
    startBeat: note.startTick / input.ticksPerBeat,
    endBeat: (note.startTick + note.durationTick) / input.ticksPerBeat,
    voice: note.channel === undefined
      ? undefined
      : voices.get(`${note.trackIndex}:${note.channel}`),
  }));
  const removals = new Map<TimedNote, MelodyContaminationRemoval>();

  for (const candidate of timed) {
    const voice = candidate.voice;
    if (
      !voice
      || voice.inferredRole !== "melody"
      || voice.roleConfidence < options.minimumRoleConfidence
      || voice.maxPolyphony > 1
      || voice.highestVoiceShare < 0.5
      || voice.highestVoiceShare <= voice.lowestVoiceShare
      || candidate.endBeat <= input.segment.startBeat
      || candidate.startBeat >= input.segment.endBeat
    ) {
      continue;
    }
    const startBeat = Math.max(candidate.startBeat, input.segment.startBeat);
    const endBeat = Math.min(candidate.endBeat, input.segment.endBeat);
    const support = strongestConcurrentSupport(
      timed.filter((entry) =>
        entry.note !== candidate.note
        && entry.voice !== undefined
        && isHarmonySupportVoice(entry.voice)
        && entry.endBeat > startBeat
        && entry.startBeat < endBeat),
      startBeat,
      endBeat,
      options.minimumConcurrentSupportBeats,
    );
    if (support.length < options.minimumConcurrentNonMelodyPitches) continue;
    removals.set(candidate.note, {
      note: candidate.note,
      voiceId: voice.id,
      reasons: [
        `role:melody@${rounded(voice.roleConfidence)}`,
        "voice:monophonic",
        "voice:highest-share",
        `concurrent-harmony:${support.length}`,
        `support-beats>=${options.minimumConcurrentSupportBeats}`,
      ],
      concurrentSupportPitches: support,
    });
  }

  return {
    notes: input.notes.filter((note) => !removals.has(note)),
    removed: [...removals.values()].sort(
      (left, right) =>
        left.note.startTick - right.note.startTick
        || left.note.pitch - right.note.pitch
        || left.voiceId.localeCompare(right.voiceId),
    ),
  };
}

function strongestConcurrentSupport(
  notes: readonly {
    startBeat: number;
    endBeat: number;
    note: TimedNote;
  }[],
  startBeat: number,
  endBeat: number,
  minimumDuration: number,
): number[] {
  const boundaries = [
    startBeat,
    endBeat,
    ...notes.flatMap((entry) => [
      Math.max(startBeat, entry.startBeat),
      Math.min(endBeat, entry.endBeat),
    ]),
  ].filter((beat) => beat >= startBeat && beat <= endBeat)
    .sort((left, right) => left - right);
  let best: number[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index]!;
    const right = boundaries[index + 1]!;
    if (right - left + Number.EPSILON < minimumDuration) continue;
    const active = [...new Set(notes.filter(
      (entry) => entry.startBeat <= left && entry.endBeat >= right,
    ).map((entry) => entry.note.pitch))].sort((a, b) => a - b);
    if (
      active.length > best.length
      || (active.length === best.length && compareNotes(active, best) < 0)
    ) {
      best = active;
    }
  }
  return best;
}

function isHarmonySupportVoice(voice: Voice): boolean {
  return voice.inferredRole === "harmony"
    || voice.inferredRole === "pad"
    || voice.inferredRole === "mixed"
    || voice.maxPolyphony >= 3;
}

function compareNotes(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function rounded(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
