import { PROGRESSION_TAXONOMY_VERSION, getProgressionTagDefinition } from "./taxonomy";
import type {
  DerivedProgressionTag,
  ProgressionClassificationInput,
  ProgressionSourceKind,
} from "./types";

export function deriveSourceTags(
  input: ProgressionClassificationInput,
): DerivedProgressionTag[] {
  const kind = sourceKind(input);
  const tagId = `source.${kind}`;
  const definition = getProgressionTagDefinition(tagId);
  if (!definition) return [];
  return [{
    tagId,
    category: "source",
    source: "derived",
    confidence: 1,
    taxonomyVersion: PROGRESSION_TAXONOMY_VERSION,
    reasons: [sourceReason(kind)],
  }];
}

function sourceKind(input: ProgressionClassificationInput): ProgressionSourceKind {
  if (input.sourceMetadata?.kind) return input.sourceMetadata.kind;
  if (input.block.origin === "live-midi") return "live-midi";
  if (input.block.analyzerVersion.toLocaleLowerCase().includes("chord-drip")) return "chord-drip";
  if (input.block.sourceFileName || input.block.sourceFingerprint || input.block.sourceAssetId) {
    return "midi-capture";
  }
  return "manual";
}

function sourceReason(kind: ProgressionSourceKind): string {
  const reasons: Record<ProgressionSourceKind, string> = {
    "midi-capture": "The saved block has MIDI capture source metadata.",
    "live-midi": "The saved block origin is Live MIDI.",
    "chord-drip": "Chord Drip is explicitly recorded as the source.",
    manual: "No external capture source is recorded.",
  };
  return reasons[kind];
}
