import { gmProgramRole } from "./gmRoles";
import type {
  NormalizedTimedNote,
  Voice,
  VoiceFeatureInput,
  VoiceRole,
  VoiceRoleEvidence,
  VoiceRoleInference,
} from "./types";
import { voiceId } from "./voices";

const roles: readonly VoiceRole[] = ["bass", "harmony", "pad", "melody", "percussion", "mixed"];

export const defaultVoiceRoleInferenceThresholds = Object.freeze({
  minimumScore: 0.42,
  minimumMargin: 0.08,
});

export function extractVoiceFeatures(
  voice: Voice,
  notes: readonly NormalizedTimedNote[],
): VoiceFeatureInput {
  const voiceNotes = notes
    .filter((note) => note.channel !== undefined && voiceId(note.trackIndex, note.channel) === voice.id)
    .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch || a.endBeat - b.endBeat);
  const soundingDurations = voiceNotes.map((note) => Math.max(0, note.endBeat - note.startBeat));
  const sustainedDurations = voiceNotes.map((note) => Math.max(0, note.sustainedEndBeat - note.startBeat));

  return {
    voice,
    avgDurationBeats: average(sustainedDurations),
    stepwiseMotionRatio: adjacentRatio(voiceNotes, (previous, current) => {
      const distance = Math.abs(current.pitch - previous.pitch);
      return distance > 0 && distance <= 2;
    }),
    repeatedPitchClassRatio: adjacentRatio(
      voiceNotes,
      (previous, current) => normalizePitchClass(previous.pitch) === normalizePitchClass(current.pitch),
    ),
    sustainRatio: clamp01(
      divide(
        sum(sustainedDurations) - sum(soundingDurations),
        Math.max(sum(soundingDurations), Number.EPSILON),
      ),
    ),
  };
}

export function buildVoiceFeatureInputs(
  voices: readonly Voice[],
  notes: readonly NormalizedTimedNote[],
): ReadonlyMap<string, VoiceFeatureInput> {
  return new Map(voices.map((voice) => [voice.id, extractVoiceFeatures(voice, notes)]));
}

export function inferVoiceRole(input: VoiceFeatureInput): VoiceRoleInference {
  const evidence = voiceRoleEvidence(input);
  if (evidence.channelRule?.role === "percussion") {
    return hardPercussionInference("channel:9");
  }

  const scores = zeroScores();
  scores.mixed = 0.12;
  for (const role of roles) {
    scores[role] += evidence.measured[role] * 0.55;
  }
  if (evidence.program) {
    scores[evidence.program.role] += evidence.program.confidence * 0.8;
  }
  if (evidence.trackName) {
    scores[evidence.trackName.role] += evidence.trackName.confidence * 0.65;
  }

  const ranked = roles
    .map((role) => ({ role, score: scores[role] }))
    .sort((a, b) => b.score - a.score || roles.indexOf(a.role) - roles.indexOf(b.role));
  const top = ranked[0];
  const runnerUp = ranked[1];
  const margin = top.score - runnerUp.score;
  const lowConfidence = top.role !== "mixed"
    && (top.score < defaultVoiceRoleInferenceThresholds.minimumScore
      || margin < defaultVoiceRoleInferenceThresholds.minimumMargin);
  const role = lowConfidence ? "mixed" : top.role;
  const confidence = lowConfidence
    ? clamp01(0.15 + scores.mixed * 0.25 + Math.max(0, margin) * 0.25)
    : clamp01(0.45 * Math.min(1, top.score) + 0.55 * clamp01(margin));

  return {
    role,
    confidence,
    scores,
    reasons: [
      ...(lowConfidence ? ["fallback:mixed-low-confidence"] : []),
      ...reasonsFor(evidence, role),
    ],
  };
}

export function resolveVoiceRole(
  input: VoiceFeatureInput,
  override?: VoiceRole,
): VoiceRoleInference {
  const inferred = inferVoiceRole(input);
  if (!override || input.voice.channel === 9) {
    return inferred;
  }
  return {
    ...inferred,
    role: override,
    confidence: 1,
    scores: { ...inferred.scores, [override]: Math.max(1, inferred.scores[override]) },
    reasons: [`override:${override}`, ...inferred.reasons],
  };
}

