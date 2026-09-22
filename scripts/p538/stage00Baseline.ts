import { formatProgressionText } from "../../src/domain/progressionText";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";

export interface Stage00DownstreamBaseline {
  sourceMeter: string;
  sourceBeatsPerBar: number;
  sourceBars: number;
  sourceNotes: number;
  timelineItems: number;
  occupiedSourceBars: number;
  formattedBarCount: number;
  dashCount: number;
  blockCandidateCount: number;
}

/**
 * Privacy-safe aggregate view of the current production analysis path.
 *
 * This intentionally exposes counts only: never filenames, paths, bytes,
 * fingerprints, raw notes, or a chord transcription.
 */
export function stage00DownstreamBaseline(bytes: Uint8Array): Stage00DownstreamBaseline {
  const source = parseMidi(bytes);
  const analysis = analyzeMidi(bytes);
  const progressionText = formatProgressionText(analysis.fullTimeline);
  const formattedCells = progressionText
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  return {
    sourceMeter: source.timeSignature ?? "4/4",
    sourceBeatsPerBar: beatsPerBar(source.timeSignature),
    sourceBars: source.totalBars,
    sourceNotes: source.notes.length,
    timelineItems: analysis.fullTimeline.length,
    occupiedSourceBars: new Set(analysis.fullTimeline.map((item) => item.bar)).size,
    formattedBarCount: formattedCells.length,
    dashCount: formattedCells.filter((cell) => cell === "-").length,
    blockCandidateCount: analysis.blockCandidates.length,
  };
}
