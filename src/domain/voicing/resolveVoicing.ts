import type { ChordSymbol, ChordVoicingMemory } from "../types";
import type { ChordTimelineItem } from "../types";
import { voiceChordForPreview } from "../chordVoicing";
import { voicingCompatibility } from "./compatibility";
import { VOICING_AUTO_USE_CONFIDENCE } from "./extractionConfig";
import type { ResolvedVoicing, VoicingResolveOptions } from "./types";

export function resolveVoicingForUse(
  chord: ChordSymbol,
  memory: ChordVoicingMemory | undefined,
  generatedFallback: number[],
  options: VoicingResolveOptions = {},
): ResolvedVoicing {
  const practice = memory?.practiceVoicingOverride;
  if (practice && voicingCompatibility(practice, chord) === "compatible") {
    return {
      midiNotes: [...practice.midiNotes],
      origin: "practice-override",
      representation: practice.representation,
    };
  }

  const source = memory?.sourceVoicing;
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

export function resolveTimelineVoicings(
  timeline: readonly ChordTimelineItem[],
): Record<string, readonly number[]> {
  return Object.fromEntries(timeline.flatMap((item) => item.eventId
    ? [[
        item.eventId,
        resolveVoicingForUse(
          item.chord,
          item.voicingMemory,
          voiceChordForPreview(item.chord).notes,
        ).midiNotes,
      ]]
    : []));
}
