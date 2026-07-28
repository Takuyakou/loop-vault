import type { MidiChordCorrectionEvent } from "./feedback";
import { analysisFeedbackEventSchema } from "./realEvaluation/schema";
import type { MidiProgressionAnalysis, ProgressionBlockCandidate } from "../types";
import type { ProgressionEditSource } from "../progressionEditing/types";
import { beatsPerBar } from "./timing";

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

export interface ProgressionSaveFeedbackEvent {
  schemaVersion: 1;
  eventType: "progression-save";
  sourceFingerprint: string;
  analyzerVersion: string;
  occurredAt: string;
  range: {
    startBeat: number;
    endBeat: number;
  };
  savedEventCount: number;
  userEdited: boolean;
  userVerified: boolean;
  decisions: Array<{
    startBeat: number;
    endBeat: number;
    detected: string | null;
    saved: string;
    outcome: "rank1" | "rank2" | "rank3" | "manual-input";
  }>;
}

export type AnalysisFeedbackEvent =
  | TaggedMidiChordCorrectionEvent
  | CorrectionPropagationFeedbackEvent
  | ProgressionSaveFeedbackEvent;

export type PersistedAnalysisFeedbackEvent =
  | MidiChordCorrectionEvent
  | CorrectionPropagationFeedbackEvent
  | ProgressionSaveFeedbackEvent;

export interface AnalysisFeedbackReadResult {
  events: AnalysisFeedbackEvent[];
  correctionEvents: TaggedMidiChordCorrectionEvent[];
  propagationEvents: CorrectionPropagationFeedbackEvent[];
  progressionSaveEvents: ProgressionSaveFeedbackEvent[];
  rejected: { line: number; reason: "invalid-json" | "schema-validation" }[];
}

export function buildProgressionSaveFeedbackEvent(
  original: Pick<ProgressionBlockCandidate, "chords">,
  saved: Pick<ProgressionBlockCandidate, "chords">,
  analysis: Pick<
    MidiProgressionAnalysis,
    "sourceFingerprint" | "timeSignature" | "analyzerVersion"
  >,
  _editSources: readonly (ProgressionEditSource | undefined)[],
  metadata: {
    occurredAt: string;
    userEdited: boolean;
    userVerified: boolean;
  },
): ProgressionSaveFeedbackEvent | undefined {
  if (!analysis.sourceFingerprint || saved.chords.length === 0) return undefined;
  const meter = beatsPerBar(analysis.timeSignature);
  const decisions = saved.chords.map((item, index) => {
    const detected = original.chords[index];
    const startBeat = (item.bar - 1) * meter + item.beat - 1;
    return {
      startBeat,
      endBeat: startBeat + item.durationBeats,
      detected: detected?.chord.label ?? null,
      saved: item.chord.label,
      outcome: correctionOutcome(detected, item.chord.label),
    };
  });
  return {
    schemaVersion: 1,
    eventType: "progression-save",
    sourceFingerprint: analysis.sourceFingerprint,
    analyzerVersion: analysis.analyzerVersion,
    occurredAt: metadata.occurredAt,
    range: {
      startBeat: Math.min(...decisions.map((item) => item.startBeat)),
      endBeat: Math.max(...decisions.map((item) => item.endBeat)),
    },
    savedEventCount: decisions.length,
    userEdited: metadata.userEdited,
    userVerified: metadata.userVerified,
    decisions,
  };
}

export function readAnalysisFeedbackJsonl(raw: string): AnalysisFeedbackReadResult {
  const events: AnalysisFeedbackEvent[] = [];
  const correctionEvents: TaggedMidiChordCorrectionEvent[] = [];
  const propagationEvents: CorrectionPropagationFeedbackEvent[] = [];
  const progressionSaveEvents: ProgressionSaveFeedbackEvent[] = [];
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
    } else if (result.data.eventType === "correction-propagation") {
      propagationEvents.push(result.data);
    } else {
      progressionSaveEvents.push(result.data);
    }
  });

  return {
    events,
    correctionEvents,
    propagationEvents,
    progressionSaveEvents,
    rejected,
  };
}

function correctionOutcome(
  detected: ProgressionBlockCandidate["chords"][number] | undefined,
  savedLabel: string,
): ProgressionSaveFeedbackEvent["decisions"][number]["outcome"] {
  if (detected?.chord.label === savedLabel) return "rank1";
  const alternativeIndex = detected?.alternatives.findIndex(
    (alternative) => alternative.chord.label === savedLabel,
  ) ?? -1;
  if (alternativeIndex === 0) return "rank2";
  if (alternativeIndex === 1) return "rank3";
  return "manual-input";
}
