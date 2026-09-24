/** P7.0-04 evaluation-only Tier 2 truth; never generated from a product prediction. */
export const harmonicTruthVersion = "p7-harmonic-truth-v1" as const;
export interface HarmonicIdentity {
  root: number;
  quality: string;
  bass: number;
  factors: readonly string[];
}
export interface AudibleSignature { pitchClasses: readonly number[]; bassPitchClass: number }
export interface HarmonicGold {
  version: typeof harmonicTruthVersion;
  id: string;
  category: string;
  primaryLabel: string;
  identities: readonly HarmonicIdentity[];
  audible: readonly AudibleSignature[];
  notes: readonly number[];
}
export interface HarmonicCandidate { label: string; identity?: HarmonicIdentity; playedMidi: readonly number[] }
const pc = (note: number): number => ((note % 12) + 12) % 12;
export function audibleSignature(notes: readonly number[]): AudibleSignature {
  if (!notes.length || notes.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) throw new Error("Valid played MIDI notes required.");
  return { pitchClasses: [...new Set(notes.map(pc))].sort((a,b)=>a-b), bassPitchClass:pc(Math.min(...notes)) };
}
export function normalizedIdentity(identity: HarmonicIdentity): string {
  return [pc(identity.root),identity.quality,pc(identity.bass),[...new Set(identity.factors)].sort().join(",")].join("|");
}
const signatureKey = (value: AudibleSignature): string => [...value.pitchClasses].sort((a,b)=>a-b).join(",")+"|"+value.bassPitchClass;
export function evaluateHarmonicCandidate(gold: HarmonicGold, candidate: HarmonicCandidate) {
  const identityAccepted=candidate.identity!==undefined && gold.identities.some((identity)=>normalizedIdentity(identity)===normalizedIdentity(candidate.identity!));
  const playbackEquivalent=gold.audible.some((allowed)=>signatureKey(allowed)===signatureKey(audibleSignature(candidate.playedMidi)));
  const canonicalExact=candidate.label===gold.primaryLabel;
  const primaryIdentity=candidate.identity!==undefined && gold.identities[0]!==undefined
    && normalizedIdentity(candidate.identity)===normalizedIdentity(gold.identities[0]);
  return {
    playbackEquivalent, identityAccepted, canonicalExact,
    namingOnly:playbackEquivalent && primaryIdentity && !canonicalExact,
    rendererOnlyMismatch:identityAccepted && !playbackEquivalent,
    semanticMismatch:!identityAccepted,
  };
}
const identity=(root:number,quality:string,bass:number,factors:readonly string[]=[]):HarmonicIdentity=>({root,quality,bass,factors});
const example=(id:string,category:string,primaryLabel:string,notes:readonly number[],identities:readonly HarmonicIdentity[]):HarmonicGold=>({
  version:harmonicTruthVersion,id,category,primaryLabel,notes,identities,audible:[audibleSignature(notes)],
});
/** Synthetic truth is authored explicitly; these are not inferred from parser or renderer output. */
export const harmonicGoldExamples: readonly HarmonicGold[]=[
  example("equivalent-c6-am7c","multiple-valid-labels","C6",[48,52,55,57],[identity(0,"six",0,["6"]),identity(9,"min7",0,["b3","5","b7"])]),
  example("rootless-c9","rootless","C9",[52,58,62],[identity(0,"dom9",4,["3","b7","9","no-root","no5"])]),
  example("omitted-fifth","omission","Cmaj7(no5)",[48,52,59],[identity(0,"maj7",0,["3","7","no5"])]),
  example("altered-dominant","altered","C7(b9,#11)",[48,52,58,61,66],[identity(0,"dom7",0,["3","b7","b9","#11","no5"])]),
  example("extension-thirteen","extension","C13",[48,52,58,62,69],[identity(0,"dom13",0,["3","b7","9","13","no5"])]),
  example("slash-bass","slash-inversion","Cmaj7/E",[52,55,59,60],[identity(0,"maj7",4,["3","5","7"])]),
];
export function validateHarmonicGold(gold:HarmonicGold):string[]{
  const issues:string[]=[];
  if(gold.version!==harmonicTruthVersion||!gold.id||!gold.category||!gold.primaryLabel) issues.push("metadata");
  if(!gold.identities.length||!gold.audible.length) issues.push("truth-empty");
  if(gold.identities.some((entry)=>!Number.isInteger(entry.root)||entry.root<0||entry.root>11||!Number.isInteger(entry.bass)||entry.bass<0||entry.bass>11||!entry.quality)) issues.push("identity");
  try { const observed=audibleSignature(gold.notes);if(!gold.audible.some((allowed)=>signatureKey(allowed)===signatureKey(observed))) issues.push("observed-not-allowed"); }
  catch {issues.push("notes");}
  return issues;
}
