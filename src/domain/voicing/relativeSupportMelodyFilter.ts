import type { TimedNote, Voice } from "../midi/types";
import type {
  MelodyContaminationFilterResult,
  MelodyContaminationRemoval,
} from "./melodyContaminationFilter";
import type { VoicingExtractionInput } from "./types";

export interface RelativeSupportFilterOptions {
  minimumRoleConfidence: number;
  minimumSupportPitchCount: number;
  minimumCoverageRatio: number;
  minimumSupportBeats?: number;
}

export interface RelativeSupportEvidence {
  supportPitches: number[];
  eventAvailableSupportPitches: number[];
  supportCoverageRatio: number;
  supportDurationBeats: number;
}

export interface RelativeSupportFilterResult extends MelodyContaminationFilterResult {
  evidenceByNote: Map<TimedNote, RelativeSupportEvidence>;
  rejectionByNote: Map<TimedNote, string[]>;
}

export function filterRelativeSupportMelodyContamination(
  input: VoicingExtractionInput,
  options: RelativeSupportFilterOptions,
): RelativeSupportFilterResult {
  const voiceById = new Map(
    (input.voices ?? []).map((voice) => [voice.id, voice]),
  );
  const timed = input.notes.map((note) => {
    const voice = note.channel === undefined
      ? undefined
      : voiceById.get(`${note.trackIndex}:${note.channel}`);
    return {
      note,
      voice,
      startBeat: note.startTick / input.ticksPerBeat,
      endBeat: (note.startTick + note.durationTick) / input.ticksPerBeat,
    };
  });
  const support = timed.filter((entry) =>
    entry.voice !== undefined
    && isHarmonySupportVoice(entry.voice)
    && entry.endBeat > input.segment.startBeat
    && entry.startBeat < input.segment.endBeat);
  const availablePitches = sortedUnique(support.map((entry) => entry.note.pitch));
  const removals = new Map<TimedNote, MelodyContaminationRemoval>();
  const evidenceByNote = new Map<TimedNote, RelativeSupportEvidence>();
  const rejectionByNote = new Map<TimedNote, string[]>();

  for (const candidate of timed) {
    const eligibilityRejections = melodyEligibilityRejections(
      candidate,
      input.segment,
      options.minimumRoleConfidence,
    );
    if (eligibilityRejections.length > 0) {
      if (candidate.voice?.inferredRole === "melody") {
        rejectionByNote.set(candidate.note, eligibilityRejections);
      }
      continue;
    }
    const startBeat = Math.max(candidate.startBeat, input.segment.startBeat);
    const endBeat = Math.min(candidate.endBeat, input.segment.endBeat);
    const strongest = strongestConcurrentSupport(
      support.filter((entry) =>
        entry.note !== candidate.note
        && entry.endBeat > startBeat
        && entry.startBeat < endBeat),
      startBeat,
      endBeat,
      options.minimumSupportBeats ?? 0,
    );
    const ratio = availablePitches.length === 0
      ? 0
      : strongest.pitches.length / availablePitches.length;
    const evidence = {
      supportPitches: strongest.pitches,
      eventAvailableSupportPitches: availablePitches,
      supportCoverageRatio: ratio,
      supportDurationBeats: strongest.duration,
    };
    evidenceByNote.set(candidate.note, evidence);
    if (
      strongest.pitches.length < options.minimumSupportPitchCount
      || ratio + Number.EPSILON < options.minimumCoverageRatio
    ) {
      rejectionByNote.set(candidate.note, [
        strongest.pitches.length < options.minimumSupportPitchCount
          ? "support-count"
          : "support-ratio",
      ]);
      continue;
    }
    removals.set(candidate.note, {
      note: candidate.note,
      voiceId: candidate.voice!.id,
      reasons: [
        "hypothesis-a:relative-support",
        `support-count:${strongest.pitches.length}`,
        `available-texture:${availablePitches.length}`,
        `coverage-ratio:${rounded(ratio)}`,
        `support-beats:${rounded(strongest.duration)}`,
        options.minimumSupportBeats === undefined
          ? "duration-gate:disabled"
          : `duration-gate:${rounded(options.minimumSupportBeats)}`,
      ],
      concurrentSupportPitches: strongest.pitches,
    });
  }
  return {
    notes: input.notes.filter((note) => !removals.has(note)),
    removed: [...removals.values()].sort(compareRemovals),
    evidenceByNote,
    rejectionByNote,
  };
}

function melodyEligibilityRejections(
  candidate: {
    voice?: Voice;
    startBeat: number;
    endBeat: number;
  },
  segment: { startBeat: number; endBeat: number },
  minimumRoleConfidence: number,
): string[] {
  const voice = candidate.voice;
  const reasons: string[] = [];
  if (!voice) reasons.push("voice-missing");
  if (voice && voice.inferredRole !== "melody") reasons.push(`role-is-${voice.inferredRole}`);
  if (voice && voice.roleConfidence < minimumRoleConfidence) {
    reasons.push("role-confidence");
  }
  if (voice && voice.maxPolyphony > 1) reasons.push("polyphonic");
  if (voice && voice.highestVoiceShare < 0.5) reasons.push("highest-share");
  if (voice && voice.highestVoiceShare <= voice.lowestVoiceShare) {
    reasons.push("voice-position");
  }
  if (
    candidate.endBeat <= segment.startBeat
    || candidate.startBeat >= segment.endBeat
  ) {
    reasons.push("outside-segment");
  }
  return reasons;
}

function strongestConcurrentSupport(
  notes: readonly {
    note: TimedNote;
    startBeat: number;
    endBeat: number;
  }[],
  startBeat: number,
  endBeat: number,
  minimumDuration: number,
): { pitches: number[]; duration: number } {
  const boundaries = [
    startBeat,
    endBeat,
    ...notes.flatMap((entry) => [
      Math.max(startBeat, entry.startBeat),
      Math.min(endBeat, entry.endBeat),
    ]),
  ].filter((beat) => beat >= startBeat && beat <= endBeat)
    .sort((left, right) => left - right);
  let best = { pitches: [] as number[], duration: 0 };
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index]!;
    const right = boundaries[index + 1]!;
    if (right - left + Number.EPSILON < minimumDuration) continue;
    const pitches = sortedUnique(notes.filter(
      (entry) => entry.startBeat <= left && entry.endBeat >= right,
    ).map((entry) => entry.note.pitch));
    if (
      pitches.length > best.pitches.length
      || (pitches.length === best.pitches.length && right - left > best.duration)
    ) {
      best = { pitches, duration: right - left };
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

function compareRemovals(
  left: MelodyContaminationRemoval,
  right: MelodyContaminationRemoval,
): number {
  return left.note.startTick - right.note.startTick
    || left.note.pitch - right.note.pitch
    || left.voiceId.localeCompare(right.voiceId);
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function rounded(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
