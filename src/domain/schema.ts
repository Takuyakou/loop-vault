import { z } from "zod";
import type { SongIdea, VaultFile } from "./types";

export const statusSchema = z.enum([
  "idea",
  "loop",
  "arrange",
  "mix",
  "done",
  "hold",
  "abandoned",
]);

export const assetTypeSchema = z.enum(["midi", "audio", "flp", "other"]);

const isoDateSchema = z.string().datetime({ offset: true });

export const referenceSchema = z
  .object({
    title: z.string().min(1),
    url: z.string().url().optional(),
    memo: z.string().optional(),
  })
  .strict();

export const assetSchema = z
  .object({
    id: z.string().uuid(),
    type: assetTypeSchema,
    path: z.string().min(1).optional(),
    memo: z.string().optional(),
    missing: z.boolean().optional(),
  })
  .strict();

export const statusHistoryEntrySchema = z
  .object({
    status: statusSchema,
    at: isoDateSchema,
  })
  .strict();

export const songIdeaSchema: z.ZodType<SongIdea> = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(80),
    bpm: z.number().int().min(40).max(300).optional(),
    key: z.string().optional(),
    genre: z.string().optional(),
    moods: z.array(z.string()),
    status: statusSchema,
    prevStatus: statusSchema.optional(),
    nextAction: z
      .object({
        text: z.string(),
        updatedAt: isoDateSchema,
      })
      .strict(),
    chordMemo: z.string(),
    references: z.array(referenceSchema),
    assets: z.array(assetSchema),
    chordDrip: z.unknown().optional(),
    statusHistory: z.array(statusHistoryEntrySchema),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    completedAt: isoDateSchema.optional(),
  })
  .strict();

export const vaultSettingsSchema = z
  .object({
    monthlyGoal: z.number().int().min(1),
  })
  .strict();

export const vaultFileSchema: z.ZodType<VaultFile> = z
  .object({
    app: z.literal("loopvault"),
    fileVersion: z.literal(1),
    settings: vaultSettingsSchema,
    ideas: z.array(songIdeaSchema),
  })
  .strict();

const vaultEnvelopeSchema = z
  .object({
    app: z.literal("loopvault"),
    fileVersion: z.literal(1),
    settings: vaultSettingsSchema,
    ideas: z.array(z.unknown()),
  })
  .strict();

export interface QuarantinedRecord {
  index: number;
  value: unknown;
  issues: z.ZodIssue[];
}

export type VaultParseIssue =
  | {
      kind: "invalid-json";
      message: string;
    }
  | {
      kind: "invalid-vault";
      issues: z.ZodIssue[];
    };

export type VaultParseResult =
  | {
      ok: true;
      vault: VaultFile;
      quarantine: QuarantinedRecord[];
    }
  | {
      ok: false;
      error: VaultParseIssue;
    };

export function parseVaultFileJson(raw: string): VaultParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "invalid-json",
        message: error instanceof Error ? error.message : "Invalid JSON",
      },
    };
  }

  const envelope = vaultEnvelopeSchema.safeParse(parsed);

  if (!envelope.success) {
    return {
      ok: false,
      error: { kind: "invalid-vault", issues: envelope.error.issues },
    };
  }

  const ideas: SongIdea[] = [];
  const quarantine: QuarantinedRecord[] = [];

  envelope.data.ideas.forEach((idea, index) => {
    const result = songIdeaSchema.safeParse(idea);
    if (result.success) {
      ideas.push(result.data);
      return;
    }

    quarantine.push({
      index,
      value: idea,
      issues: result.error.issues,
    });
  });

  return {
    ok: true,
    vault: {
      app: envelope.data.app,
      fileVersion: envelope.data.fileVersion,
      settings: envelope.data.settings,
      ideas,
    },
    quarantine,
  };
}
