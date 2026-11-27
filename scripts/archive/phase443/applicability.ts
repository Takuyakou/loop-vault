import type {
  SupportEvaluationRow,
  SupportEvidence,
} from "../phase442/supportEvaluation";

export type ApplicabilityClass = "H" | "N" | "X" | "unclassified";

export interface ApplicabilityClassification {
  class: ApplicabilityClass;
  reasons: string[];
}

export interface ApplicabilityOptions {
  minimumRoleConfidence: number;
}

export function classifyApplicability(
  row: Pick<SupportEvaluationRow, "mode" | "evidence">,
  options: ApplicabilityOptions,
): ApplicabilityClassification {
  const roleReasons = roleMisclassificationReasons(
    row.mode,
    row.evidence,
    options,
  );
  if (roleReasons.length > 0) {
    return { class: "X", reasons: roleReasons };
  }

  const supportReasons = noHarmonyReasons(row.evidence);
  if (supportReasons.length > 0) {
    return { class: "N", reasons: supportReasons };
  }

  if (
    row.evidence.productRole === "melody"
    && row.evidence.roleConfidence >= options.minimumRoleConfidence
    && row.evidence.hasHarmonyVoice
    && row.evidence.supportPitchCount >= 1
  ) {
    return {
      class: "H",
      reasons: [
        "role-is-melody",
        "role-confidence-passed",
        "harmony-voice-present",
        "support-count-positive",
      ],
    };
  }

  return { class: "unclassified", reasons: ["classification-incomplete"] };
}

function roleMisclassificationReasons(
  mode: SupportEvaluationRow["mode"],
  evidence: SupportEvidence,
  options: ApplicabilityOptions,
): string[] {
  const reasons: string[] = [];
  if (mode === "allch0" || mode === "allch0clear") {
    reasons.push("all-channel-zero-role-diagnostic");
  }
  if (evidence.productRole !== "melody") {
    reasons.push(`role-is-${evidence.productRole}`);
  }
  if (evidence.roleConfidence < options.minimumRoleConfidence) {
    reasons.push("role-confidence-below-minimum");
  }
  return reasons;
}

function noHarmonyReasons(evidence: SupportEvidence): string[] {
  const reasons: string[] = [];
  if (!evidence.hasHarmonyVoice) reasons.push("harmony-voice-missing");
  if (evidence.supportPitchCount === 0) reasons.push("support-count-zero");
  return reasons;
}
