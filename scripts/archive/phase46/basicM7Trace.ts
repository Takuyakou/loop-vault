export type BasicM7TraceCategory =
  | "root-hypothesis-missing"
  | "core-not-generated"
  | "slash-only-generated"
  | "canonical-mapping-loss"
  | "budget-or-clamp-loss"
  | "evidence-does-not-support-gold"
  | "annotation-contract-issue"
  | "generator-bug"
  | "other";

export interface BasicM7TraceSignals {
  representable: boolean;
  rootHypothesisPresent: boolean;
  minorSeventhCoreGenerated: boolean;
  rootPositionGenerated: boolean;
  slashIdentityGenerated: boolean;
  canonicalRoundTrip: boolean;
  presentBeforeClamp: boolean;
  presentAfterBudget: boolean;
  evidenceSupportsGold: boolean;
}

export function classifyBasicM7Trace(
  signals: BasicM7TraceSignals,
): BasicM7TraceCategory {
  if (!signals.representable) return "annotation-contract-issue";
  if (!signals.rootHypothesisPresent) return "root-hypothesis-missing";
  if (!signals.minorSeventhCoreGenerated) return "core-not-generated";
  if (!signals.canonicalRoundTrip) return "canonical-mapping-loss";
  if (!signals.presentBeforeClamp || !signals.presentAfterBudget) {
    return "budget-or-clamp-loss";
  }
  if (!signals.rootPositionGenerated && signals.slashIdentityGenerated) {
    return "slash-only-generated";
  }
  if (!signals.evidenceSupportsGold) return "evidence-does-not-support-gold";
  return "other";
}
