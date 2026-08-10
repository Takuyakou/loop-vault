import type { PreAnalysisSourceScan, PreAnalysisVoice } from "../../src/domain/midi/preAnalysis/types";
import type { VoiceRole } from "../../src/domain/midi/types";

export const expectedRoleOptions = [
  "bass",
  "harmony",
  "pad",
  "melody",
  "percussion",
  "mixed",
  "ambiguous",
] as const;

export type ExpectedRole = (typeof expectedRoleOptions)[number];

export interface GroundTruthVoiceTemplate {
  voiceId: string;
  voiceIndex: number;
  trackIndex: number;
  channelIndex: number;
  midiChannel: number;
  safeVoiceLabel: string;
  dominantProgram: number | null;
  gmProgramName: string | null;
  programNumbers: readonly number[];
  hasProgramChanges: boolean;
  isDrum: boolean;
  noteCount: number;
  pitchRange: { min: number; max: number } | null;
  averageDurationBeats: number | null;
  averagePolyphony: number | null;
  /** Product classifier output only. It is never copied into expectedRole. */
  currentAutomaticRole: VoiceRole;
  expectedRole: ExpectedRole | null;
  humanReviewNote: string;
}

export interface GroundTruthTemplate {
  schemaVersion: 1;
  kind: "p521-role-ground-truth-template";
  fixture: {
    id: string;
    sourceIdentity: "local-midi-not-recorded";
  };
  expectedRoleOptions: readonly ExpectedRole[];
  reviewPolicy: readonly string[];
  voices: readonly GroundTruthVoiceTemplate[];
}

export function createAnonymousFixtureId(randomUuid: () => string): string {
  return `fixture-${randomUuid().replace(/-/g, "").slice(0, 12)}`;
}

export function createGroundTruthTemplate(
  scan: PreAnalysisSourceScan,
  fixtureId: string,
  automaticRoles: ReadonlyMap<string, VoiceRole>,
): GroundTruthTemplate {
  assertFixtureId(fixtureId);
  const voices = [...scan.voices]
    .sort((left, right) => left.trackIndex - right.trackIndex || left.channel - right.channel)
    .map((voice, index) => toVoiceTemplate(
      voice,
      fixtureId,
      index + 1,
      automaticRoles.get(voiceKey(voice)),
    ));

  return {
    schemaVersion: 1,
    kind: "p521-role-ground-truth-template",
    fixture: {
      id: fixtureId,
      sourceIdentity: "local-midi-not-recorded",
    },
    expectedRoleOptions,
    reviewPolicy: [
      "Set expectedRole only after human review; currentAutomaticRole is diagnostic evidence, not ground truth.",
      "Use ambiguous when a single Voice cannot be assigned one role; ambiguous rows are excluded from accuracy and correction-burden metrics.",
      "Do not add source paths, titles, raw MIDI, raw notes, recordings, or private labels to this template or to Git.",
    ],
    voices,
  };
}

function toVoiceTemplate(
  voice: PreAnalysisVoice,
  fixtureId: string,
  voiceIndex: number,
  automaticRole: VoiceRole | undefined,
): GroundTruthVoiceTemplate {
  if (!automaticRole) {
    throw new Error("missing product automatic role for a scanned Voice");
  }
  return {
    voiceId: `${fixtureId}:${voice.trackIndex}:${voice.channel}`,
    voiceIndex,
    trackIndex: voice.trackIndex,
    channelIndex: voice.channel,
    midiChannel: voice.channel + 1,
    safeVoiceLabel: safeVoiceLabel(voice),
    dominantProgram: voice.dominantProgram ?? null,
    gmProgramName: voice.gmProgramName ?? null,
    programNumbers: [...voice.programNumbers],
    hasProgramChanges: voice.hasProgramChanges,
    isDrum: voice.isDrum,
    noteCount: voice.noteCount,
    pitchRange: voice.minPitch === undefined || voice.maxPitch === undefined
      ? null
      : { min: voice.minPitch, max: voice.maxPitch },
    averageDurationBeats: voice.averageDurationBeats ?? null,
    averagePolyphony: voice.averagePolyphony ?? null,
    currentAutomaticRole: automaticRole,
    expectedRole: null,
    humanReviewNote: "",
  };
}

function voiceKey(voice: Pick<PreAnalysisVoice, "trackIndex" | "channel">): string {
  return `${voice.trackIndex}:${voice.channel}`;
}

function safeVoiceLabel(voice: PreAnalysisVoice): string {
  const channel = `MIDI Channel ${voice.channel + 1}`;
  if (voice.channel === 9) return `${channel} / percussion`;
  if (voice.dominantProgram !== undefined && voice.gmProgramName) {
    return `GM ${voice.dominantProgram} (${voice.gmProgramName}) / ${channel}`;
  }
  return `Track ${voice.trackIndex + 1} / ${channel}`;
}

function assertFixtureId(value: string): void {
  if (!/^fixture-[a-z0-9]{8,32}$/.test(value)) {
    throw new Error("fixture id must use the anonymous fixture-<lowercase-id> format");
  }
}