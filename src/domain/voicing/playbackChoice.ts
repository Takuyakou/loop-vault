import type { ChordSymbol, ChordVoicingMemory } from "../types";
import { voicingCompatibility } from "./compatibility";

export type SourceMigrationPolicy =
  | "AUTO_MIGRATE_ALL_SOURCE"
  | "KEEP_LEGACY_AND_SUGGEST_SOURCE"
  | "EVIDENCE_BASED_MIGRATION";

export interface PlaybackChoiceCard {
  chord: ChordSymbol;
  voicingMemory?: ChordVoicingMemory;
}

export function canChooseSource(card: PlaybackChoiceCard): boolean {
  const source = card.voicingMemory?.sourceVoicing;
  return Boolean(source && voicingCompatibility(source, card.chord) === "compatible");
}

export function migratePlaybackChoice(
  card: PlaybackChoiceCard,
  policy: SourceMigrationPolicy,
): ChordVoicingMemory | undefined {
  const memory = card.voicingMemory;
  if (!memory || memory.playbackChoice || !canChooseSource(card)) return memory;
  if (memory.practiceVoicingOverride) return memory;
  if (policy === "KEEP_LEGACY_AND_SUGGEST_SOURCE") return memory;
  if (policy === "EVIDENCE_BASED_MIGRATION" && !memory.sourceVoicing?.userVerified) {
    return memory;
  }
  return { ...memory, playbackChoice: "SOURCE" };
}

/** An explicit user action; protected custom/generated choices retain their intent. */
export function setAllEligibleCardsToSource<T extends PlaybackChoiceCard>(
  cards: readonly T[],
): { cards: T[]; changedCount: number } {
  let changedCount = 0;
  const updated = cards.map((card) => {
    const memory = card.voicingMemory;
    if (!memory || !canChooseSource(card)
      || memory.playbackChoice === "SOURCE"
      || memory.playbackChoice === "CUSTOM"
      || memory.playbackChoice === "GENERATED"
      || (memory.playbackChoice === undefined && memory.practiceVoicingOverride)) return card;
    changedCount += 1;
    return { ...card, voicingMemory: { ...memory, playbackChoice: "SOURCE" as const } };
  });
  return { cards: updated, changedCount };
}
