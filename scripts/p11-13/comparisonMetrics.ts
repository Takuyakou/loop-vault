import { generateFingeringCandidates, preferredFingeringDistance, rankCyclicFingerings, type FingeringAnchor, type ProgressionFingeringEvent } from "../../src/domain/progressionFingering";
import { handPositionProxy, rankHandPositionFingerings, timePressure, type HandPositionPolicy } from "../../src/domain/handPositionFingering";
import { isValidFingering } from "../../src/voicingPractice/fingeringPreferences";
import type { Case } from "../p11-12/fixtures";
export type Arm = "CURRENT" | HandPositionPolicy;
export function inputs(c: Case): ProgressionFingeringEvent[] {
  const time = c.ioiBeats * 60 / c.bpm;
  return c.notes.map((midiPitches, i) => ({ id: `${c.id}-${i}`, hand: c.hand, midiPitches, chord: c.chords?.[i], startSeconds: i*time, durationSeconds: time }));
}
export function measure(c: Case, arm: Arm, anchors?: ReadonlyMap<string,FingeringAnchor>) {
  const events = inputs(c); const source = JSON.stringify(events);
  const groups = events.map(generateFingeringCandidates);
  const options = { anchors, loopDurationSeconds: c.notes.length*c.ioiBeats*60/c.bpm };
  const solve = () => arm === "CURRENT" ? rankCyclicFingerings(events,options) : rankHandPositionFingerings(events,arm,options);
  const result = solve();
  const notesUnchanged = source === JSON.stringify(events);
  const candidatesUnchanged = JSON.stringify(groups) === JSON.stringify(events.map(generateFingeringCandidates));
  const deterministic = JSON.stringify(result) === JSON.stringify(solve());
  const selected = result.map(r=>r.status==="supported"?[...r.fingers]:[]);
  const positions = result.map(r=>r.status==="supported"?handPositionProxy(c.hand,r.pitches,r.fingers):null);
  const edges: { shift:number; common:number; reassigned:number; repeatChanged:boolean; wrap:boolean }[] = [];
  for(let i=0;i<result.length;i++) {
    const j=(i+1)%result.length; const a=result[i]!,b=result[j]!;
    if(a.status!=="supported"||b.status!=="supported")continue;
    const common = a.pitches.filter(p=>b.pitches.includes(p));
    edges.push({shift:Math.abs(positions[j]!-positions[i]!),common:common.length,
      reassigned:common.filter(p=>a.fingers[a.pitches.indexOf(p)]!==b.fingers[b.pitches.indexOf(p)]).length,
      repeatChanged:a.pitches.join()===b.pitches.join() && a.fingers.join()!==b.fingers.join(),wrap:j===0});
  }
  const preferred = result.reduce((s,r,i)=>s+(r.status==="supported"?preferredFingeringDistance(events[i]!,r.fingers):0),0);
  const shifts=edges.map(e=>e.shift);
  return { id:c.id, hand:c.hand, notes:c.notes, ioiSeconds:c.ioiBeats*60/c.bpm, selected, positions, preferred,
    shifts, movement:shifts.reduce((s,v)=>s+v,0), wrap:edges.find(e=>e.wrap)?.shift??0,
    common:edges.reduce((s,e)=>s+e.common,0), reassigned:edges.reduce((s,e)=>s+e.reassigned,0),
    repeatedChanged:edges.filter(e=>e.repeatChanged).length,
    solverFailure:result.filter((r,i)=>r.status!=="supported"&&groups[i]!.status==="supported").length,
    candidateEmpty:groups.filter(g=>g.status!=="supported").length,
    structuralFailure:result.filter(r=>r.status==="supported"&&!isValidFingering(c.hand,r.pitches,r.fingers)).length,
    deterministic, notesUnchanged, candidatesUnchanged,
    anchorTotal: anchors?.size??0,
    anchorRetained:result.filter(r=>r.status==="supported"&&anchors?.get(r.id)?.fingers.join()===r.fingers.join()).length,
    extreme:result.filter(r=>r.status==="supported"&&r.pitches.length===1&&c.hand==="left"&&r.fingers[0]!<=2).length,
    single:result.filter(r=>r.status==="supported"&&r.pitches.length===1).length,
  };
}
export function aggregate(rows: ReturnType<typeof measure>[]) {
  const sum=(key:"movement"|"wrap"|"common"|"reassigned"|"repeatedChanged"|"solverFailure"|"candidateEmpty"|"structuralFailure"|"extreme"|"single"|"anchorTotal"|"anchorRetained")=>rows.reduce((s,r)=>s+r[key],0);
  const shifts=rows.flatMap(r=>r.shifts).sort((a,b)=>a-b);
  return {cases:rows.length,events:rows.reduce((s,r)=>s+r.notes.length,0),movement:sum("movement"),shiftMedian:shifts[Math.floor(shifts.length/2)],shiftP95:shifts[Math.floor(shifts.length*0.95)],wrap:sum("wrap"),
    common:sum("common"),reassigned:sum("reassigned"),repeatedChanged:sum("repeatedChanged"),solverFailure:sum("solverFailure"),candidateEmpty:sum("candidateEmpty"),structuralFailure:sum("structuralFailure"),
    deterministic:rows.filter(r=>r.deterministic).length,notesUnchanged:rows.filter(r=>r.notesUnchanged).length,candidatesUnchanged:rows.filter(r=>r.candidatesUnchanged).length,
    leftL1L2:sum("extreme"),singleEvents:sum("single"),anchorTotal:sum("anchorTotal"),anchorRetained:sum("anchorRetained")};
}
export function matchedTime(arm:Arm) {
  const base:Case={id:"time-property",hand:"left",notes:[[48],[50],[52],[53]],bpm:120,ioiBeats:1,shape:"step"};
  const rows=[0.03125,0.0625,0.125,0.25,0.5,1,2,4,8,16].map(seconds=>measure({...base,ioiBeats:seconds*2},arm));
  return { rows, changes:rows.slice(1).filter((r,i)=>JSON.stringify(r.selected)!==JSON.stringify(rows[i]!.selected)).length,
    direction:rows.slice(1).every((r,i)=>r.preferred<=rows[i]!.preferred+1e-9&&r.movement>=rows[i]!.movement-1e-9)};
}
export function contextSensitivity(arm:Arm) {
  let changed=0,total=0;
  for(const hand of ["left","right"] as const)for(let step=1;step<=7;step++) {
    const c:Case={id:"context",hand,notes:[[48],[50],[52]],bpm:120,ioiBeats:0.25,shape:"context"};
    const first=measure(c,arm);const second=measure({...c,notes:[[48+step],[50],[52-step]]},arm);
    total++;if(first.selected[1]!.join()!==second.selected[1]!.join())changed++;
  }
  return {changed,total};
}
export function anchorControls(arm:Arm) {
  const c:Case={id:"anchor",hand:"left",notes:[[48],[50],[52]],bpm:120,ioiBeats:0.25,shape:"anchor"};
  const event=inputs(c)[1]!;const group=generateFingeringCandidates(event);
  if(group.status!=="supported")throw Error("fixture");
  const before=measure(c,arm);const alternate=group.candidates.find(candidate=>candidate.fingers.join()!==before.selected[1]!.join())!;
  const anchors=new Map([[event.id,{signature:group.signature,fingers:alternate.fingers}]]);
  const during=measure(c,arm,anchors); const reset=measure(c,arm);
  return {before,during,reset,changedNeighbors:[0,2].filter(i=>before.selected[i]!.join()!==during.selected[i]!.join()).length};
}
export function switchingDiagnostic(policy:HandPositionPolicy) {
  const base:Case={id:"switch",hand:"left",notes:[[48],[50]],bpm:120,ioiBeats:1,shape:"one-white-key"};
  const pair=(fingers:number[][],seconds:number)=>{
    const positions=base.notes.map((p,i)=>handPositionProxy("left",p,fingers[i] as (1|2|3|4|5)[]));
    const distance=inputs(base).reduce((s,e,i)=>s+preferredFingeringDistance(e,fingers[i] as (1|2|3|4|5)[]),0);
    const shift=2*Math.abs(positions[1]!-positions[0]!);
    return {fingers,positions,prior:policy.lambda*distance,movement:shift,weightedMovement:shift*timePressure(seconds,policy.curve),total:policy.lambda*distance+shift*timePressure(seconds,policy.curve)};
  };
  let previous:ReturnType<typeof measure>|undefined;let change: {below:ReturnType<typeof measure>;above:ReturnType<typeof measure>}|undefined;
  for(let i=0;i<=600;i++) {
    const seconds=0.01*Math.pow(10000,i/600);const row=measure({...base,ioiBeats:seconds*2},policy);
    if(previous&&JSON.stringify(previous.selected)!==JSON.stringify(row.selected)&&!change)change={below:previous,above:row}; previous=row;
  }
  return {fixture:base,policy,rangeSeconds:[0.01,100],change,
    cost:change?[pair(change.below.selected,change.below.ioiSeconds),pair(change.above.selected,change.below.ioiSeconds),pair(change.below.selected,change.above.ioiSeconds),pair(change.above.selected,change.above.ioiSeconds)]:[]};
}
export function runtime(arm:Arm) {
  const c:Case={id:"runtime-128",hand:"right",notes:Array.from({length:128},(_,i)=>[60+i%7,64+i%7,67+i%7]),bpm:120,ioiBeats:1,shape:"128"};
  const events=inputs(c); const solve=()=>arm==="CURRENT"?rankCyclicFingerings(events):rankHandPositionFingerings(events,arm);
  solve();const times=Array.from({length:12},()=>{const start=performance.now();solve();return performance.now()-start;}).sort((a,b)=>a-b);
  return {events:128,maxCandidates:10,medianMs:times[6],p95Ms:times[11]};
}
