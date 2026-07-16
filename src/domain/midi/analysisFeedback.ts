import type { MidiChordCorrectionEvent } from "./feedback";
import { analysisFeedbackEventSchema } from "./realEvaluation/schema";

export type TaggedMidiChordCorrectionEvent = MidiChordCorrectionEvent & {
  eventType: "chord-correction";
};

export interface CorrectionPropagationFeedbackEvent {
  schemaVersion: 1;
  eventType: "correction-propagation";
  sourceFingerprint: string;
  analyzerVersion: string;
  sourceSegment: {
    id: string;
    startBeat: number;
    endBeat: number;
  };
  shownSegmentIds: string[];
  acceptedSegmentIds: string[];
  rejectedSegmentIds: string[];
  threshold: number;
}

export type AnalysisFeedbackEvent =
  | TaggedMidiChordCorrectionEvent
  | CorrectionPropagationFeedbackEvent;

export type PersistedAnalysisFeedbackEvent =
  | MidiChordCorrectionEvent
  | CorrectionPropagationFeedbackEvent;

export interface AnalysisFeedbackReadResult {
  events: AnalysisFeedbackEvent[];
  correctionEvents: TaggedMidiChordCorrectionEvent[];
  propagationEvents: CorrectionPropagationFeedbackEvent[];
  rejected: { line: number; reason: "invalid-json" | "schema-validation" }[];
}

export function readAnalysisFeedbackJsonl(raw: string): AnalysisFeedbackReadResult {
  const events: AnalysisFeedbackEvent[] = [];
  const correctionEvents: TaggedMidiChordCorrectionEvent[] = [];
  const propagationEvents: CorrectionPropagationFeedbackEvent[] = [];
  const rejected: AnalysisFeedbackReadResult["rejected"] = [];

  raw.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      rejected.push({ line: index + 1, reason: "invalid-json" });
      return;
    }

    const result = analysisFeedbackEventSchema.safeParse(parsed);
    if (!result.success) {
      rejected.push({ line: index + 1, reason: "schema-validation" });
      return;
    }

    events.push(result.data);
    if (result.data.eventType === "chord-correction") {
      correctionEvents.push(result.data);
    } else {
      propagationEvents.push(result.data);
    }
  });

  return { events, correctionEvents, propagationEvents, rejected };
}
