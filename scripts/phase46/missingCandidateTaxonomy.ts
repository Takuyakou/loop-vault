import type { NormalizedChordIdentity } from "../../src/domain/chordIdentity";

export type MissingCandidatePrimaryCategory =
  | "root-hypothesis-missing"
  | "core-triad-missing"
  | "seventh-core-missing"
  | "alteration-generation-missing"
  | "tension-generation-missing"
  | "sus-combination-missing"
  | "slash-bass-generation-missing"
  | "canonical-mapping-loss"
  | "budget-or-clamp-loss"
  | "evidence-insufficient"
  | "annotation-contract-issue"
  | "other";

export interface MissingCandidateSignals {
  representable: boolean;
  canonicalRoundTrip: boolean;
  rootHypothesisPresent: boolean;
  triadCorePresent: boolean;
  seventhCorePresent: boolean;
  exactIgnoringBassPresent: boolean;
  expectedHasAlteration: boolean;
  baseWithoutAlterationPresent: boolean;
  expectedHasTension: boolean;
  baseWithoutTensionPresent: boolean;
  expectedIsSuspendedSeventh: boolean;
  suspendedTriadPresent: boolean;
  presentBeforeClamp: boolean;
  presentAfterBudget: boolean;
  evidenceSufficient: boolean;
}

export function classifyMissingCandidate(
  signals: MissingCandidateSignals,
): MissingCandidatePrimaryCategory {
  if (!signals.representable) return "annotation-contract-issue";
  if (!signals.canonicalRoundTrip) return "canonical-mapping-loss";
  if (!signals.rootHypothesisPresent) return "root-hypothesis-missing";
  if (!signals.triadCorePresent) return "core-triad-missing";
  if (signals.expectedIsSuspendedSeventh && !signals.seventhCorePresent
    && signals.suspendedTriadPresent) {
    return "sus-combination-missing";
  }
  if (!signals.seventhCorePresent) return "seventh-core-missing";
  if (signals.exactIgnoringBassPresent) {
    return "slash-bass-generation-missing";
  }
  if (signals.expectedHasAlteration && signals.baseWithoutAlterationPresent) {
    return "alteration-generation-missing";
  }
  if (signals.expectedHasTension && signals.baseWithoutTensionPresent) {
    return "tension-generation-missing";
  }
  if (!signals.presentBeforeClamp || !signals.presentAfterBudget) {
    return "budget-or-clamp-loss";
  }
  if (!signals.evidenceSufficient) return "evidence-insufficient";
  return "other";
}

export function identityWithoutBass(identity: NormalizedChordIdentity): string {
  return [
    identity.rootPitchClass,
    identity.triad,
    identity.seventh ?? "-",
    identity.extensions.join("."),
    identity.alterations.join("."),
  ].join("|");
}

export function identityWithoutAlterations(
  identity: NormalizedChordIdentity,
): string {
  return [
    identity.rootPitchClass,
    identity.triad,
    identity.seventh ?? "-",
    identity.extensions.join("."),
  ].join("|");
}

export function identityWithoutTensions(
  identity: NormalizedChordIdentity,
): string {
  return [
    identity.rootPitchClass,
    identity.triad,
    identity.seventh ?? "-",
  ].join("|");
}
