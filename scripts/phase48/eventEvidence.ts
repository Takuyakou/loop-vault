import { normalizeNotes } from "../../src/domain/midi/normalize";
import type {
  MidiSongData,
  VoiceRole,
} from "../../src/domain/midi/types";
import {
  annotateVoiceRoles,
  buildVoiceFeatureInputs,
} from "../../src/domain/midi/voiceRoles";
import { buildVoices, voiceId } from "../../src/domain/midi/voices";

export type Phase48EvidenceRole = VoiceRole | "unknown";

export interface Phase48EvidenceNote {
  noteInstanceId: string;
  pitch: number;
  pitchClass: number;
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  trackIndex: number;
  channel?: number;
  trackName?: string;
  role: Phase48EvidenceRole;
  roleConfidence: number;
}

export interface Phase48EventEvidence {
  notes: Phase48EvidenceNote[];
  rootNotes: Phase48EvidenceNote[];
  majorThirdNotes: Phase48EvidenceNote[];
  perfectFifthNotes: Phase48EvidenceNote[];
  minorSeventhNotes: Phase48EvidenceNote[];
  flatNineNotes: Phase48EvidenceNote[];
  completeCore: boolean;
  p5OmittedCore: boolean;
  flatNineDurationBeats: number;
  flatNineDurationRatio: number;
  flatNineOnsets: number[];
  flatNineFirstOnsetRatio: number | null;
  strictOverlapRatio: number;
  roles: Phase48EvidenceRole[];
  e1Eligible: boolean;
  e2Eligible: boolean;
  e3Eligible: boolean;
  evidenceClass: "strong" | "medium" | "weak" | "incidental";
}

export function buildPhase48EvidenceNotes(
  data: MidiSongData,
  fileId: string,
): Phase48EvidenceNote[] {
  const normalized = normalizeNotes(data);
  const voices = annotateVoiceRoles(
    buildVoices(data),
    buildVoiceFeatureInputs(buildVoices(data), normalized),
  );
  const roles = new Map(
    voices.map((voice) => [voice.id, {
      role: voice.inferredRole,
      confidence: voice.roleConfidence,
    }]),
  );
  const trackNames = new Map(data.tracks.map((track) => [track.index, track.name]));

  return data.notes
    .map((note, index): Phase48EvidenceNote => {
      const role = note.channel === undefined
        ? undefined
        : roles.get(voiceId(note.trackIndex, note.channel));
      return {
        noteInstanceId: [
          fileId,
          `n${index}`,
          `t${note.trackIndex}`,
          `c${note.channel ?? -1}`,
          `p${note.pitch}`,
          `s${note.startTick}`,
          `d${note.durationTick}`,
        ].join(":"),
        pitch: note.pitch,
        pitchClass: normalizePitchClass(note.pitch),
        startBeat: note.startTick / data.ticksPerBeat,
        endBeat: (note.startTick + note.durationTick) / data.ticksPerBeat,
        durationBeats: note.durationTick / data.ticksPerBeat,
        trackIndex: note.trackIndex,
        ...(note.channel !== undefined ? { channel: note.channel } : {}),
        ...(trackNames.get(note.trackIndex)
          ? { trackName: trackNames.get(note.trackIndex) }
          : {}),
        role: note.channel === 9 ? "percussion" : role?.role ?? "unknown",
        roleConfidence: note.channel === 9 ? 1 : role?.confidence ?? 0,
      };
    })
    .filter((note) => note.role !== "percussion")
    .sort((left, right) =>
      left.startBeat - right.startBeat
      || left.pitch - right.pitch
      || left.trackIndex - right.trackIndex
      || (left.channel ?? -1) - (right.channel ?? -1));
}

