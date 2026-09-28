import { beatsPerBar } from "../../domain/midi";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";

export type ProgressionSourceKind = "midi" | "text" | "live-midi";

export const progressionSourceLabels: Record<ProgressionSourceKind, string> = {
  midi: "MIDI",
  text: "テキスト",
  "live-midi": "Live MIDI",
};

export const UNTITLED_PROGRESSION = "無題の進行";

/**
 * A progression's display name: its Idea's title (what the person typed when saving).
 * An Idea holding several progressions adds the bar range (or position) to tell them apart;
 * `summaryText` is the chord summary and only stands in when the Idea has no title.
 */
export function progressionName(idea: SongIdea, block: SavedProgressionBlock): string {
  const title = idea.title.trim() || block.summaryText.trim() || UNTITLED_PROGRESSION;
  const blocks = idea.progressionBlocks ?? [];
  if (blocks.length < 2) return title;
  if (block.startBar !== undefined && block.endBar !== undefined) return `${title} · ${block.startBar}–${block.endBar}小節`;
  return `${title} · ${blocks.findIndex((candidate) => candidate.id === block.id) + 1}`;
}

export function progressionKey(idea: SongIdea, block: SavedProgressionBlock): string | undefined {
  return block.detectedKey ?? idea.key;
}

export function progressionBpm(idea: SongIdea, block: SavedProgressionBlock): number | undefined {
  return block.bpm ?? idea.bpm;
}

export function progressionSourceKind(block: SavedProgressionBlock): ProgressionSourceKind {
  if (block.origin === "live-midi") return "live-midi";
  if (block.textSource) return "text";
  return "midi";
}

/** Saved length when known, else measured from the chord timeline. */
export function progressionBars(block: SavedProgressionBlock): number {
  if (block.lengthBars) return block.lengthBars;
  if (block.startBar !== undefined && block.endBar !== undefined && block.endBar >= block.startBar) {
    return block.endBar - block.startBar + 1;
  }
  if (!block.chords.length) return 0;
  const perBar = beatsPerBar(block.timeSignature);
  const starts = block.chords.map((item) => (item.bar - 1) * perBar + (item.beat - 1));
  const ends = block.chords.map((item, index) => starts[index] + item.durationBeats);
  return Math.max(1, Math.ceil((Math.max(...ends) - Math.min(...starts)) / perBar));
}

/** When the progression was last captured or its Idea edited. */
export function progressionTouchedAt(idea: SongIdea, block: SavedProgressionBlock): number {
  return Math.max(Date.parse(block.capturedAt) || 0, Date.parse(idea.updatedAt) || 0);
}
