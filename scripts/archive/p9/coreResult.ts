/** P9.0 research-only interface; not a Vault or Product type. */
export interface SourceNoteTruth {
  readonly noteId: string;
  readonly midiNote: number;
  readonly onsetTick: number;
  readonly offsetTick: number;
  readonly track: number;
  readonly channel: number;
  readonly velocity: number;
}
export interface SourceTruth {
  readonly sourceSha256: string;
  readonly ppq: number;
  readonly meter: readonly [number, number];
  readonly tempo: readonly { tick: number; bpm: number; origin: "SMF_META" | "SMF_DEFAULT" }[];
  readonly notes: readonly SourceNoteTruth[];
}
export interface HarmonicIdentity {
  readonly root: number | null;
  readonly observedBass: number | null;
  readonly quality: string | null;
  readonly extensions: readonly string[];
  readonly alterations: readonly string[];
  readonly omissions: readonly string[];
  readonly state: "KNOWN" | "PARTIAL" | "UNKNOWN";
}
export interface HarmonicInterpretation {
  readonly startTick: number;
  readonly endTick: number;
  readonly identity: HarmonicIdentity;
  readonly sourceNoteIds: readonly string[];
}
export interface ExcludedNoteEvidence {
  readonly noteId: string;
  readonly midiNote: number;
  readonly sourceTick: number;
  readonly durationTick: number;
  readonly roleReason: string;
  readonly confidence: number;
  readonly restorable: true;
}
export interface BoundaryCandidate {
  readonly tick: number;
  readonly type: "HARMONIC" | "VOICING" | "NOTE_EVENT";
  readonly confidence: number;
  readonly evidenceNoteIds: readonly string[];
}
export interface IdentityCandidate {
  readonly identity: HarmonicIdentity;
  readonly score: number;
  readonly evidenceNoteIds: readonly string[];
}
export interface AttackEvidence {
  readonly noteId: string;
  readonly tick: number;
  readonly restrikeOfNoteId?: string;
}
export interface ReviewReason {
  readonly code: string;
  readonly sourceNoteIds: readonly string[];
  readonly confidence: number;
  readonly suggestedAction: "split" | "merge" | "noteAdd" | "noteRemove" | "identity" | "inspect";
}
export interface CoreAnalysisResult {
  readonly schemaVersion: 1;
  readonly sourceTruth: SourceTruth;
  readonly harmonicInterpretation: readonly HarmonicInterpretation[];
  readonly excludedNotes: readonly ExcludedNoteEvidence[];
  readonly boundaryCandidates: readonly BoundaryCandidate[];
  readonly topKIdentities: readonly IdentityCandidate[];
  readonly uncertainty: { readonly confidence: number; readonly margin: number | null; readonly unknown: boolean };
  readonly attacks: readonly AttackEvidence[];
  readonly reviewReasons: readonly ReviewReason[];
}
export interface CorrectionVector {
  readonly split: number;
  readonly merge: number;
  readonly noteAdd: number;
  readonly noteRemove: number;
  readonly rootFix: number;
  readonly bassFix: number;
  readonly qualityFix: number;
  readonly tensionFix: number;
}