export function analyzePhase48EventEvidence(
  allNotes: readonly Phase48EvidenceNote[],
  root: number,
  startBeat: number,
  endBeat: number,
): Phase48EventEvidence {
  const notes = allNotes.filter((note) =>
    note.startBeat < endBeat && note.endBeat > startBeat);
  const byPitchClass = (pitchClass: number) =>
    notes.filter((note) => note.pitchClass === normalizePitchClass(pitchClass));
  const rootNotes = byPitchClass(root);
  const majorThirdNotes = byPitchClass(root + 4);
  const perfectFifthNotes = byPitchClass(root + 7);
  const minorSeventhNotes = byPitchClass(root + 10);
  const flatNineNotes = byPitchClass(root + 1);
  const completeCore = [
    rootNotes,
    majorThirdNotes,
    perfectFifthNotes,
    minorSeventhNotes,
  ].every((group) => group.length > 0);
  const p5OmittedCore = !perfectFifthNotes.length
    && [rootNotes, majorThirdNotes, minorSeventhNotes]
      .every((group) => group.length > 0);
  const flatNineDurationBeats = intervalUnionDuration(
    flatNineNotes.map((note) => [
      Math.max(startBeat, note.startBeat),
      Math.min(endBeat, note.endBeat),
    ]),
  );
  const eventDuration = Math.max(Number.EPSILON, endBeat - startBeat);
  const flatNineOnsets = [...new Set(
    flatNineNotes
      .filter((note) => note.startBeat >= startBeat && note.startBeat < endBeat)
      .map((note) => note.startBeat),
  )].sort((left, right) => left - right);
  const flatNineFirstOnsetRatio = flatNineOnsets[0] === undefined
    ? null
    : (flatNineOnsets[0] - startBeat) / eventDuration;
  const strictOverlapRatio = overlapWithCoreRatio(
    flatNineNotes,
    [rootNotes, majorThirdNotes, perfectFifthNotes, minorSeventhNotes],
    startBeat,
    endBeat,
  );
  const roles = [...new Set(flatNineNotes.map((note) => note.role))].sort();
  const onsetInTime = flatNineFirstOnsetRatio !== null
    && flatNineFirstOnsetRatio <= 0.75;
  const e1Eligible = completeCore
    && flatNineNotes.length > 0
    && strictOverlapRatio >= 0.5;
  const eventSupported = flatNineDurationBeats / eventDuration >= 0.25
    || flatNineOnsets.length >= 2;
  const e2Eligible = (completeCore || p5OmittedCore)
    && onsetInTime
    && eventSupported;
  const e3Eligible = e2Eligible
    && flatNineNotes.some((note) =>
      ["harmony", "pad", "mixed", "unknown"].includes(note.role));
  const evidenceClass = completeCore && e1Eligible
    ? "strong"
    : completeCore && e2Eligible
      ? "medium"
      : p5OmittedCore && e2Eligible
        ? "weak"
        : "incidental";

  return {
    notes,
    rootNotes,
    majorThirdNotes,
    perfectFifthNotes,
    minorSeventhNotes,
    flatNineNotes,
    completeCore,
    p5OmittedCore,
    flatNineDurationBeats,
    flatNineDurationRatio: flatNineDurationBeats / eventDuration,
    flatNineOnsets,
    flatNineFirstOnsetRatio,
    strictOverlapRatio,
    roles,
    e1Eligible,
    e2Eligible,
    e3Eligible,
    evidenceClass,
  };
}

function overlapWithCoreRatio(
  flatNineNotes: readonly Phase48EvidenceNote[],
  coreGroups: readonly Phase48EvidenceNote[][],
  startBeat: number,
  endBeat: number,
): number {
  if (!flatNineNotes.length || coreGroups.some((group) => !group.length)) return 0;
  const boundaries = [...new Set([
    startBeat,
    endBeat,
    ...flatNineNotes.flatMap((note) => [note.startBeat, note.endBeat]),
    ...coreGroups.flatMap((group) =>
      group.flatMap((note) => [note.startBeat, note.endBeat])),
  ])]
    .filter((beat) => beat >= startBeat && beat <= endBeat)
    .sort((left, right) => left - right);
  let overlap = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const intervalStart = boundaries[index];
    const intervalEnd = boundaries[index + 1];
    const midpoint = (intervalStart + intervalEnd) / 2;
    const flatNineSounds = flatNineNotes.some((note) =>
      note.startBeat <= midpoint && note.endBeat > midpoint);
    const coreSounds = coreGroups.every((group) =>
      group.some((note) => note.startBeat <= midpoint && note.endBeat > midpoint));
    if (flatNineSounds && coreSounds) overlap += intervalEnd - intervalStart;
  }
  const flatNineDuration = intervalUnionDuration(
    flatNineNotes.map((note) => [
      Math.max(startBeat, note.startBeat),
      Math.min(endBeat, note.endBeat),
    ]),
  );
  return flatNineDuration > 0 ? overlap / flatNineDuration : 0;
}

function intervalUnionDuration(intervals: readonly [number, number][]): number {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let currentStart = sorted[0]?.[0];
  let currentEnd = sorted[0]?.[1];
  if (currentStart === undefined || currentEnd === undefined) return 0;
  for (const [start, end] of sorted.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  return total + currentEnd - currentStart;
}

function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}
