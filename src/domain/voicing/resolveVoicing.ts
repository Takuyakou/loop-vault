import type { ChordSymbol, ChordVoicingMemory } from "../types";
import type { ChordTimelineItem } from "../types";
import { voiceChordForPreview } from "../chordVoicing";
import { voiceTextChordForAudition } from "../textChordTones";
import { isUsablePracticeVoicing, voicingCompatibility } from "./compatibility";
import { VOICING_AUTO_USE_CONFIDENCE } from "./extractionConfig";
import type { ResolvedVoicing, VoicingResolveOptions } from "./types";

export function resolveVoicingForUse(
  chord: ChordSymbol,
  memory: ChordVoicingMemory | undefined,
  generatedFallback: number[],
  options: VoicingResolveOptions = {},
): ResolvedVoicing {
  const practice = memory?.practiceVoicingOverride;
  const source = memory?.sourceVoicing;
  if (memory?.playbackChoice === "GENERATED") {
    return { midiNotes: [...generatedFallback], origin: "generated" };
  }
  if (memory?.playbackChoice === "CUSTOM") {
    return practice && isUsablePracticeVoicing(practice, chord)
      ? { midiNotes: [...practice.midiNotes], origin: "practice-override", representation: practice.representation }
      : { midiNotes: [...generatedFallback], origin: "generated" };
  }
  if (memory?.playbackChoice === "SOURCE") {
    return source && voicingCompatibility(source, chord) === "compatible"
      ? { midiNotes: [...source.midiNotes], origin: "source-explicit", representation: source.representation }
      : { midiNotes: [...generatedFallback], origin: "generated" };
  }
  if (practice && isUsablePracticeVoicing(practice, chord)) {
    return {
      midiNotes: [...practice.midiNotes],
      origin: "practice-override",
      representation: practice.representation,
    };
  }

  if (source && voicingCompatibility(source, chord) === "compatible") {
    if (source.userVerified) {
      return {
        midiNotes: [...source.midiNotes],
        origin: "source-verified",
        representation: source.representation,
      };
    }
    const threshold = options.autoUseConfidence ?? VOICING_AUTO_USE_CONFIDENCE;
    if (
      source.representation === "simultaneous-voicing"
      && (source.confidence ?? 0) >= threshold
    ) {
      return {
        midiNotes: [...source.midiNotes],
        origin: "source-auto",
        representation: source.representation,
      };
    }
  }

  return { midiNotes: [...generatedFallback], origin: "generated" };
}

export function resolveTimelineItemVoicing(item: ChordTimelineItem, textDerived = false): ResolvedVoicing {
  return resolveVoicingForUse(
    item.chord,
    item.voicingMemory,
    textDerived ? [...voiceTextChordForAudition(item.chord)] : voiceChordForPreview(item.chord).notes,
  );
}

export interface TimelineVoicingPlaybackPlan {
  timeline: ChordTimelineItem[];
  explicitMidiNotesByEventId: Record<string, readonly number[]>;
}

/**
 * Builds one atomic timeline/voicing plan for playback.
 *
 * Analyzer timelines do not have persisted event ids yet, so the playback-only
 * clones receive deterministic ids. Building the ids and explicit-note map in
 * the same pass prevents a Local HR boundary change from leaving an index-based
 * voicing lookup stale. Generated results are intentionally omitted from the
 * map so the audio driver keeps its existing per-event fallback.
 */
export function createTimelineVoicingPlaybackPlan(
  timeline: readonly ChordTimelineItem[],
  eventIdPrefix = "timeline-preview",
): TimelineVoicingPlaybackPlan {
  const explicitMidiNotesByEventId: Record<string, readonly number[]> = {};
  const playbackTimeline = timeline.map((item, index) => {
    const sourceIdentity = item.eventId ?? `${item.bar}:${item.beat}:${item.durationBeats}`;
    const eventId = `${eventIdPrefix}:${index}:${sourceIdentity}`;
    const resolved = resolveTimelineItemVoicing(item);
    if (resolved.origin !== "generated") {
      explicitMidiNotesByEventId[eventId] = resolved.midiNotes;
    }
    return { ...item, eventId };
  });

  return { timeline: playbackTimeline, explicitMidiNotesByEventId };
}

export function resolveTimelineVoicings(
  timeline: readonly ChordTimelineItem[],
  textDerived = false,
): Record<string, readonly number[]> {
  return Object.fromEntries(timeline.flatMap((item) => item.eventId
    ? [[
        item.eventId,
        resolveTimelineItemVoicing(item, textDerived).midiNotes,
      ]]
    : []));
}
