import { isKnownProgressionTagId } from "../progressionClassification/taxonomy";
import type { SavedProgressionBlock } from "../types";
import type { AdvisorRequest } from "./types";

export function buildAdvisorRequest(
  block: SavedProgressionBlock,
  options: { title?: string; key?: string; bpm?: number; instruction?: string; tagIds?: readonly string[] } = {},
): AdvisorRequest {
  const events = block.chords.map((item) => ({ bar: item.bar, startBeat: item.beat, durationBeats: item.durationBeats, chord: item.chord.label }));
  const bars = events.length ? Math.max(...events.map((event) => event.bar)) - Math.min(...events.map((event) => event.bar)) + 1 : 1;
  const manualTagIds = [...new Set(options.tagIds ?? block.tags)].filter(isKnownProgressionTagId);
  return {
    schemaVersion: 1,
    progression: {
      ...(options.title ? { title: options.title } : {}),
      ...(options.key ? { key: options.key } : {}),
      ...(options.bpm ? { bpm: options.bpm } : {}),
      bars,
      timeSignature: block.timeSignature ?? "4/4",
      events,
      manualTagIds,
      derivedTagIds: [],
      ...(block.origin ? { origin: block.origin } : {}),
    },
    ...(options.instruction?.trim() ? { instruction: options.instruction.trim() } : {}),
    output: { proposalCount: 3, barsPerProposal: 8, strategies: ["close_development", "contrast", "experimental"] },
  };
}

export function advisorRequestFingerprint(request: AdvisorRequest): string {
  return JSON.stringify(request.progression.events.map((event) => [event.bar, event.startBeat, event.durationBeats, event.chord]));
}
