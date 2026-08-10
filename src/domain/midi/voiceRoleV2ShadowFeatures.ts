import { gmProgramRole, isGmPercussionProgram } from "./gmRoles";
import type { NormalizedTimedNote, Voice, VoiceRole } from "./types";
import { voiceId } from "./voices";

/**
 * A sixteenth note in beat units. This is deliberately expressed in musical
 * time so the proxy is independent of the source MIDI file's PPQ.
 */
export const roleV2ShadowLegatoGapBeats = 0.25;

interface RoleV2LegatoProxyNote {
  pitch: number;
  startBeat: number;
  endBeat: number;
  /** Number of original notes represented by this feature-only proxy note. */
  sourceNoteCount: number;
}

type RoleV2LegatoProxyInputNote = Pick<
  NormalizedTimedNote,
  "pitch" | "startBeat" | "endBeat"
> & Partial<Pick<RoleV2LegatoProxyNote, "sourceNoteCount">>;

export interface RoleV2ProgramEvidence {
  kind: "explicit-dominant-program";
  program: number;
  role: VoiceRole;
  confidence: number;
}

export type RoleV2TrackNameHint =
  | "percussion"
  | "bass"
  | "pad"
  | "melody"
  | "harmony";

export interface RoleV2TrackNameEvidence {
  kind: "track-name-hint";
  role: VoiceRole;
  hint: RoleV2TrackNameHint;
}

export interface RoleV2PercussionEvidence {
  /** MIDI Channel 10 (zero-based index 9) is the only hard signal. */
  channel10: boolean;
  /** GM 112–119 remains a soft signal because it can occur off Channel 10. */
  gmPercussionProgram: boolean;
  /** A name hint is diagnostic only; the raw name is intentionally not retained. */
  trackNameHint: boolean;
  /**
   * Feature values for a future soft percussion signature. Stage 01 does not
   * classify from this signature or apply thresholds to it.
   */
  softSignature: {
    robustDurationBeats: number;
    noteDensityPerActiveBeat: number;
    pitchRange: number;
  };
}

export interface RoleV2ShadowFeatures {
  /** Stable identity of the existing production Voice; no role is altered. */
  voiceId: string;
  sourceNoteCount: number;
  proxyNoteCount: number;
  legatoGapBeats: number;

  activeDurationBeats: number;
  monophonicActiveDurationBeats: number;
  /** active time with exactly one pitched note / active time with one or more */
  timeWeightedMonophony: number;
  /** Mean simultaneous proxy-note count while the Voice is active. */
  timeWeightedPolyphony: number;
  /** Median proxy-note duration, which resists fragmented duration outliers. */
  robustDurationBeats: number;
  /** Median pitch of proxy notes. null means the Voice has no usable notes. */
  pitchCenter: number | null;
  /** Low-to-high rank across non-Channel-10 Voices; a sole Voice is 0.5. */
  pitchCenterRank: number | null;
  pitchRange: number;
  /** Adjacent proxy-note intervals in the inclusive 1–2 semitone range. */
  stepwiseMotionRatio: number;
  noteDensityPerActiveBeat: number;
  programEvidence?: RoleV2ProgramEvidence;
  trackNameEvidence: readonly RoleV2TrackNameEvidence[];
  percussionEvidence: RoleV2PercussionEvidence;
}

type InternalFeatures = Omit<RoleV2ShadowFeatures, "pitchCenterRank">;

/**
 * Builds a shadow-only feature vector for each supplied Voice. This module has
 * no dependency on the production Role v1 classifier and does not mutate the
 * Voice or normalized-note inputs.
 */
export function extractRoleV2ShadowFeatures(
  voices: readonly Voice[],
  notes: readonly NormalizedTimedNote[],
): ReadonlyMap<string, RoleV2ShadowFeatures> {
  const byVoiceId = new Map<string, NormalizedTimedNote[]>();
  for (const note of notes) {
    if (note.channel === undefined || !Number.isFinite(note.pitch)
      || !Number.isFinite(note.startBeat) || !Number.isFinite(note.endBeat)
      || note.endBeat <= note.startBeat) continue;
    const id = voiceId(note.trackIndex, note.channel);
    const voiceNotes = byVoiceId.get(id);
    if (voiceNotes) {
      voiceNotes.push(note);
    } else {
      byVoiceId.set(id, [note]);
    }
  }

  const baseFeatures = voices.map((voice) => extractVoiceFeatures(
    voice,
    byVoiceId.get(voice.id) ?? [],
 ));
  const pitchCenterRanks = rankPitchCenters(baseFeatures, voices);

  return new Map(baseFeatures.map((features) => [features.voiceId, {
    ...features,
    pitchCenterRank: pitchCenterRanks.get(features.voiceId) ?? null,
  }]));
}

