import type { TimedNote, Voice } from "../midi/types";
import type {
  MelodyContaminationFilterResult,
  MelodyContaminationRemoval,
} from "./melodyContaminationFilter";
import type { VoicingExtractionInput } from "./types";

export interface CountDurationFilterOptions {
  minimumRoleConfidence: number;
  minimumSupportPitchCount: number;
  minimumSupportMass: number;
}

export interface CountDurationEvidence {
  supportPitches: number[];
  supportPitchCount: number;
  supportMass: number;
  supportDurationByPitch: Record<string, number>;
}

export interface CountDurationFilterResult extends MelodyContaminationFilterResult {
  evidenceByNote: Map<TimedNote, CountDurationEvidence>;
  rejectionByNote: Map<TimedNote, string[]>;
}

export function filterCountDurationMelodyContamination(
  input: VoicingExtractionInput,
  options: CountDurationFilterOptions,
): CountDurationFilterResult {
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
  const removals = new Map<TimedNote, MelodyContaminationRemoval>();
  const evidenceByNote = new Map<TimedNote, CountDurationEvidence>();
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
    const durationByPitch = strongestDurationByPitch(
      support.filter((entry) => entry.note !== candidate.note),
      startBeat,
      endBeat,
    );
    const supportPitches = [...durationByPitch.keys()].sort(
      (left, right) => left - right,
    );
    const supportMass = [...durationByPitch.values()].reduce(
      (sum, duration) => sum + duration,
      0,
    );
    const evidence = {
      supportPitches,
      supportPitchCount: supportPitches.length,
      supportMass,
      supportDurationByPitch: Object.fromEntries(
        supportPitches.map((pitch) => [String(pitch), durationByPitch.get(pitch)!]),
      ),
    };
    evidenceByNote.set(candidate.note, evidence);
    if (
      supportPitches.length < options.minimumSupportPitchCount
      || supportMass + Number.EPSILON < options.minimumSupportMass
    ) {
      rejectionByNote.set(candidate.note, [
        supportPitches.length < options.minimumSupportPitchCount
          ? "support-count"
          : "support-mass",
      ]);
      continue;
    }
    removals.set(candidate.note, {
      note: candidate.note,
      voiceId: candidate.voice!.id,
      reasons: [
        "hypothesis-b:count-duration",
        `support-count:${supportPitches.length}`,
        `support-mass:${rounded(supportMass)}`,
      ],
      concurrentSupportPitches: supportPitches,
    });
  }

  return {
    notes: input.notes.filter((note) => !removals.has(note)),
    removed: [...removals.values()].sort(compareRemovals),
    evidenceByNote,
    rejectionByNote,
  };
}

function strongestDurationByPitch(
  notes: readonly {
    note: TimedNote;
    startBeat: number;
    endBeat: number;
  }[],
  startBeat: number,
  endBeat: number,
): Map<number, number> {
  const durationByPitch = new Map<number, number>();
  for (const entry of notes) {
    const overlap = Math.max(
      0,
      Math.min(endBeat, entry.endBeat) - Math.max(startBeat, entry.startBeat),
    );
    if (overlap <= 0) continue;
    durationByPitch.set(
      entry.note.pitch,
      Math.max(durationByPitch.get(entry.note.pitch) ?? 0, overlap),
    );
  }
  return durationByPitch;
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
  if (voice && voice.inferredRole !== "melody") {
    reasons.push(`role-is-${voice.inferredRole}`);
  }
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

function rounded(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
