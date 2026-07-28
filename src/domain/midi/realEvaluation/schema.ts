import { z } from "zod";
import { chordQualitySchema } from "../../schema";
import { parseChordLabel } from "../../chords";
import type { MidiDifferenceReview, RealMidiEvaluationCase } from "./types";
import type { MidiChordCorrectionEvent } from "../feedback";
import type {
  CorrectionPropagationFeedbackEvent,
  ProgressionSaveFeedbackEvent,
} from "../analysisFeedback";

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

const correctionSegmentSchema = z.object({
  startBeat: z.number().nonnegative(),
  endBeat: z.number().positive(),
}).strict().refine((value) => value.endBeat > value.startBeat, {
  path: ["endBeat"],
  message: "endBeat must be after startBeat",
});

const midiChordCorrectionEventObjectSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("chord-correction").optional(),
  sourceFingerprint: z.string().regex(/^(sha256-[a-f0-9]{64}|fnv1a32-[a-f0-9]{8})$/),
  analyzerVersion: z.string().min(1),
  weightsVersion: z.string().min(1),
  segment: correctionSegmentSchema,
  detected: z.object({
    primary: z.string().min(1),
    alternatives: z.array(z.string().min(1)),
  }).strict(),
  corrected: z.string().min(1),
  editMethod: z.enum(["manual-label", "alternative-selection", "structure-editor"]),
  keyContext: z.string().optional(),
  previousChord: z.string().optional(),
  nextChord: z.string().optional(),
  quickCandidateSelection: z.object({
    source: z.enum(["analyzer", "harmonicContext", "smoothConnection", "authorReferenceFit"]),
    sources: z.array(z.enum(["analyzer", "harmonicContext", "smoothConnection", "authorReferenceFit"])).optional(),
    candidateRank: z.number().int().nonnegative(),
    displayedCandidateCount: z.number().int().min(1).max(5),
  }).strict().optional(),
}).strict();

export const midiChordCorrectionEventSchema: z.ZodType<MidiChordCorrectionEvent> =
  midiChordCorrectionEventObjectSchema;

const taggedMidiChordCorrectionEventSchema = midiChordCorrectionEventObjectSchema.extend({
  eventType: z.literal("chord-correction"),
});

const segmentIdArraySchema = z.array(z.string().min(1)).refine(
  (ids) => new Set(ids).size === ids.length,
  "segment ids must be unique",
);

const correctionPropagationFeedbackEventObjectSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("correction-propagation"),
  sourceFingerprint: z.string().regex(/^(sha256-[a-f0-9]{64}|fnv1a32-[a-f0-9]{8})$/),
  analyzerVersion: z.string().min(1),
  sourceSegment: z.object({
    id: z.string().min(1),
    startBeat: z.number().nonnegative(),
    endBeat: z.number().positive(),
  }).strict().refine((value) => value.endBeat > value.startBeat, {
    path: ["endBeat"],
    message: "endBeat must be after startBeat",
  }),
  shownSegmentIds: segmentIdArraySchema,
  acceptedSegmentIds: segmentIdArraySchema,
  rejectedSegmentIds: segmentIdArraySchema,
  threshold: z.number().min(0).max(1),
}).strict();

function validatePropagationRouting(
  value: CorrectionPropagationFeedbackEvent,
  context: z.RefinementCtx,
): void {
  const shown = new Set(value.shownSegmentIds);
  value.acceptedSegmentIds.forEach((id, index) => {
    if (!shown.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedSegmentIds", index],
        message: "accepted segment must have been shown",
      });
    }
  });
  const accepted = new Set(value.acceptedSegmentIds);
  const routed = new Set(value.acceptedSegmentIds);
  value.rejectedSegmentIds.forEach((id, index) => {
    if (!shown.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedSegmentIds", index],
        message: "rejected segment must have been shown",
      });
    }
    if (accepted.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedSegmentIds", index],
        message: "segment cannot be both accepted and rejected",
      });
    }
    routed.add(id);
  });
  value.shownSegmentIds.forEach((id, index) => {
    if (!routed.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shownSegmentIds", index],
        message: "shown segment must be accepted or rejected",
      });
    }
  });
}

export const correctionPropagationFeedbackEventSchema: z.ZodType<CorrectionPropagationFeedbackEvent> =
  correctionPropagationFeedbackEventObjectSchema.superRefine(validatePropagationRouting);

const progressionSaveFeedbackEventObjectSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("progression-save"),
  sourceFingerprint: z.string().regex(/^(sha256-[a-f0-9]{64}|fnv1a32-[a-f0-9]{8})$/),
  analyzerVersion: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  range: correctionSegmentSchema,
  savedEventCount: z.number().int().positive(),
  userEdited: z.boolean(),
  userVerified: z.boolean(),
  decisions: z.array(z.object({
    startBeat: z.number().nonnegative(),
    endBeat: z.number().positive(),
    detected: z.string().min(1).nullable(),
    saved: z.string().min(1),
    outcome: z.enum(["rank1", "rank2", "rank3", "manual-input"]),
  }).strict().refine((value) => value.endBeat > value.startBeat, {
    path: ["endBeat"],
    message: "endBeat must be after startBeat",
  })).min(1),
}).strict();

function validateProgressionSaveFeedback(
  value: ProgressionSaveFeedbackEvent,
  context: z.RefinementCtx,
): void {
  if (value.savedEventCount !== value.decisions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["savedEventCount"],
      message: "savedEventCount must match decisions length",
    });
  }
}

const analysisFeedbackEventDiscriminatedSchema = z.discriminatedUnion("eventType", [
  taggedMidiChordCorrectionEventSchema,
  correctionPropagationFeedbackEventObjectSchema,
  progressionSaveFeedbackEventObjectSchema,
]).superRefine((value, context) => {
  if (value.eventType === "correction-propagation") validatePropagationRouting(value, context);
  if (value.eventType === "progression-save") validateProgressionSaveFeedback(value, context);
});

export const analysisFeedbackEventSchema = z.preprocess((value) => {
    if (
      typeof value === "object"
      && value !== null
      && !Array.isArray(value)
      && !Object.prototype.hasOwnProperty.call(value, "eventType")
    ) {
      return { ...value, eventType: "chord-correction" };
    }
    return value;
}, analysisFeedbackEventDiscriminatedSchema);
