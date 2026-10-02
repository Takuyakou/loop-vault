import { generateFingeringCandidates, rankCyclicFingerings, type FingeringHand, type ProgressionFingeringEvent } from "../../src/domain/progressionFingering";
import { isValidFingering } from "../../src/voicingPractice/fingeringPreferences";
import { costs } from "./privateAccess";
export const shapes = {
  white: [0, 2, 4, 7, 9], black: [1, 3, 6, 8, 10], cluster: [0, 1, 2, 3, 4],
  wide: [0, 7, 12, 19, 28], inversion: [0, 3, 8, 12, 15], open: [0, 7, 16, 21, 28],
};
export type Shape = keyof typeof shapes;
export interface Case { id: string; hand: FingeringHand; notes: number[][]; bpm: number; ioiBeats: number; shape: string; chords?: ProgressionFingeringEvent["chord"][]; }
export function eventsOf(c: Case): ProgressionFingeringEvent[] {
  // Timing is deliberately passed as extra input data: the product signature has no timing fields.
  return c.notes.map((midiPitches, i) => ({ id: `${c.id}-${i}`, hand: c.hand, midiPitches, chord: c.chords?.[i], bpm: c.bpm, startBeat: i * c.ioiBeats, durationBeats: c.ioiBeats }));
}
export function evaluate(c: Case) {
  const events = eventsOf(c);
  const before = JSON.stringify(events);
  const generated = events.map(generateFingeringCandidates);
  const ranked = rankCyclicFingerings(events);
  const groups = generated.map((g, i) => {
    if (g.status !== "supported") throw new Error(`Unsupported diagnostic fixture ${c.id}/${i}`);
    return g;
  });
  const indexes = ranked.map((r, i) => r.status === "supported"
    ? groups[i]!.candidates.findIndex(candidate => candidate.fingers.join() === r.fingers.join()) : -1);
  const transitions = groups.map((g, i) => {
    const next = (i + 1) % groups.length;
    const beforeFinger = g.candidates[indexes[i]!]!.fingers;
    const afterFinger = groups[next]!.candidates[indexes[next]!]!.fingers;
    const common = g.pitches.flatMap((pitch, p) => {
      const q = groups[next]!.pitches.indexOf(pitch);
      return q < 0 ? [] : [{ pitch, before: beforeFinger[p]!, after: afterFinger[q]!, retained: beforeFinger[p] === afterFinger[q] }];
    });
    return { from: i, to: next, cyclic: next === 0, cost: costs.transitionCost(g, indexes[i]!, groups[next]!, indexes[next]!), common,
      repeated: g.pitches.join() === groups[next]!.pitches.join(),
      sameFingerArray: beforeFinger.join() === afterFinger.join() };
  });
  const candidates = groups.map((g, i) => ({ notes: g.pitches, count: g.candidates.length,
    enumerationBeforeLocalSort: [...g.candidates].sort((a,b) => {
      const aa = c.hand === "left" ? [...a.fingers].reverse() : a.fingers;
      const bb = c.hand === "left" ? [...b.fingers].reverse() : b.fingers;
      for (let j=0;j<aa.length;j++) if (aa[j]!==bb[j]) return aa[j]!-bb[j]!;
      return 0;
    }).map(v=>v.fingers),
    localRanked: g.candidates.map(candidate => ({ fingers: candidate.fingers, score: candidate.localCost,
      prior: costs.priorCost(candidate.fingers, costs.preferredFingers(events[i]!, [...g.pitches]).fingers),
      spacing: costs.spacingCost(g.pitches, candidate.fingers, c.hand), reasons: candidate.reasons })),
    selected: g.candidates[indexes[i]!]!.fingers, selectedIndex: indexes[i],
    validity: isValidFingering(c.hand, g.pitches, g.candidates[indexes[i]!]!.fingers),
    span: g.pitches[g.pitches.length-1]! - g.pitches[0]!,
  }));
  const localScore = groups.reduce((sum,g,i) => sum+g.candidates[indexes[i]!]!.localCost,0);
  return { ...c, ioiMs: c.ioiBeats * 60000 / c.bpm, candidates, transitions, localScore,
    transitionScore: transitions.reduce((s,t)=>s+t.cost,0), totalScore: localScore+transitions.reduce((s,t)=>s+t.cost,0),
    notesUnchanged: before===JSON.stringify(events) };
}
export type Result = ReturnType<typeof evaluate>;
export function namedCases(): Case[] {
  const out: Case[]=[];
  const add=(hand:FingeringHand,id:string,notes:number[][])=>out.push({id:`${hand}-${id}`,hand,notes,bpm:120,ioiBeats:1,shape:id});
  for (const hand of ["left","right"] as const) {
    const base=hand==="left"?48:60;
    for(const [id,seq] of Object.entries({same:[0,0,0,0],stepUp:[0,2,4,5],stepDown:[5,4,2,0],chromatic:[0,1,2,3,4],smallLeap:[0,7],octave:[0,12],alternating:[0,12,0,12]})) add(hand,id,seq.map(n=>[base+n]));
    for(const [id,seq] of Object.entries({common1:[[0,4,7],[0,5,9]],common2:[[0,4,7],[0,4,9]],common0:[[0,4,7],[2,5,9]],repeat:[[0,4,7],[0,4,7]],expand:[[0,2,4],[0,7,16]],contract:[[0,7,16],[0,2,4]],translate:[[0,4,7],[5,9,12]]})) add(hand,id,seq.map(row=>row.map(n=>base+n)));
    for(let n=2;n<=4;n++) {
      add(hand,`1-to-${n}`,[[base],shapes.white.slice(0,n).map(p=>base+p)]);
      add(hand,`${n}-to-1`,[shapes.white.slice(0,n).map(p=>base+p),[base]]);
      const chord=shapes.white.slice(0,n).map(p=>base+p);
      add(hand,`upper-single-to-${n}`,[[chord[chord.length-1]!],chord]);
      add(hand,`${n}-to-upper-single`,[chord,[chord[chord.length-1]!]]);
    }
    // Equal semitone distance while color pairs differ. No color quality claims.
    for(const [id,a,b] of [["WW",0,7],["WB",11,18],["BW",10,17],["BB",1,8]] as const) {
      add(hand,`color-single-${id}`,[[base+a],[base+b]]);
      add(hand,`color-multi-${id}`,[[base+a,base+a+4,base+a+7],[base+b,base+b+4,base+b+7]]);
    }
  }
  return out;
}
export function largeCases(): Case[] {
  const out: Case[]=[];
  for(const hand of ["left","right"] as const) for(let n=1;n<=5;n++) for(const [shape,intervals] of Object.entries(shapes)) for(let root=0;root<12;root++) {
    const base=(hand==="left"?36:60)+root;
    const first=intervals.slice(0,n).map(p=>base+p);
    const shift=shape==="white"?0:shape==="black"?1:shape==="cluster"?2:shape==="wide"?12:5;
    const notes=[first,first.map(p=>p+shift),first.map((p,i)=>i===0?p:p+2),first.map(p=>p+7)];
    for(const ioiBeats of [0.25,1,4]) out.push({id:`${hand}-${n}-${shape}-${root}-ioi${ioiBeats}`,hand,notes,bpm:120,ioiBeats,shape});
  }
  return out;
}
/** Diagnostic hypothetical open-chain DP, using exact product candidates/cost; not a product alternative. */
export function nonCyclic(c: Case) {
  const groups=eventsOf(c).map(generateFingeringCandidates).map(g=>{if(g.status!=="supported")throw Error("fixture");return g;});
  let states=groups[0]!.candidates.map((v,i)=>({cost:v.localCost,indexes:[i]}));
  const compare=(a:typeof states[number],b:typeof states[number])=>a.cost-b.cost || compareIndexes(a.indexes,b.indexes);
  for(let i=1;i<groups.length;i++) states=groups[i]!.candidates.map((v,j)=>states.map(s=>({cost:s.cost+v.localCost+costs.transitionCost(groups[i-1]!,s.indexes[i-1]!,groups[i]!,j),indexes:[...s.indexes,j]})).sort(compare)[0]!);
  const best=states.sort(compare)[0]!;
  return {...best,selected:best.indexes.map((v,i)=>groups[i]!.candidates[v]!.fingers)};
}
function compareIndexes(a:readonly number[],b:readonly number[]){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]!-b[i]!;return 0;}
