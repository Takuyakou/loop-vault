import type { VoiceRole } from "./types";

export interface GmRoleEvidence {
  role: VoiceRole;
  confidence: number;
  explicit: boolean;
}

export function gmProgramRole(
  program: number | undefined,
  explicit: boolean,
): GmRoleEvidence | undefined {
  if (program === undefined || !explicit || program < 0 || program > 127) {
    return undefined;
  }

  if (program <= 15) return evidence("harmony", program <= 7 ? 0.65 : 0.6);
  if (program <= 23) return evidence("harmony", 0.76);
  if (program <= 31) return evidence("harmony", 0.7);
  if (program <= 39) return evidence("bass", 0.95);
  if (program <= 47) return evidence("melody", 0.78);
  if (program <= 55) return evidence("pad", 0.88);
  if (program <= 79) return evidence("melody", 0.8);
  if (program <= 87) return evidence("melody", 0.9);
  if (program <= 95) return evidence("pad", 0.88);
  if (program <= 103) return evidence("pad", 0.72);
  if (program <= 111) return evidence("mixed", 0.55);
  if (program <= 119) return evidence("percussion", 0.96);
  return evidence("mixed", 0.3);
}

export function isGmPercussionProgram(program: number | undefined): boolean {
  return program !== undefined && program >= 112 && program <= 119;
}

function evidence(role: VoiceRole, confidence: number): GmRoleEvidence {
  return { role, confidence, explicit: true };
}
