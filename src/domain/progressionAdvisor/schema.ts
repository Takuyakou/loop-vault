import { z } from "zod";
import { isKnownProgressionTagId } from "../progressionClassification/taxonomy";

const tagIdSchema = z.string().min(1).max(100).refine(isKnownProgressionTagId, "Unknown taxonomy tag ID");

export const advisorChordEventSchema = z.object({
  bar: z.number().int().min(1).max(8),
  startBeat: z.number().finite().positive().max(4),
  durationBeats: z.number().finite().positive().max(4),
  chord: z.string().trim().min(1).max(40),
}).strict();

const referenceContextSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  key: z.string().trim().min(1).max(24).optional(),
  mode: z.string().trim().min(1).max(40).optional(),
  romanNumerals: z.array(z.string().trim().min(1).max(24)).max(64),
  chordLabels: z.array(z.string().trim().min(1).max(40)).max(64),
  tagIds: z.array(tagIdSchema).max(24),
  verified: z.boolean(),
}).strict();

export const advisorRequestSchema = z.object({
  schemaVersion: z.literal(1),
  progression: z.object({
    title: z.string().trim().min(1).max(120).optional(),
    key: z.string().trim().min(1).max(24).optional(),
    mode: z.string().trim().min(1).max(40).optional(),
    bpm: z.number().finite().positive().max(400).optional(),
    bars: z.number().int().positive().max(512),
    timeSignature: z.string().trim().min(1).max(16),
    events: z.array(advisorChordEventSchema.omit({ bar: true }).extend({ bar: z.number().int().positive().max(512) })).min(1).max(2048),
    romanNumerals: z.array(z.string().trim().min(1).max(24)).max(2048).optional(),
    manualTagIds: z.array(tagIdSchema).max(24),
    derivedTagIds: z.array(tagIdSchema).max(24),
    origin: z.string().trim().min(1).max(60).optional(),
  }).strict(),
  instruction: z.string().trim().min(1).max(1000).optional(),
  output: z.object({
    proposalCount: z.literal(3),
    barsPerProposal: z.literal(8),
    strategies: z.tuple([z.literal("close_development"), z.literal("contrast"), z.literal("experimental")]),
  }).strict(),
  context: z.array(referenceContextSchema).max(3).optional(),
}).strict();

export const advisorSuggestionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  strategy: z.enum(["close_development", "contrast", "experimental"]),
  label: z.string().trim().min(1).max(80),
  intent: z.string().trim().min(1).max(500),
  key: z.string().trim().min(1).max(24).nullish().transform((value) => value ?? undefined),
  mode: z.string().trim().min(1).max(40).nullish().transform((value) => value ?? undefined),
  bars: z.literal(8),
  timeSignature: z.literal("4/4"),
  events: z.array(advisorChordEventSchema).min(8).max(64),
  suggestedTagIds: z.array(tagIdSchema).max(24),
}).strict();

export const advisorResponseSchema = z.object({
  schemaVersion: z.literal(1),
  analysis: z.string().trim().min(1).max(2000),
  suggestions: z.array(advisorSuggestionSchema).length(3),
  suggestedTagIds: z.array(tagIdSchema).max(24),
}).strict();
