/** Whole-feature requirements, including the entry snapshot and identity boundary. */
export const TEXT_CHORD_CONSUMERS = {
  "vault-save": { requires: "complete symbol, label, exact notes and provenance", altered: true },
  "chord-dojo": { requires: "complete lesson symbol and registered exact notes", altered: true },
  "voicing-memory": { requires: "classified identity, exact notes and provenance", altered: true },
  "text-audition": { requires: "complete symbol and validated recommended notes", altered: true },
  "chord-context": { requires: "complete Context snapshot, identity and generated harmony", altered: false },
  "root-motion": { requires: "complete Context entry snapshot, identity and root path", altered: false },
  "bass-practice": { requires: "complete Context entry snapshot, identity and bass path", altered: false },
  // P25-08 K9-5: the K shapes make altered dominants (G7alt).
  "generated-loop": { requires: "complete symbol, style rules, identity and generated harmony", altered: true },
} as const;

/** Existing symbols retain existing support. New classifications default to unavailable. */
export function supportsTextChord(consumer: string, chord: unknown): boolean {
  if (!chord || typeof chord !== "object") return false;
  const classification = (chord as { readonly altered?: unknown }).altered;
  if (classification === undefined) return true;
  if (classification !== true) return false;
  return Object.prototype.hasOwnProperty.call(TEXT_CHORD_CONSUMERS, consumer)
    && TEXT_CHORD_CONSUMERS[consumer as keyof typeof TEXT_CHORD_CONSUMERS].altered;
}

/**
 * P25-08 K9-5: today's generators (the 基本 rules, the old shapes, the text close voicing) keep not making an
 * altered dominant; only the K shapes make one. A 基本 X7alt card is filled by K12.
 */
export function supportsLegacyGeneratedChord(chord: unknown): boolean {
  return supportsTextChord("generated-loop", chord) && (chord as { readonly altered?: unknown }).altered !== true;
}
