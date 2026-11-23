import type { ChordTimelineItem, VoicingSnapshot } from "./types";
import type { ExtendedTextResult } from "./extendedTextProgression";
import { buildSavedTextSource, type SavedTextSourceV1 } from "./textSource";
import { createTextProgressionStyleSnapshot } from "./textProgressionVoicing";
import { textAttackPlacements } from "./textAttackSplits";

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

/**
 * P24-fix-1: where a card's sound comes from. `byAttackBeat` is the keys played for that very card (a
 * repeated chord keeps each press); `bySpanStart` is a style chosen by hand (the 「コード詳細」) and covers
 * every attack of its span. A card with neither keeps the generated voicing.
 */
export interface TextSaveVoicings {
  readonly byAttackBeat?: ReadonlyMap<number, VoicingSnapshot | undefined>;
  readonly bySpanStart?: ReadonlyMap<number, VoicingSnapshot | undefined>;
}

/**
 * The Vault's chords: one card per written attack (`| C | C |` → two, `| C % |` → two, `| C = |` → one).
 * The source model keeps the whole text and the spans; this is only the chord list the Vault stores.
 */
export function extendedTextSaveData(
  result: ExtendedTextResult,
  voicings: TextSaveVoicings = {},
): ExtendedTextSaveData {
  if (!result.canConvert) throw new Error("Only a complete extended text result can be saved.");
  const beatsPerBar = result.beatsPerBar;
  const chords: ChordTimelineItem[] = textAttackPlacements(result.harmonicSpans).map((place) => ({
    bar: Math.floor(place.beat / beatsPerBar) + 1,
    beat: place.beat % beatsPerBar + 1,
    durationBeats: place.durationBeats,
    chord: { ...place.chord, tensions: [...place.chord.tensions],
      ...(place.chord.omissions === undefined ? {} : { omissions: [...place.chord.omissions] }) },
    confidence: 0,
    alternatives: [],
    warnings: [],
    voicingMemory: {
      practiceVoicingOverride: voicings.byAttackBeat?.get(place.beat)
        ?? voicings.bySpanStart?.get(place.spanStart)
        ?? createTextProgressionStyleSnapshot(place.chord, "generated-close"),
    },
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
