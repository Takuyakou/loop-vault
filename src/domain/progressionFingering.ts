import type { ProgressionPracticeChord, ProgressionVoicingSelection } from "./progressionVoicingPractice";

export type FingeringHand = "right" | "left";
export type FingerNumber = 1 | 2 | 3 | 4 | 5;
export type FingeringReasonCode = "guide-triad-root" | "guide-triad-first" | "guide-triad-second" | "guide-two-note" | "guide-four-note" | "guide-left-shell" | "generic-shape";
export interface FingeringCandidate { readonly fingers: readonly FingerNumber[]; readonly localCost: number; readonly reasons: readonly FingeringReasonCode[] }
export interface FingeringInput { readonly hand: FingeringHand; readonly midiPitches: readonly number[]; readonly chord?: ProgressionPracticeChord; readonly family?: ProgressionVoicingSelection }
export type FingeringCandidateResult = { readonly status: "supported"; readonly pitches: readonly number[]; readonly signature: string; readonly candidates: readonly FingeringCandidate[] } | { readonly status: "unavailable"; readonly reason: "invalid-pitches" | "too-many-keys" | "no-keys" };
export interface ProgressionFingeringEvent extends FingeringInput { readonly id: string }
export interface RankedFingering { readonly id: string; readonly status: "supported"; readonly signature: string; readonly pitches: readonly number[]; readonly fingers: readonly FingerNumber[] }
export interface UnavailableFingering { readonly id: string; readonly status: "unavailable" }

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

type SupportedCandidates = Extract<FingeringCandidateResult, { status: "supported" }>;
interface RankingState { readonly cost: number; readonly indexes: readonly number[] }

export function rankCyclicFingerings(
  events: readonly ProgressionFingeringEvent[],
): readonly (RankedFingering | UnavailableFingering)[] {
  if (!events.length) return [];

  const generated = events.map(generateFingeringCandidates);
  if (generated.some((result) => result.status !== "supported")) {
    return events.map((event, index) => {
      const result = generated[index]!;
      return result.status === "supported"
        ? toRankedFingering(event.id, result, 0)
        : { id: event.id, status: "unavailable" };
    });
  }

  const groups = generated as SupportedCandidates[];
  let best: RankingState | undefined;

  for (let firstIndex = 0; firstIndex < groups[0]!.candidates.length; firstIndex += 1) {
    let states: RankingState[] = [{
      cost: groups[0]!.candidates[firstIndex]!.localCost,
      indexes: [firstIndex],
    }];

    for (let eventIndex = 1; eventIndex < groups.length; eventIndex += 1) {
      const previous = groups[eventIndex - 1]!;
      const current = groups[eventIndex]!;
      states = current.candidates.map((candidate, candidateIndex) => {
        const options = states.map((state) => ({
          cost: state.cost
            + candidate.localCost
            + transitionCost(previous, state.indexes[eventIndex - 1]!, current, candidateIndex),
          indexes: [...state.indexes, candidateIndex],
        }));
        options.sort(compareStates);
        return options[0]!;
      });
    }

    const last = groups[groups.length - 1]!;
    const completed = states.map((state) => ({
      cost: state.cost
        + transitionCost(last, state.indexes[state.indexes.length - 1]!, groups[0]!, firstIndex),
      indexes: state.indexes,
    }));
    completed.sort(compareStates);
    const candidate = completed[0]!;
    if (!best || compareStates(candidate, best) < 0) best = candidate;
  }

  return events.map((event, index) =>
    toRankedFingering(event.id, groups[index]!, best!.indexes[index]!),
  );
}

function toRankedFingering(
  id: string,
  group: SupportedCandidates,
  candidateIndex: number,
): RankedFingering {
  return {
    id,
    status: "supported",
    signature: group.signature,
    pitches: group.pitches,
    fingers: group.candidates[candidateIndex]!.fingers,
  };
}

function transitionCost(
  previous: SupportedCandidates,
  previousIndex: number,
  current: SupportedCandidates,
  currentIndex: number,
): number {
  const previousCandidate = previous.candidates[previousIndex]!;
  const currentCandidate = current.candidates[currentIndex]!;
  const previousByPitch = new Map(previous.pitches.map((pitch, index) => [pitch, previousCandidate.fingers[index]!]));
  const previousByFinger = new Map(previousCandidate.fingers.map((finger, index) => [finger, previous.pitches[index]!]));
  const currentFingers = new Set(currentCandidate.fingers);

  let cost = 0;
  current.pitches.forEach((pitch, index) => {
    const finger = currentCandidate.fingers[index]!;
    const priorFinger = previousByPitch.get(pitch);
    if (priorFinger !== undefined) {
      cost += priorFinger === finger ? 0 : 0.75;
      return;
    }
    const priorPitch = previousByFinger.get(finger);
    cost += priorPitch === undefined ? 0.5 : Math.min(2, Math.abs(pitch - priorPitch) * 0.125);
  });
  previousCandidate.fingers.forEach((finger) => {
    if (!currentFingers.has(finger)) cost += 0.5;
  });
  return cost;
}

function compareStates(a: RankingState, b: RankingState): number {
  return a.cost - b.cost || compareArrays(a.indexes, b.indexes);
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
