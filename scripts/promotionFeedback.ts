import type { MidiChordCorrectionEvent } from "../src/domain/midi/feedback";
import { readAnalysisFeedbackJsonl } from "../src/domain/midi/analysisFeedback";

export interface PromotionFeedbackReadResult {
  events: MidiChordCorrectionEvent[];
  skippedPropagation: number;
  rejected: { line: number; reason: "invalid-json" | "schema-validation" }[];
}

export function readPromotionFeedback(raw: string): PromotionFeedbackReadResult {
  const result = readAnalysisFeedbackJsonl(raw);
  return {
    events: result.correctionEvents,
    skippedPropagation: result.propagationEvents.length,
    rejected: result.rejected,
  };
}