/**
 * Validates the fixed feature-proxy timing invariant without exposing proxy
 * events to feature diagnostics.
 */
export function assertRoleV2ShadowLegatoGapBeats(maximumGapBeats: number): void {
  if (!Number.isFinite(maximumGapBeats) || maximumGapBeats < 0) {
    throw new RangeError("maximumGapBeats must be a finite non-negative number");
  }
}
/**
 * Merges same-pitch fragments only for feature measurement. The returned
 * objects are new values and no caller-owned note is modified.
 */
function buildRoleV2LegatoProxy(
  notes: readonly RoleV2LegatoProxyInputNote[],
  maximumGapBeats = roleV2ShadowLegatoGapBeats,
): readonly RoleV2LegatoProxyNote[] {
  assertRoleV2ShadowLegatoGapBeats(maximumGapBeats);

  const byPitch = new Map<number, RoleV2LegatoProxyInputNote[]>();
  for (const note of notes) {
    if (!Number.isFinite(note.pitch) || !Number.isFinite(note.startBeat) || !Number.isFinite(note.endBeat)
      || note.endBeat <= note.startBeat) continue;
    const fragments = byPitch.get(note.pitch);
    if (fragments) {
      fragments.push(note);
    } else {
      byPitch.set(note.pitch, [note]);
    }
  }

  const proxy: RoleV2LegatoProxyNote[] = [];
  for (const [pitch, fragments] of [...byPitch.entries()].sort(([left], [right]) => left - right)) {
    const sorted = [...fragments].sort((left, right) =>
      left.startBeat - right.startBeat || left.endBeat - right.endBeat);
    let current: RoleV2LegatoProxyNote | undefined;
    for (const fragment of sorted) {
      if (current && fragment.startBeat - current.endBeat <= maximumGapBeats) {
        current = {
          ...current,
          endBeat: Math.max(current.endBeat, fragment.endBeat),
          sourceNoteCount: current.sourceNoteCount + sourceNoteContribution(fragment),
        };
      } else {
        if (current) proxy.push(current);
        current = {
          pitch,
          startBeat: fragment.startBeat,
          endBeat: fragment.endBeat,
          sourceNoteCount: sourceNoteContribution(fragment),
        };
      }
    }
    if (current) proxy.push(current);
  }

  return proxy.sort((left, right) =>
    left.startBeat - right.startBeat || left.pitch - right.pitch || left.endBeat - right.endBeat);
}

