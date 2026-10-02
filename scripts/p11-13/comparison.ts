import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateFingeringCandidates, preferredFingeringDistance, rankCyclicFingerings, type FingeringAnchor, type ProgressionFingeringEvent } from "../../src/domain/progressionFingering";
import { handPositionProxy, rankHandPositionFingerings, timePressure, type HandPositionPolicy, type TimePressureCurve } from "../../src/domain/handPositionFingering";
import { isValidFingering } from "../../src/voicingPractice/fingeringPreferences";
import { largeCases, namedCases, type Case } from "../p11-12/fixtures";

type Arm = "CURRENT" | HandPositionPolicy;
const lambdas = [0.125, 0.25, 0.5, 1, 2, 4];
const curves: TimePressureCurve[] = ["inverse", "sqrt", "shifted-inverse"];
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
function aggregate(rows: ReturnType<typeof measure>[]) {
  const sum=(key:"movement"|"wrap"|"common"|"reassigned"|"repeatedChanged"|"solverFailure"|"candidateEmpty"|"structuralFailure"|"extreme"|"single"|"anchorTotal"|"anchorRetained")=>rows.reduce((s,r)=>s+r[key],0);
  const shifts=rows.flatMap(r=>r.shifts).sort((a,b)=>a-b);
  return {cases:rows.length,events:rows.reduce((s,r)=>s+r.notes.length,0),movement:sum("movement"),shiftMedian:shifts[Math.floor(shifts.length/2)],shiftP95:shifts[Math.floor(shifts.length*0.95)],wrap:sum("wrap"),
    common:sum("common"),reassigned:sum("reassigned"),repeatedChanged:sum("repeatedChanged"),solverFailure:sum("solverFailure"),candidateEmpty:sum("candidateEmpty"),structuralFailure:sum("structuralFailure"),
    deterministic:rows.filter(r=>r.deterministic).length,notesUnchanged:rows.filter(r=>r.notesUnchanged).length,candidatesUnchanged:rows.filter(r=>r.candidatesUnchanged).length,
    leftL1L2:sum("extreme"),singleEvents:sum("single"),anchorTotal:sum("anchorTotal"),anchorRetained:sum("anchorRetained")};
}
function matchedTime(arm:Arm) {
  const base:Case={id:"time-property",hand:"left",notes:[[48],[50],[52],[53]],bpm:120,ioiBeats:1,shape:"step"};
  const rows=[0.03125,0.0625,0.125,0.25,0.5,1,2,4,8,16].map(seconds=>measure({...base,ioiBeats:seconds*2},arm));
  return { rows, changes:rows.slice(1).filter((r,i)=>JSON.stringify(r.selected)!==JSON.stringify(rows[i]!.selected)).length,
    direction:rows.slice(1).every((r,i)=>r.preferred<=rows[i]!.preferred+1e-9&&r.movement>=rows[i]!.movement-1e-9)};
}
function contextSensitivity(arm:Arm) {
  let changed=0,total=0;
  for(const hand of ["left","right"] as const)for(let step=1;step<=7;step++) {
    const c:Case={id:"context",hand,notes:[[48],[50],[52]],bpm:120,ioiBeats:0.25,shape:"context"};
    const first=measure(c,arm);const second=measure({...c,notes:[[48+step],[50],[52-step]]},arm);
    total++;if(first.selected[1]!.join()!==second.selected[1]!.join())changed++;
  }
  return {changed,total};
}
function anchorControls(arm:Arm) {
  const c:Case={id:"anchor",hand:"left",notes:[[48],[50],[52]],bpm:120,ioiBeats:0.25,shape:"anchor"};
  const event=inputs(c)[1]!;const group=generateFingeringCandidates(event);
  if(group.status!=="supported")throw Error("fixture");
  const before=measure(c,arm);const alternate=group.candidates.find(candidate=>candidate.fingers.join()!==before.selected[1]!.join())!;
  const anchors=new Map([[event.id,{signature:group.signature,fingers:alternate.fingers}]]);
  const during=measure(c,arm,anchors); const reset=measure(c,arm);
  return {before,during,reset,changedNeighbors:[0,2].filter(i=>before.selected[i]!.join()!==during.selected[i]!.join()).length};
}
function switchingDiagnostic(policy:HandPositionPolicy) {
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
function runtime(arm:Arm) {
  const c:Case={id:"runtime-128",hand:"right",notes:Array.from({length:128},(_,i)=>[60+i%7,64+i%7,67+i%7]),bpm:120,ioiBeats:1,shape:"128"};
  const events=inputs(c); const solve=()=>arm==="CURRENT"?rankCyclicFingerings(events):rankHandPositionFingerings(events,arm);
  solve();const times=Array.from({length:12},()=>{const start=performance.now();solve();return performance.now()-start;}).sort((a,b)=>a-b);
  return {events:128,maxCandidates:10,medianMs:times[6],p95Ms:times[11]};
}
const directory=".local-evaluation/p11-13";mkdirSync(directory,{recursive:true});
const baseCases=largeCases();
const offset=(c:Case)=>Number(c.id.match(/-(\d+)-ioi/)?.[1]);
const dev=[...baseCases.filter(c=>offset(c)<6),...namedCases()];
const baseline=dev.map(c=>measure(c,"CURRENT"));const baselineSum=aggregate(baseline);
const sweep=curves.flatMap(curve=>lambdas.map(lambda=>{
  const policy:HandPositionPolicy={variant:"E1-T",curve,lambda};const rows=dev.map(c=>measure(c,policy));const stats=aggregate(rows);
  const time=matchedTime(policy);const context=contextSensitivity(policy);const anchor=anchorControls(policy);
  const propertyPass=stats.solverFailure===0&&stats.structuralFailure===0&&stats.deterministic===stats.cases&&stats.notesUnchanged===stats.cases&&stats.candidatesUnchanged===stats.cases&&stats.reassigned<=baselineSum.reassigned&&stats.repeatedChanged<=baselineSum.repeatedChanged&&time.direction&&time.changes>0&&context.changed>0&&anchor.during.anchorRetained===1;
  return {policy,stats,timeChanges:time.changes,timeDirection:time.direction,context,anchorNeighborChanges:anchor.changedNeighbors,propertyPass};
}));
const runs:{curve:TimePressureCurve;values:number[]}[]=[];
for(const curve of curves) {let values:number[]=[];for(const row of sweep.filter(r=>r.policy.curve===curve)){if(row.propertyPass)values.push(row.policy.lambda);else {if(values.length)runs.push({curve,values});values=[];}}if(values.length)runs.push({curve,values});}
runs.sort((a,b)=>b.values.length-a.values.length||curves.indexOf(a.curve)-curves.indexOf(b.curve));
const width=runs.find(r=>r.values.length>=2);
const selectedPolicy:HandPositionPolicy={variant:"E1-T",curve:width?.curve??"inverse",lambda:width?width.values[Math.floor((width.values.length-1)/2)]!:1};
const verifyFrozen=process.argv.includes("--verify-frozen");
const policy:HandPositionPolicy=verifyFrozen?(JSON.parse(readFileSync(`${directory}/frozen-policy.json`,"utf8")) as {policy:HandPositionPolicy}).policy:selectedPolicy;
if(JSON.stringify(policy)!==JSON.stringify(selectedPolicy))throw Error("Frozen dev policy differs; do not silently retune");
if(!verifyFrozen)writeFileSync(`${directory}/frozen-policy.json`,JSON.stringify({policy,validWidth:width??null,decision:width?"PROPERTY_ELIGIBLE_FOR_HUMAN_REVIEW":"NO_VALID_WIDTH / NOT_PROMOTABLE",sweep},null,2)+"\n");
// The reserved corpus is evaluated only after the policy file is frozen.
const evaluation=baseCases.filter(c=>offset(c)>=6);
const arms:[string,Arm][]=[["CURRENT","CURRENT"],["E1-raw",{...policy,variant:"E1-raw",lambda:0}],["E1-T-zero-prior",{...policy,variant:"E1-T-zero-prior",lambda:0}],["E1-T",policy]];
const results=arms.map(([name,arm])=>({name,dev:aggregate(dev.map(c=>measure(c,arm))),evaluation:aggregate(evaluation.map(c=>measure(c,arm))),all:aggregate(baseCases.map(c=>measure(c,arm))),time:matchedTime(arm),context:contextSensitivity(arm),anchor:anchorControls(arm),runtime:runtime(arm)}));
const representative:Case[]=[
  {id:"slow-bass",hand:"left",notes:[[48],[50],[52],[53]],bpm:120,ioiBeats:4,shape:"slow"},
  {id:"fast-bass",hand:"left",notes:[[48],[50],[52],[53]],bpm:120,ioiBeats:0.25,shape:"fast"},
  ...["chromatic","octave","upper-single-to-3","3-to-upper-single","repeat"].map(id=>namedCases().find(c=>c.id===`left-${id}`)!),
  {id:"inversion",hand:"right",notes:[[60,64,67],[64,67,72],[67,72,76]],bpm:120,ioiBeats:1,shape:"inversion",chords:Array.from({length:3},()=>({root:0,quality:"maj",tensions:[],label:"C"}))},
  {id:"loop-boundary",hand:"left",notes:[[43],[50],[48]],bpm:120,ioiBeats:1,shape:"wrap"},
];
const reps=representative.map(c=>({case:c,current:measure(c,"CURRENT"),experimental:measure(c,policy),
  rightHand: c.id.endsWith("bass") ? {notes:c.notes.map(()=>[60,64,67]), current:measure({...c,hand:"right",notes:c.notes.map(()=>[60,64,67])},"CURRENT"), experimental:measure({...c,hand:"right",notes:c.notes.map(()=>[60,64,67])},policy)} : undefined}));
const chosenDev=dev.map(c=>measure(c,policy));
const caseRegressions=chosenDev.flatMap((row,i)=>row.reassigned>baseline[i]!.reassigned?[{id:row.id,current:baseline[i]!.reassigned,experimental:row.reassigned}]:[]);
const evaluationRegressions=evaluation.flatMap(c=>{const current=measure(c,"CURRENT"),experimental=measure(c,policy);return experimental.reassigned>current.reassigned?[{id:c.id,current:current.reassigned,experimental:experimental.reassigned}]:[];});
const anchorSweep=arms.map(([name,arm])=>{const rows=baseCases.map(c=>{const ev=inputs(c);const anchors=new Map(ev.flatMap(e=>{const g=generateFingeringCandidates(e);return g.status==="supported"?[[e.id,{signature:g.signature,fingers:g.candidates[g.candidates.length-1]!.fingers}] as const]:[];}));return measure(c,arm,anchors);});return {name,stats:aggregate(rows)};});
const timeFingerDistribution=arms.map(([name,arm])=>({name,rows:[0.25,1,4].map(ioiBeats=>{const selected=baseCases.filter(c=>c.ioiBeats===ioiBeats&&c.hand==="left"&&c.notes[0]!.length===1).map(c=>measure(c,arm));const counts:Record<string,number>={};for(const row of selected)for(const fingers of row.selected)counts[fingers[0]!]=(counts[fingers[0]!]??0)+1;return {ioiSeconds:ioiBeats*0.5,counts};})}));
const candidateIndexDistribution = Object.fromEntries(arms.map(([name,arm])=>{
  const counts:Record<string,number>={};let changed=0;
  for(const c of baseCases){const selected=measure(c,arm).selected;const current=measure(c,"CURRENT").selected;const groups=inputs(c).map(generateFingeringCandidates);
    selected.forEach((f,i)=>{const g=groups[i]!;if(g.status!=="supported")return;const index=g.candidates.findIndex(v=>v.fingers.join()===f.join());counts[index]=(counts[index]??0)+1;if(f.join()!==current[i]!.join())changed++;});}
  return [name,{counts,changed}];
}));
const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const manifestFiles=["src/domain/progressionFingering.ts","src/domain/handPositionFingering.ts","src/voicingPractice/rankPracticeFingerings.ts","scripts/p11-13/comparison.ts","scripts/p11-13/EXPERIMENT-CONTRACT.md"];
const summary={schemaVersion:1,corpusId:"p11-13-public-synthetic-v1",corpusVersion:1,manifestSHA:createHash("sha256").update(JSON.stringify(baseCases)).digest("hex"),codeCommit:head,scoringContract:"p11-13-properties-v1",snapshotSource:"public-authored-notes",boundarySource:"authored-onsets",handSource:"fixed-input-hand",policy,validWidth:width??null,baselineSum,sweep,results,caseRegressions,evaluationRegressions,anchorSweep,timeFingerDistribution,candidateIndexDistribution,representative:reps,savedRepresentative:{current:anchorControls("CURRENT"),experimental:anchorControls(policy)},switching:switchingDiagnostic(policy),
  sourceManifest:manifestFiles.map(file=>({file,sha256:createHash("sha256").update(readFileSync(file)).digest("hex")}))};
writeFileSync(`${directory}/comparison.json`,JSON.stringify(summary,null,2)+"\n");
writeFileSync(`${directory}/representative.md`,"# Representative comparison (not fingering Gold)\n\n|Case|IOI seconds|CURRENT|E1-T|Proxy movement CURRENT→E1-T|\n|---|---:|---|---|---:|\n"+reps.map(r=>`|${r.case.id}|${r.current.ioiSeconds}|${r.current.selected.map(a=>a.join()).join(" → ")}|${r.experimental.selected.map(a=>a.join()).join(" → ")}|${r.current.movement} → ${r.experimental.movement}|`).join("\n")+"\n",{encoding:"utf8"});
console.log(JSON.stringify({policy,validWidth:width??null,dev:dev.length,evaluation:evaluation.length,arms:results.map(r=>({name:r.name,devReassigned:r.dev.reassigned,evalReassigned:r.evaluation.reassigned,timeChanges:r.time.changes,context:r.context,runtime:r.runtime})),decision:width?"AGGREGATE_PROPERTIES_PASS / PER_CASE_REGRESSIONS / HUMAN_DECISION_PENDING":"NO_VALID_WIDTH / NOT_PROMOTABLE"}));
