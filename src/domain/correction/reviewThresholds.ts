import { z } from "zod";
import rawThresholds from "../../../docs/phase10.0/contracts/P10-review-thresholds.json";

/**
 * The review-rule numbers are the contract file itself (P10.0-00, decided 2026-09-29);
 * they are read and checked here, never copied into code.
 */
export const melodyRules = [
  "continued-top",
  "melody-role",
  "either",
  "melody-role-nonchord",
  "continued-top-or-melody-nonchord",
] as const;

const schema = z.object({
  schemaVersion: z.literal(1),
  melody: z.object({
    rule: z.enum(melodyRules),
    continuedToleranceBeats: z.number().nonnegative(),
    melodyRoles: z.array(z.string()).min(1),
    requireNonChordToneForRoleMatch: z.boolean(),
  }),
  percussion: z.object({
    shortMaxBeats: z.number().positive(),
    gridBeats: z.number().positive(),
    gridToleranceBeats: z.number().nonnegative(),
    minRepeatsInSong: z.number().int().positive(),
  }),
  sameChordSplit: z.object({ compare: z.string() }),
});

export type ReviewThresholds = z.infer<typeof schema>;

export function parseReviewThresholds(value: unknown): ReviewThresholds {
  return schema.parse(value);
}

export const reviewThresholds: ReviewThresholds = parseReviewThresholds(rawThresholds);