function sourceNoteContribution(note: RoleV2LegatoProxyInputNote): number {
  const value = note.sourceNoteCount;
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function extractVoiceFeatures(
  voice: Voice,
  sourceNotes: readonly NormalizedTimedNote[],
): InternalFeatures {
  const legatoProxy = buildRoleV2LegatoProxy(sourceNotes);
  const timing = measureActiveTime(legatoProxy);
  const durations = legatoProxy.map((note) => note.endBeat - note.startBeat);
  const pitchCenter = median(legatoProxy.map((note) => note.pitch));
  const pitchRange = legatoProxy.length
    ? Math.max(...legatoProxy.map((note) => note.pitch)) - Math.min(...legatoProxy.map((note) => note.pitch))
    : 0;
  const robustDurationBeats = median(durations) ?? 0;
  const noteDensityPerActiveBeat = divide(legatoProxy.length, timing.activeDurationBeats);
  const trackNameEvidence = extractTrackNameEvidence(voice.trackName);
  const programEvidence = extractProgramEvidence(voice);

  return {
    voiceId: voice.id,
    sourceNoteCount: sourceNotes.length,
    proxyNoteCount: legatoProxy.length,
    legatoGapBeats: roleV2ShadowLegatoGapBeats,

    activeDurationBeats: timing.activeDurationBeats,
    monophonicActiveDurationBeats: timing.monophonicActiveDurationBeats,
    timeWeightedMonophony: divide(timing.monophonicActiveDurationBeats, timing.activeDurationBeats),
    timeWeightedPolyphony: divide(timing.weightedPolyphonyDuration, timing.activeDurationBeats),
    robustDurationBeats,
    pitchCenter,
    pitchRange,
    stepwiseMotionRatio: stepwiseMotionRatio(legatoProxy),
    noteDensityPerActiveBeat,
    ...(programEvidence ? { programEvidence } : {}),
    trackNameEvidence,
    percussionEvidence: {
      channel10: voice.channel === 9,
      gmPercussionProgram: isGmPercussionProgram(dominantExplicitProgram(voice)),
      trackNameHint: trackNameEvidence.some((evidence) => evidence.role === "percussion"),
      softSignature: {
        robustDurationBeats,
        noteDensityPerActiveBeat,
        pitchRange,
      },
    },
  };
}

function measureActiveTime(
  notes: readonly RoleV2LegatoProxyNote[],
): {
  activeDurationBeats: number;
  monophonicActiveDurationBeats: number;
  weightedPolyphonyDuration: number;
} {
  const events = notes.flatMap((note) => [
    { beat: note.startBeat, delta: 1 },
    { beat: note.endBeat, delta: -1 },
  ]).sort((left, right) => left.beat - right.beat || left.delta - right.delta);
  let active = 0;
  let previousBeat: number | undefined;
  let activeDurationBeats = 0;
  let monophonicActiveDurationBeats = 0;
  let weightedPolyphonyDuration = 0;

  for (const event of events) {
    if (previousBeat !== undefined && event.beat > previousBeat && active > 0) {
      const duration = event.beat - previousBeat;
      activeDurationBeats += duration;
      weightedPolyphonyDuration += active * duration;
      if (active === 1) monophonicActiveDurationBeats += duration;
    }
    active += event.delta;
    previousBeat = event.beat;
  }

  return { activeDurationBeats, monophonicActiveDurationBeats, weightedPolyphonyDuration };
}

function rankPitchCenters(
  features: readonly InternalFeatures[],
  voices: readonly Voice[],
): ReadonlyMap<string, number> {
  const channelById = new Map(voices.map((voice) => [voice.id, voice.channel]));
  const ranked = features
    .filter((feature) => feature.pitchCenter !== null && channelById.get(feature.voiceId) !== 9)
    .sort((left, right) => (left.pitchCenter as number) - (right.pitchCenter as number)
      || compareStableText(left.voiceId, right.voiceId));
  const ranks = new Map<string, number>();
  if (!ranked.length) return ranks;
  if (ranked.length === 1) {
    ranks.set(ranked[0].voiceId, 0.5);
    return ranks;
  }

  let groupStart = 0;
  while (groupStart < ranked.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < ranked.length && ranked[groupEnd].pitchCenter === ranked[groupStart].pitchCenter) {
      groupEnd += 1;
    }
    const averageOrdinal = (groupStart + groupEnd - 1) / 2;
    const rank = averageOrdinal / (ranked.length - 1);
    for (let index = groupStart; index < groupEnd; index += 1) {
      ranks.set(ranked[index].voiceId, rank);
    }
    groupStart = groupEnd;
  }
  return ranks;
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stepwiseMotionRatio(notes: readonly RoleV2LegatoProxyNote[]): number {
  if (notes.length < 2) return 0;
  let stepwise = 0;
  for (let index = 1; index < notes.length; index += 1) {
    const distance = Math.abs(notes[index].pitch - notes[index - 1].pitch);
    if (distance > 0 && distance <= 2) stepwise += 1;
  }
  return stepwise / (notes.length - 1);
}

function extractProgramEvidence(voice: Voice): RoleV2ProgramEvidence | undefined {
  const program = dominantExplicitProgram(voice);
  const gmEvidence = gmProgramRole(program, program !== undefined);
  return gmEvidence && program !== undefined
    ? {
      kind: "explicit-dominant-program",
      program,
      role: gmEvidence.role,
      confidence: gmEvidence.confidence,
    }
    : undefined;
}

function dominantExplicitProgram(voice: Voice): number | undefined {
  return [...voice.explicitPrograms]
    .sort((left, right) => right.durationTicks - left.durationTicks
      || right.noteCount - left.noteCount || left.program - right.program)[0]?.program;
}

function extractTrackNameEvidence(name: string | undefined): readonly RoleV2TrackNameEvidence[] {
  if (!name) return [];
  const hints: readonly { role: VoiceRole; hint: RoleV2TrackNameHint; expression: RegExp }[] = [
    { role: "percussion", hint: "percussion", expression: /drum|perc|kick|snare|hat|kit|beat/i },
    { role: "bass", hint: "bass", expression: /bass|sub|808/i },
    { role: "pad", hint: "pad", expression: /pad|choir|ensemble|strings?/i },
    { role: "melody", hint: "melody", expression: /voice|vocal|lead|solo|melody|topline|sax/i },
    { role: "harmony", hint: "harmony", expression: /chord|keys|piano|rhodes|organ|guitar/i },
  ];
  return hints
    .filter((hint) => hint.expression.test(name))
    .map(({ role, hint }) => ({ kind: "track-name-hint" as const, role, hint }));
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function divide(value: number, divisor: number): number {
  return divisor > 0 ? value / divisor : 0;
}
