import type { ChordSymbol, ChordVoicingMemory } from "../types";
import { voicingCompatibility } from "./compatibility";
import { VOICING_AUTO_USE_CONFIDENCE } from "./extractionConfig";

export type VoicingSourceStatus = "source" | "generated" | "review";

export type VoicingSourceReason =
  | "source-ready"
  | "source-missing"
  | "source-stale"
  | "source-invalid"
  | "source-aggregated"
  | "source-low-confidence"
  | "source-non-midi";

export interface VoicingSourceStatusResult {
  status: VoicingSourceStatus;
  reason: VoicingSourceReason;
}

export function voicingSourceStatus(
  chord: ChordSymbol,
  memory: ChordVoicingMemory | undefined,
): VoicingSourceStatusResult {
  const source = memory?.sourceVoicing;
  if (!source) return { status: "generated", reason: "source-missing" };

  const compatibility = voicingCompatibility(source, chord);
  if (compatibility === "stale") {
    return { status: "generated", reason: "source-stale" };
  }
  if (compatibility === "invalid") {
    return { status: "review", reason: "source-invalid" };
  }
  if (source.source !== "midi-extracted") {
    return { status: "review", reason: "source-non-midi" };
  }
  if (source.representation === "aggregated-note-set") {
    return { status: "review", reason: "source-aggregated" };
  }
  if (
    !source.userVerified
    && (source.confidence ?? 0) < VOICING_AUTO_USE_CONFIDENCE
  ) {
    return { status: "review", reason: "source-low-confidence" };
  }
  return { status: "source", reason: "source-ready" };
}

export function timelineVoicingSourceStatus(
  timeline: readonly { chord: ChordSymbol; voicingMemory?: ChordVoicingMemory }[],
): VoicingSourceStatusResult {
  const results = timeline.map((event) =>
    voicingSourceStatus(event.chord, event.voicingMemory));
  const review = results.find((result) => result.status === "review");
  if (review) return review;
  const generated = results.find((result) => result.status === "generated");
  if (generated) return generated;
  return results[0] ?? { status: "generated", reason: "source-missing" };
}
