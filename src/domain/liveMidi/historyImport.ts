import type { SavedProgressionBlock } from "../types";
import type { LiveChordHistoryEntry } from "./types";

export interface LiveHistoryImportContext {
  id: string;
  capturedAt: string;
}

export function historyToSavedProgressionBlock(
  history: readonly LiveChordHistoryEntry[],
  startIndex: number,
  endIndex: number,
  context: LiveHistoryImportContext,
): SavedProgressionBlock | undefined {
  const start = Math.max(0, Math.trunc(startIndex));
  const end = Math.min(history.length, Math.trunc(endIndex));
  const selected = history.slice(start, end);
  if (selected.length === 0) return undefined;

  return {
    id: context.id,
    origin: "live-midi",
    startBar: 1,
    endBar: selected.length,
    lengthBars: selected.length,
    summaryText: selected.map((entry) => entry.label).join(" - "),
    chords: selected.map((entry, index) => ({
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord: entry.chord,
      confidence: 0,
      alternatives: [],
      warnings: [],
    })),
    tags: [],
    capturedAt: context.capturedAt,
    analyzerVersion: "live-chord-v1",
    sourceAnalyzerVersion: "live-chord-v1",
    userEdited: false,
    userVerified: false,
  };
}
