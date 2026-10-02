import type { ProgressionPracticeChord, ProgressionVoicingSelection } from "./progressionVoicingPractice";

export type FingeringHand = "right" | "left";
export type FingerNumber = 1 | 2 | 3 | 4 | 5;
export type FingeringReasonCode = "guide-triad-root" | "guide-triad-first" | "guide-triad-second" | "guide-two-note" | "guide-four-note" | "guide-left-shell" | "generic-shape";
export interface FingeringCandidate { readonly fingers: readonly FingerNumber[]; readonly localCost: number; readonly reasons: readonly FingeringReasonCode[] }
export interface FingeringInput { readonly hand: FingeringHand; readonly midiPitches: readonly number[]; readonly chord?: ProgressionPracticeChord; readonly family?: ProgressionVoicingSelection }
export type FingeringCandidateResult = { readonly status: "supported"; readonly pitches: readonly number[]; readonly signature: string; readonly candidates: readonly FingeringCandidate[] } | { readonly status: "unavailable"; readonly reason: "invalid-pitches" | "too-many-keys" | "no-keys" };
export interface ProgressionFingeringEvent extends FingeringInput {
  readonly id: string;
  readonly startSeconds?: number;
  readonly durationSeconds?: number;
  /** A missing voicing is a barrier; an empty hand in a valid voicing is not. */
  readonly unresolved?: boolean;
}
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

export type SupportedCandidates = Extract<FingeringCandidateResult, { status: "supported" }>;
export interface FingeringAnchor { readonly signature: string; readonly fingers: readonly FingerNumber[] }
export interface FingeringCostModel {
  local(event: ProgressionFingeringEvent, group: SupportedCandidates, index: number): number;
  transition(previous: SupportedCandidates, previousIndex: number, current: SupportedCandidates, currentIndex: number, seconds: number): number;
}
export interface FingeringRankingOptions {
  readonly anchors?: ReadonlyMap<string, FingeringAnchor>;
  readonly costModel?: FingeringCostModel;
  readonly loopDurationSeconds?: number;
  readonly cyclic?: boolean;
}
interface RankingState { readonly cost: number; readonly prior: number; readonly indexes: readonly number[] }

/** Unresolved barriers isolate open segments. Empty hands preserve the elapsed onset interval. */
export function rankCyclicFingerings(
  events: readonly ProgressionFingeringEvent[],
  options: FingeringRankingOptions = {},
): readonly (RankedFingering | UnavailableFingering)[] {
  const generated = events.map(generateFingeringCandidates);
  const results: (RankedFingering | UnavailableFingering)[] = events.map(event => ({ id: event.id, status: "unavailable" }));
  const model = options.costModel ?? {
    local: (_event: ProgressionFingeringEvent, group: SupportedCandidates, index: number) => group.candidates[index]!.localCost,
    transition: transitionCost,
  };
  const barrier = (i: number) => events[i]!.unresolved
    || (generated[i]!.status === "unavailable" && generated[i]!.reason !== "no-keys");
  const complete = !events.some((_event, i) => barrier(i));
  const segments: number[][] = [[]];
  events.forEach((_event, i) => {
    if (barrier(i)) { if (segments[segments.length - 1]!.length) segments.push([]); }
    else if (generated[i]!.status === "supported") segments[segments.length - 1]!.push(i);
  });
  for (const indices of segments) {
    if (!indices.length) continue;
    const groups = indices.map(i => generated[i] as SupportedCandidates);
    const choices = groups.map((group, i) => {
      const anchor = options.anchors?.get(events[indices[i]!]!.id);
      const match = anchor?.signature === group.signature
        ? group.candidates.findIndex(candidate => compareArrays(candidate.fingers, anchor.fingers) === 0 && candidate.fingers.length === anchor.fingers.length) : -1;
      return match >= 0 ? [match] : group.candidates.map((_candidate, index) => index);
    });
    const cyclic = complete && options.cyclic !== false;
    const duration = options.loopDurationSeconds ?? Math.max(0, ...events.map(event => (event.startSeconds ?? 0) + (event.durationSeconds ?? 0)));
    const seconds = (from: number, to: number, wrap: boolean) => {
      const previous = events[indices[from]!]!;
      const next = events[indices[to]!]!;
      const value = (next.startSeconds ?? to) - (previous.startSeconds ?? from) + (wrap ? duration : 0);
      return value > 0 && Number.isFinite(value) ? value : previous.durationSeconds ?? 1;
    };
    const local = (i: number, index: number) => ({
      cost: model.local(events[indices[i]!]!, groups[i]!, index),
      prior: preferredFingeringDistance(events[indices[i]!]!, groups[i]!.candidates[index]!.fingers),
    });
    let best: RankingState | undefined;
    for (const first of choices[0]!) {
      const initial = local(0, first);
      let states: RankingState[] = [{ ...initial, indexes: [first] }];
      for (let i = 1; i < groups.length; i++) {
        states = choices[i]!.map(index => {
          const eventCost = local(i, index);
          return states.map(state => ({
            cost: state.cost + eventCost.cost + model.transition(groups[i - 1]!, state.indexes[i - 1]!, groups[i]!, index, seconds(i - 1, i, false)),
            prior: state.prior + eventCost.prior,
            indexes: [...state.indexes, index],
          })).sort(compareStates)[0]!;
        });
      }
      const candidate = states.map(state => ({ ...state,
        cost: state.cost + (cyclic ? model.transition(groups[groups.length - 1]!, state.indexes[state.indexes.length - 1]!, groups[0]!, first, seconds(groups.length - 1, 0, true)) : 0),
      })).sort(compareStates)[0]!;
      if (!best || compareStates(candidate, best) < 0) best = candidate;
    }
    indices.forEach((eventIndex, i) => { results[eventIndex] = toRankedFingering(events[eventIndex]!.id, groups[i]!, best!.indexes[i]!); });
  }
  return results;
}

/** Uses the existing preferred rule without changing candidate generation or its local score. */
export function preferredFingeringDistance(input: FingeringInput, fingers: readonly FingerNumber[]): number {
  const pitches = normalizePitches(input.midiPitches);
  return pitches ? priorCost(fingers, preferredFingers(input, pitches).fingers) / 10 : 0;
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
  return a.cost - b.cost || a.prior - b.prior || compareArrays(a.indexes, b.indexes);
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
