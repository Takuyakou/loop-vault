import type { ProgressionPracticeChord, ProgressionVoicingSelection } from "./progressionVoicingPractice";

export type FingeringHand = "right" | "left";
export type FingerNumber = 1 | 2 | 3 | 4 | 5;
export type FingeringReasonCode = "guide-triad-root" | "guide-triad-first" | "guide-triad-second" | "guide-two-note" | "guide-four-note" | "guide-left-shell" | "generic-shape";
export interface FingeringCandidate { readonly fingers: readonly FingerNumber[]; readonly localCost: number; readonly reasons: readonly FingeringReasonCode[] }
export interface FingeringInput { readonly hand: FingeringHand; readonly midiPitches: readonly number[]; readonly chord?: ProgressionPracticeChord; readonly family?: ProgressionVoicingSelection }
export type FingeringCandidateResult = { readonly status: "supported"; readonly pitches: readonly number[]; readonly signature: string; readonly candidates: readonly FingeringCandidate[] } | { readonly status: "unavailable"; readonly reason: "invalid-pitches" | "too-many-keys" | "no-keys" };

export function physicalVoicingSignature(hand: FingeringHand, pitches: readonly number[]): string | undefined {
  const normalized = normalizePitches(pitches);
  return normalized ? `${hand === "right" ? "R" : "L"}:${normalized.join(",")}` : undefined;
}

export function generateFingeringCandidates(input: FingeringInput): FingeringCandidateResult {
  const pitches = normalizePitches(input.midiPitches);
  if (!pitches) return { status: "unavailable", reason: "invalid-pitches" };
  if (!pitches.length) return { status: "unavailable", reason: "no-keys" };
  if (pitches.length > 5) return { status: "unavailable", reason: "too-many-keys" };
  const preferred = preferredFingers(input, pitches);
  const reason = preferred.reason;
  const candidates = combinations([1, 2, 3, 4, 5], pitches.length).map((value) => {
    const fingers = (input.hand === "right" ? value : [...value].reverse()) as FingerNumber[];
    return { fingers: Object.freeze(fingers), localCost: priorCost(fingers, preferred.fingers) + spacingCost(pitches, fingers, input.hand), reasons: Object.freeze([reason]) };
  }).sort((a, b) => a.localCost - b.localCost || compareArrays(a.fingers, b.fingers));
  return { status: "supported", pitches: Object.freeze(pitches), signature: physicalVoicingSignature(input.hand, pitches)!, candidates: Object.freeze(candidates) };
}

function normalizePitches(source: readonly number[]): number[] | undefined {
  if (!Array.isArray(source) || source.some((n) => !Number.isInteger(n) || n < 0 || n > 127)) return undefined;
  return [...new Set(source)].sort((a, b) => a - b);
}
function preferredFingers(input: FingeringInput, pitches: number[]): { fingers: FingerNumber[]; reason: FingeringReasonCode } {
  const n = pitches.length;
  const right = input.hand === "right";
  if (n === 2) return { fingers: right ? [1,5] : [5,1], reason: "guide-two-note" };
  if (n === 4) return { fingers: right ? [1,2,3,5] : [5,3,2,1], reason: "guide-four-note" };
  if (n === 3) {
    const inversion = triadInversion(input.chord, pitches);
    if (inversion === 0) return { fingers: right ? [1,3,5] : [5,3,1], reason: "guide-triad-root" };
    if (inversion === 1) return { fingers: right ? [1,2,5] : [5,3,1], reason: "guide-triad-first" };
    if (inversion === 2) return { fingers: right ? [1,3,5] : [5,2,1], reason: "guide-triad-second" };
    return { fingers: right ? [1,3,5] : [5,3,1], reason: right ? "generic-shape" : "guide-left-shell" };
  }
  return { fingers: right ? ([1,2,3,4,5].slice(0,n) as FingerNumber[]) : ([5,4,3,2,1].slice(0,n) as FingerNumber[]), reason: "generic-shape" };
}
function triadInversion(chord: ProgressionPracticeChord | undefined, pitches: number[]): 0|1|2|undefined {
  if (!chord || pitches.length !== 3 || (chord.quality !== "maj" && chord.quality !== "min")) return undefined;
  const third = chord.quality === "maj" ? 4 : 3; const relative = pitches.map(n => (n - chord.root + 120) % 12);
  if (new Set(relative).size !== 3 || ![0,third,7].every(n => relative.includes(n))) return undefined;
  return relative[0] === 0 ? 0 : relative[0] === third ? 1 : 2;
}
function priorCost(a: readonly number[], b: readonly number[]): number { return a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]!),0)*10; }
function spacingCost(pitches: readonly number[], fingers: readonly number[], hand: FingeringHand): number {
  if (pitches.length < 2) return 0; const span=pitches[pitches.length-1]!-pitches[0]!; const ordered=hand==="right"?fingers:[...fingers].reverse(); const fspan=ordered[ordered.length-1]!-ordered[0]!;
  return pitches.reduce((sum,n,i)=>sum+Math.abs((n-pitches[0]!)/Math.max(1,span)-(ordered[i]!-ordered[0]!)/Math.max(1,fspan)),0);
}
function combinations(values: FingerNumber[], count: number): FingerNumber[][] { const out: FingerNumber[][]=[]; const visit=(start:number,picked:FingerNumber[])=>{ if(picked.length===count){out.push(picked);return;} for(let i=start;i<=values.length-(count-picked.length);i++)visit(i+1,[...picked,values[i]!]);}; visit(0,[]); return out; }
function compareArrays(a: readonly number[], b: readonly number[]): number { for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]!-b[i]!;} return 0; }
