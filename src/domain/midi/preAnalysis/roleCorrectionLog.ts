import { z } from "zod";
import type { AnalysisSession } from "./types";

const roleSchema = z.enum([
  "harmony",
  "bass",
  "melody-weak",
  "exclude",
]);

export const roleCorrectionLogEventSchema = z.object({
  schemaVersion: z.literal(1),
  sourcePosition: z.enum(["master", "added"]),
  autoRole: roleSchema,
  autoRoleConfidence: z.number().min(0).max(1),
  assignedRole: roleSchema,
  dominantProgram: z.number().int().min(0).max(127).optional(),
  channel: z.number().int().min(0).max(15),
  noteCount: z.number().int().nonnegative(),
  minPitch: z.number().int().min(0).max(127).optional(),
  maxPitch: z.number().int().min(0).max(127).optional(),
  averageDurationBeats: z.number().nonnegative().optional(),
  averagePolyphony: z.number().nonnegative().optional(),
  preset: z.enum([
    "auto",
    "harmony-bass",
    "accompaniment-only",
    "all-pitched",
    "custom",
  ]),
  manuallyChanged: z.boolean(),
  includedForAnalysis: z.boolean(),
  exactDuplicateExcluded: z.boolean(),
  analyzeExecuted: z.literal(true),
  occurredAt: z.string().datetime(),
}).strict();

export type RoleCorrectionLogEvent = z.infer<
  typeof roleCorrectionLogEventSchema
>;

export function buildRoleCorrectionLogEvents(
  session: AnalysisSession,
  occurredAt: string,
): RoleCorrectionLogEvent[] {
  return session.voices.map((voice): RoleCorrectionLogEvent => ({
    schemaVersion: 1,
    sourcePosition: voice.sourceId === session.masterSourceId
      ? "master"
      : "added",
    autoRole: voice.autoRole,
    autoRoleConfidence: voice.autoRoleConfidence,
    assignedRole: voice.assignedRole,
    ...(voice.dominantProgram !== undefined
      ? { dominantProgram: voice.dominantProgram }
      : {}),
    channel: voice.channel,
    noteCount: voice.noteCount,
    ...(voice.minPitch !== undefined ? { minPitch: voice.minPitch } : {}),
    ...(voice.maxPitch !== undefined ? { maxPitch: voice.maxPitch } : {}),
    ...(voice.averageDurationBeats !== undefined
      ? { averageDurationBeats: voice.averageDurationBeats }
      : {}),
    ...(voice.averagePolyphony !== undefined
      ? { averagePolyphony: voice.averagePolyphony }
      : {}),
    preset: session.preset,
    manuallyChanged: voice.assignedRole !== voice.autoRole,
    includedForAnalysis: voice.included
      && voice.assignedRole !== "exclude"
      && voice.duplicateOf === undefined,
    exactDuplicateExcluded: voice.duplicateOf !== undefined,
    analyzeExecuted: true,
    occurredAt,
  }));
}

export function readRoleCorrectionLogJsonl(raw: string): {
  events: RoleCorrectionLogEvent[];
  invalidLineCount: number;
} {
  const events: RoleCorrectionLogEvent[] = [];
  let invalidLineCount = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = roleCorrectionLogEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
      else invalidLineCount += 1;
    } catch {
      invalidLineCount += 1;
    }
  }
  return { events, invalidLineCount };
}
