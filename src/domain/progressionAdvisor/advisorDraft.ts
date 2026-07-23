import { parseChordLabel } from "../chords";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import type { AdvisorSuggestion } from "./types";

export function advisorSuggestionToTimeline(suggestion: AdvisorSuggestion): ChordTimelineItem[] {
  return suggestion.events.map((event) => {
    const chord = parseChordLabel(event.chord);
    if (!chord) throw new Error(`Unsupported advisor chord: ${event.chord}`);
    return {
      bar: event.bar,
      beat: event.startBeat,
      durationBeats: event.durationBeats,
      chord,
      confidence: 0,
      alternatives: [],
      warnings: ["ai-generated-unverified"],
    };
  });
}

export function advisorSuggestionToCandidate(suggestion: AdvisorSuggestion): ProgressionBlockCandidate {
  return {
    id: `advisor-${safeId(suggestion.id)}`,
    startBar: 1,
    endBar: 8,
    lengthBars: 8,
    chords: advisorSuggestionToTimeline(suggestion),
    summaryText: suggestion.events.map((event) => event.chord).join(" - "),
    confidence: 0,
    labels: [suggestion.strategy],
    warnings: ["ai-generated-unverified"],
  };
}

function safeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "proposal";
}
