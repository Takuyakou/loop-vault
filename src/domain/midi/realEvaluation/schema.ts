import { z } from "zod";
import { chordQualitySchema } from "../../schema";
import { parseChordLabel } from "../../chords";
import type { MidiDifferenceReview, RealMidiEvaluationCase } from "./types";
import type { MidiChordCorrectionEvent } from "../feedback";

const expectedChordSegmentSchema = z.object({
  startBeat: z.number().nonnegative(),
  endBeat: z.number().positive(),
  primary: z.string().min(1),
  root: z.number().int().min(0).max(11),
  quality: chordQualitySchema,
  bass: z.number().int().min(0).max(11).optional(),
  acceptableAlternatives: z.array(z.string().min(1)).optional(),
}).strict().refine((value) => value.endBeat > value.startBeat, "endBeat must be after startBeat");

const expectedAlternativeSchema = z.object({
  chord: z.string().min(1),
  strength: z.enum(["strong", "weak"]),
  reason: z.enum(["tension-reduction", "omitted-fifth", "enharmonic", "equivalent-pitch-set", "manual"]),
}).strict();

export const realMidiEvaluationCaseSchema: z.ZodType<RealMidiEvaluationCase> = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  source: z.object({
    fingerprint: z.string().regex(/^(sha256-[a-f0-9]{64}|fnv1a32-[a-f0-9]{8})$/),
    assetId: z.string().optional(),
    fileName: z.string().optional(),
  }).strict(),
  range: z.object({
    startBeat: z.number().nonnegative(),
    endBeat: z.number().positive(),
    startBar: z.number().int().min(1).optional(),
    endBar: z.number().int().min(1).optional(),
  }).strict().refine((value) => value.endBeat > value.startBeat, "endBeat must be after startBeat"),
  expected: z.object({
    primary: z.array(expectedChordSegmentSchema).min(1),
    alternatives: z.array(z.object({
      startBeat: z.number().nonnegative(),
      endBeat: z.number().positive(),
      alternatives: z.array(expectedAlternativeSchema),
    }).strict()).optional(),
  }).strict(),
  label: z.object({
    strength: z.enum(["gold", "silver", "bronze"]),
    origin: z.enum(["stored-progression", "manual-correction", "difference-review", "implicit-save", "manual-import"]),
    reviewedAt: z.string().datetime({ offset: true }).optional(),
    reviewer: z.literal("local-user").optional(),
  }).strict(),
  context: z.object({
    key: z.string().optional(),
    previousChord: z.string().optional(),
    nextChord: z.string().optional(),
    category: z.array(z.string()).optional(),
  }).strict().optional(),
  analyzerContext: z.object({
    sourceAnalyzerVersion: z.string().optional(),
    sourceWeightsVersion: z.string().optional(),
  }).strict().optional(),
}).strict();

const chordLabelSnapshotSchema = z.object({
  primary: z.string().min(1),
  alternatives: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()).optional(),
}).strict();

export const midiDifferenceReviewSchema: z.ZodType<MidiDifferenceReview> = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  sourceFingerprint: z.string().regex(/^(sha256-[a-f0-9]{64}|fnv1a32-[a-f0-9]{8})$/),
  range: z.object({
    startBeat: z.number().nonnegative(),
    endBeat: z.number().positive(),
  }).strict(),
  legacy: chordLabelSnapshotSchema,
  reranker: chordLabelSnapshotSchema,
  alternatives: z.array(chordLabelSnapshotSchema),
  judgment: z.enum(["legacy", "reranker", "both-acceptable", "neither", "skip"]),
  correctedChord: z.string().optional(),
  reviewedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.judgment === "neither" && !value.correctedChord) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["correctedChord"], message: "correctedChord is required" });
  }
  if (value.correctedChord && !parseChordLabel(value.correctedChord)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["correctedChord"], message: "invalid chord label" });
  }
});

export const midiChordCorrectionEventSchema: z.ZodType<MidiChordCorrectionEvent> = z.object({
  schemaVersion: z.literal(1),
  sourceFingerprint: z.string().regex(/^(sha256-[a-f0-9]{64}|fnv1a32-[a-f0-9]{8})$/),
  analyzerVersion: z.string().min(1),
  weightsVersion: z.string().min(1),
  segment: z.object({
    startBeat: z.number().nonnegative(),
    endBeat: z.number().positive(),
  }).strict(),
  detected: z.object({
    primary: z.string().min(1),
    alternatives: z.array(z.string().min(1)),
  }).strict(),
  corrected: z.string().min(1),
  editMethod: z.enum(["manual-label", "alternative-selection", "structure-editor"]),
  keyContext: z.string().optional(),
  previousChord: z.string().optional(),
  nextChord: z.string().optional(),
}).strict().refine((value) => value.segment.endBeat > value.segment.startBeat, {
  path: ["segment", "endBeat"],
  message: "endBeat must be after startBeat",
});
