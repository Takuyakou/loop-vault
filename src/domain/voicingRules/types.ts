export type VoicingRuleSource = "lesson-rules" | "source-midi" | "custom";

export type VoicingStudyCategory = "teacher" | "core" | "color" | "open";

export type VoicingRuleFamily =
  | "teacher-style"
  | "family-core"
  | "family-color"
  | "open-spread"
  | "teacher-open"
  | "bass-guide-tones"
  | "slash-bass-upper-structure"
  | "characteristic-core"
  | "dominant-upper-structure"
  | "two-hand-open"
  | "drop-2";

export type VoicingCoverage =
  | "literal"
  | "performance-reduction"
  | "creative-enrichment";

export type VoicingBassContext = "self-played" | "external-bass" | "none";

export type VoicingTopContext = "normal-voicing-top" | "fixed-melody" | "top-candidate";

export interface VoicingRuleContext {
  readonly bass: VoicingBassContext;
  readonly top: VoicingTopContext;
  readonly fixedMelodyMidiNote?: number;
}

export type VoicingRuleProvenanceKind =
  | "teacher-derived-generalized"
  | "teacher-evidence"
  | "external-theory"
  | "analysis-proposal"
  | "legacy-product-rule";

export interface VoicingRuleProvenance {
  readonly kind: VoicingRuleProvenanceKind;
  readonly sourceIds: readonly string[];
  readonly note: string;
}

export interface VoicingRuleIdentity {
  readonly ruleId: string;
  readonly family: VoicingRuleFamily;
  readonly variantId: string;
}

export interface VoicingRuleExplanation {
  readonly source: VoicingRuleSource;
  readonly study?: VoicingStudyCategory;
  readonly identity?: VoicingRuleIdentity;
  readonly coverage?: VoicingCoverage;
  readonly context?: VoicingRuleContext;
  readonly provenance?: VoicingRuleProvenance;
  readonly omittedDegrees: readonly string[];
  readonly addedDegrees: readonly string[];
  readonly topRole?: VoicingTopContext;
  readonly candidateIndex?: number;
  readonly candidateCount?: number;
}
