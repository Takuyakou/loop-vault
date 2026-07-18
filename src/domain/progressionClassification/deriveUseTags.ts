import { PROGRESSION_TAXONOMY_VERSION, getProgressionTagDefinition } from "./taxonomy";
import type { DerivedProgressionTag, ProgressionClassificationInput } from "./types";

const candidateLabelTags: Record<string, string> = {
  "intro-like": "use.intro",
  intro: "use.intro",
  main: "use.main",
  turnaround: "use.turnaround",
  variation: "use.variation",
  loop: "use.loop",
  vamp: "use.vamp",
};

export function deriveUseTags(input: ProgressionClassificationInput): DerivedProgressionTag[] {
  const reasons = new Map<string, string[]>();
  addReason(reasons, "use.loop", "Saved progression blocks are reusable loops.");
  if (input.block.startBar === 1) {
    addReason(reasons, "use.intro", "The captured block starts at bar 1.");
  }
  if (input.block.lengthBars === 4) {
    addReason(reasons, "use.turnaround", "The captured block is four bars long.");
  }
  for (const label of input.sourceMetadata?.candidateLabels ?? []) {
    const tagId = candidateLabelTags[label.toLocaleLowerCase()];
    if (tagId) addReason(reasons, tagId, `The source candidate label is ${label}.`);
  }

  return [...reasons.entries()].flatMap(([tagId, tagReasons]) => {
    const definition = getProgressionTagDefinition(tagId);
    return definition ? [{
      tagId,
      category: definition.category,
      source: "derived" as const,
      taxonomyVersion: PROGRESSION_TAXONOMY_VERSION,
      reasons: tagReasons,
    }] : [];
  });
}

function addReason(reasons: Map<string, string[]>, tagId: string, reason: string) {
  reasons.set(tagId, [...(reasons.get(tagId) ?? []), reason]);
}
