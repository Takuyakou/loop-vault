import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import { preScanMidiSource } from "../../src/domain/midi/preAnalysis/voiceExtraction";
import type { Voice } from "../../src/domain/midi/types";
import { annotateVoiceRoles, buildVoiceFeatureInputs } from "../../src/domain/midi/voiceRoles";
import { buildVoices } from "../../src/domain/midi/voices";
import {
  createGroundTruthTemplate,
  type CurrentAutomaticRole,
  type GroundTruthRoleEvidence,
  type GroundTruthTemplate,
} from "./roleGroundTruthTemplate";

export function scanMidiForGroundTruth(bytes: Uint8Array, fixtureId: string): GroundTruthTemplate {
  const data = parseMidi(bytes);
  const normalized = normalizeNotes(data);
  const voices = buildVoices(data);
  const annotated = annotateVoiceRoles(voices, buildVoiceFeatureInputs(voices, normalized));
  const automaticRoles = new Map(annotated.map((voice) => [
    `${voice.trackIndex}:${voice.channel}`,
    currentAutomaticRole(voice),
  ]));
  const preScan = preScanMidiSource(bytes, {
    sourceId: fixtureId,
    displayName: "Local MIDI input",
  });
  return createGroundTruthTemplate(preScan, fixtureId, automaticRoles);
}

function currentAutomaticRole(voice: Voice): CurrentAutomaticRole {
  return {
    role: voice.inferredRole,
    confidence: round(voice.roleConfidence),
    evidence: safeEvidence(voice),
  };
}

function safeEvidence(voice: Voice): readonly GroundTruthRoleEvidence[] {
  const evidence: GroundTruthRoleEvidence[] = [{
    kind: "measured",
    role: voice.inferredRole,
    confidence: round(voice.roleEvidence.measured[voice.inferredRole]),
  }];
  if (voice.roleEvidence.channelRule) {
    evidence.unshift({
      kind: "channel",
      role: voice.roleEvidence.channelRule.role,
      confidence: round(voice.roleEvidence.channelRule.confidence),
    });
  }
  if (voice.roleEvidence.program) {
    evidence.unshift({
      kind: "program",
      role: voice.roleEvidence.program.role,
      confidence: round(voice.roleEvidence.program.confidence),
    });
  }
  if (voice.roleEvidence.trackName) {
    evidence.unshift({
      kind: "track-name-hint",
      role: voice.roleEvidence.trackName.role,
      confidence: round(voice.roleEvidence.trackName.confidence),
    });
  }
  return evidence;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}