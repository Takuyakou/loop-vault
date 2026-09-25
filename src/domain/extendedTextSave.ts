import type { ChordTimelineItem } from "./types";
import type { ExtendedTextResult } from "./extendedTextProgression";
import { buildSavedTextSource, type SavedTextSourceV1 } from "./textSource";

export interface ExtendedTextSaveData {
  readonly title: string;
  readonly summaryText: string;
  readonly chords: readonly ChordTimelineItem[];
  readonly scoreLengthBeats: number;
  readonly beatsPerBar: number;
  readonly textSource: SavedTextSourceV1;
  readonly bpm?: number;
  readonly confirmedKey?: string;
}

/** Harmonic cards are saved once; articulation stays in the source model. */
export function extendedTextSaveData(result: ExtendedTextResult): ExtendedTextSaveData {
  if (!result.canConvert) throw new Error("Only a complete extended text result can be saved.");
  const beatsPerBar = result.beatsPerBar;
  const chords: ChordTimelineItem[] = result.harmonicSpans.map(span => ({
    bar: Math.floor(span.startBeat / beatsPerBar) + 1,
    beat: span.startBeat % beatsPerBar + 1,
    durationBeats: span.durationBeats,
    chord: { ...span.chord, tensions: [...span.chord.tensions],
      ...(span.chord.omissions === undefined ? {} : { omissions: [...span.chord.omissions] }) },
    confidence: 0,
    alternatives: [],
    warnings: [],
  }));
  const labels = chords.slice(0, 4).map(item => item.chord.label);
  const summaryText = `| ${result.bars.map(bar => bar.join(" ")).join(" | ")} |`;
  return {
    title: `${labels.join(" / ")}${chords.length > 4 ? " ..." : ""}`.slice(0, 80),
    summaryText,
    chords,
    scoreLengthBeats: result.scoreLengthBeats,
    beatsPerBar,
    textSource: buildSavedTextSource(result),
    ...(result.metadata.bpm === undefined ? {} : { bpm: result.metadata.bpm }),
    ...(result.metadata.confirmed && result.metadata.key ? { confirmedKey: result.metadata.key } : {}),
  };
}