export function voiceRoleEvidence(input: VoiceFeatureInput): VoiceRoleEvidence {
  const { voice } = input;
  const explicitProgram = [...voice.explicitPrograms].sort(
    (a, b) => b.durationTicks - a.durationTicks || b.noteCount - a.noteCount || a.program - b.program,
  )[0]?.program;
  const program = gmProgramRole(explicitProgram, explicitProgram !== undefined);
  const trackName = trackNameEvidence(voice.trackName);
  const measured = measuredEvidence(input);

  return {
    ...(voice.channel === 9 ? { channelRule: { role: "percussion" as const, confidence: 1 } } : {}),
    ...(program ? { program } : {}),
    ...(trackName ? { trackName } : {}),
    measured,
  };
}

export function annotateVoiceRoles(
  voices: readonly Voice[],
  features: ReadonlyMap<string, VoiceFeatureInput>,
  overrides: Readonly<Record<string, VoiceRole>> = {},
): Voice[] {
  return voices.map((voice) => {
    const input = features.get(voice.id);
    if (!input) return voice;
    const inference = resolveVoiceRole(input, overrides[voice.id]);
    return {
      ...voice,
      inferredRole: inference.role,
      roleConfidence: inference.confidence,
      roleEvidence: voiceRoleEvidence(input),
    };
  });
}

function measuredEvidence(input: VoiceFeatureInput): Record<VoiceRole, number> {
  const { voice } = input;
  const pitchRange = voice.pitchRange[1] - voice.pitchRange[0];
  const monophonic = clamp01(1 - (voice.maxPolyphony - 1) / 4);
  const lowRegister = clamp01((60 - voice.medianPitch) / 24);
  const highRegister = clamp01((voice.medianPitch - 55) / 24);
  const polyphonic = clamp01((voice.maxPolyphony - 1) / 4);
  const simultaneous = clamp01(voice.simultaneousOnsetRatio);
  const sustained = clamp01(input.avgDurationBeats / 4);
  const active = clamp01(voice.noteDensity / 4);
  const wideRange = clamp01(pitchRange / 24);

  return {
    bass: average([lowRegister, voice.lowestVoiceShare, monophonic, sustained * 0.5]),
    harmony: average([
      polyphonic,
      simultaneous,
      clamp01(1 - Math.abs(voice.medianPitch - 60) / 36),
      sustained * 0.5,
    ]),
    pad: average([sustained, input.sustainRatio, polyphonic, simultaneous]),
    melody: average([
      highRegister,
      voice.highestVoiceShare,
      monophonic,
      input.stepwiseMotionRatio,
      active * 0.5,
    ]),
    percussion: 0,
    mixed: average([wideRange, active, input.repeatedPitchClassRatio, 0.2]),
  };
}

function trackNameEvidence(name: string | undefined): VoiceRoleEvidence["trackName"] {
  if (!name) return undefined;
  if (/drum|perc|kick|snare|hat/i.test(name)) return { role: "percussion", confidence: 0.92 };
  if (/bass|sub|808/i.test(name)) return { role: "bass", confidence: 0.9 };
  if (/pad|choir|ensemble|strings?/i.test(name)) return { role: "pad", confidence: 0.82 };
  if (/lead|solo|melody|topline|vocal/i.test(name)) return { role: "melody", confidence: 0.86 };
  if (/chord|keys|piano|rhodes|organ|guitar/i.test(name)) return { role: "harmony", confidence: 0.68 };
  return undefined;
}

function reasonsFor(evidence: VoiceRoleEvidence, role: VoiceRole): string[] {
  const reasons = [`measured:${role}`];
  if (evidence.program) reasons.push(`program:${evidence.program.role}`);
  if (evidence.trackName) reasons.push(`track-name:${evidence.trackName.role}`);
  return reasons;
}

function hardPercussionInference(reason: string): VoiceRoleInference {
  return {
    role: "percussion",
    confidence: 1,
    scores: { ...zeroScores(), percussion: 1 },
    reasons: [reason],
  };
}

function zeroScores(): Record<VoiceRole, number> {
  return { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 };
}

function adjacentRatio(
  notes: readonly NormalizedTimedNote[],
  predicate: (previous: NormalizedTimedNote, current: NormalizedTimedNote) => boolean,
): number {
  if (notes.length < 2) return 0;
  let matches = 0;
  for (let index = 1; index < notes.length; index += 1) {
    if (predicate(notes[index - 1], notes[index])) matches += 1;
  }
  return matches / (notes.length - 1);
}

function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

function average(values: readonly number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function divide(value: number, divisor: number): number {
  return divisor === 0 ? 0 : value / divisor;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
