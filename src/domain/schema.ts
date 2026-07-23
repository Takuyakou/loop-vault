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
export const appLanguageSchema = z.enum(["ja", "en"]);

export const chordQualitySchema = z.enum([
  "maj",
  "min",
  "dim",
  "aug",
  "maj7",
  "min7",
  "dom7",
  "min7b5",
  "dim7",
  "maj9",
  "min9",
  "dom9",
  "min11",
  "dom13",
  "sus2",
  "sus4",
  "dom7sus4",
  "add9",
  "six",
  "min6",
  "sixNine",
]);

export const tensionSchema = z.enum(["9", "b9", "#9", "11", "#11", "13", "b13"]);

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
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      entry.reason !== undefined
      && entry.status !== "hold"
      && entry.status !== "abandoned"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Status reasons are only allowed for Hold or Abandoned.",
      });
    }
  });

export const chordSymbolSchema = z
  .object({
    root: z.number().int().min(0).max(11),
    quality: chordQualitySchema,
    tensions: z.array(tensionSchema),
    bass: z.number().int().min(0).max(11).optional(),
    label: z.string().min(1),
  })
  .strict();

export const voicingSourceSchema = z.enum([
  "midi-extracted",
  "live-played",
  "chord-drip",
  "manual",
]);

export const voicingRepresentationSchema = z.enum([
  "simultaneous-voicing",
  "aggregated-note-set",
]);

export const voicingSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: voicingSourceSchema,
    representation: voicingRepresentationSchema,
    midiNotes: z.array(z.number().int().min(0).max(127)).min(2).max(10)
      .refine(
        (notes) => notes.every((note, index) => index === 0 || notes[index - 1]! < note),
        "MIDI notes must be sorted and unique.",
      ),
    bassNote: z.number().int().min(0).max(127).optional(),
    capturedForChordKey: z.string().min(1),
    capturedForChordLabel: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    userVerified: z.boolean().optional(),
    extractorVersion: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.bassNote !== undefined && !snapshot.midiNotes.includes(snapshot.bassNote)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bassNote"],
        message: "Bass note must be included in MIDI notes.",
      });
    }
  });

export const chordVoicingMemorySchema = z
  .object({
    sourceVoicing: voicingSnapshotSchema.optional(),
    practiceVoicingOverride: voicingSnapshotSchema.optional(),
  })
  .strict();

export const chordTimelineItemSchema = z
  .object({
    eventId: z.string().min(1).optional(),
    bar: z.number().int().min(1),
    beat: z.number().min(1),
    durationBeats: z.number().positive(),
    chord: chordSymbolSchema,
    confidence: z.number().min(0).max(1),
    alternatives: z
      .array(
        z
          .object({
            chord: chordSymbolSchema,
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(2),
    warnings: z.array(z.string()),
    voicingMemory: chordVoicingMemorySchema.optional(),
  })
  .strict();

export const practiceLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const practiceProvisionalClearSchema = z
  .object({
    level: practiceLevelSchema,
    clearedAt: isoDateSchema,
    clearedOnLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    targetTempo: z.number().int().min(40).max(300),
  })
  .strict();

export const progressionPracticeProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    progressionFingerprint: z.string().min(1),
    confirmedLevel: practiceLevelSchema.optional(),
    provisional: practiceProvisionalClearSchema.optional(),
    lastPracticedAt: isoDateSchema.optional(),
  })
  .strict();

export const savedProgressionBlockSchema = z
  .object({
    id: z.string().uuid(),
    origin: z.literal("live-midi").optional(),
    confidence: z.number().min(0).max(1).optional(),
    pinned: z.boolean().default(false),
    sourceAssetId: z.string().uuid().optional(),
    sourceFileName: z.string().optional(),
    sourceFingerprint: z.string().optional(),
    sourceStartBeat: z.number().nonnegative().optional(),
    sourceEndBeat: z.number().positive().optional(),
    startBar: z.number().int().min(1).optional(),
    endBar: z.number().int().min(1).optional(),
    lengthBars: z.number().int().positive().optional(),
    summaryText: z.string(),
    chords: z.array(chordTimelineItemSchema),
    detectedKey: z.string().optional(),
    bpm: z.number().positive().optional(),
    timeSignature: z.string().regex(/^\d+\/\d+$/).optional(),
    memo: z.string().optional(),
    tags: z.array(z.string()),
    suppressedAutoTags: z.array(z.object({
      tagId: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/).max(80),
      taxonomyVersion: z.number().int().positive(),
    }).strict()).max(100).default([]),
    capturedAt: isoDateSchema,
    analyzerVersion: z.string().min(1),
    sourceAnalyzerVersion: z.string().min(1).optional(),
    sourceWeightsVersion: z.string().min(1).optional(),
    userEdited: z.boolean().optional(),
    userVerified: z.boolean().optional(),
    practice: progressionPracticeProgressSchema.optional(),
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
    progressionBlocks: z.array(savedProgressionBlockSchema).default([]),
    statusHistory: z.array(statusHistoryEntrySchema),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    completedAt: isoDateSchema.optional(),
  })
  .strict();

export const vaultSettingsSchema = z
  .object({
    monthlyGoal: z.number().int().min(1),
    language: appLanguageSchema.default("ja"),
    showRomanNumerals: z.boolean().default(true),
  })
  .strict();

export const vaultFileSchema: z.ZodType<VaultFile, z.ZodTypeDef, unknown> = z
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
      kind: "future-version";
      fileVersion: number;
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
    const futureVersion = futureFileVersion(parsed);
    if (futureVersion !== undefined) {
      return {
        ok: false,
        error: { kind: "future-version", fileVersion: futureVersion },
      };
    }
  }

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

function futureFileVersion(value: unknown): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (record.app !== "loopvault") {
    return undefined;
  }

  if (typeof record.fileVersion !== "number") {
    return undefined;
  }

  return record.fileVersion > 1 ? record.fileVersion : undefined;
}
