import { isKnownProgressionTagId } from "../progressionClassification/taxonomy";
import type { SavedProgressionBlock } from "../types";
import type { AdvisorReferenceContext, AdvisorRequest } from "./types";

export function buildAdvisorRequest(
  block: SavedProgressionBlock,
  options: { title?: string; key?: string; bpm?: number; instruction?: string; tagIds?: readonly string[]; derivedTagIds?: readonly string[]; context?: readonly AdvisorReferenceContext[] } = {},
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
      derivedTagIds: [...new Set(options.derivedTagIds ?? [])].filter(isKnownProgressionTagId),
      ...(block.origin ? { origin: block.origin } : {}),
    },
    ...(options.instruction?.trim() ? { instruction: options.instruction.trim() } : {}),
    output: { proposalCount: 3, barsPerProposal: 8, strategies: ["close_development", "contrast", "experimental"] },
    ...(options.context?.length ? { context: options.context.slice(0, 3).map((entry) => ({ ...entry, romanNumerals: [...entry.romanNumerals], chordLabels: [...entry.chordLabels], tagIds: [...entry.tagIds] })) } : {}),
  };
}

export function advisorRequestFingerprint(request: AdvisorRequest): string {
  return JSON.stringify(request.progression.events.map((event) => [event.bar, event.startBeat, event.durationBeats, event.chord]));
}
