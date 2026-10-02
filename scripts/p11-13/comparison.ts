import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateFingeringCandidates } from "../../src/domain/progressionFingering";
import type { HandPositionPolicy, TimePressureCurve } from "../../src/domain/handPositionFingering";
import { largeCases, namedCases, type Case } from "../p11-12/fixtures";
import { inputs, measure, aggregate, matchedTime, contextSensitivity, anchorControls, switchingDiagnostic, runtime, type Arm } from "./comparisonMetrics";
const lambdas = [0.125, 0.25, 0.5, 1, 2, 4];
const curves: TimePressureCurve[] = ["inverse", "sqrt", "shifted-inverse"];
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
const manifestFiles=["src/domain/progressionFingering.ts","src/domain/handPositionFingering.ts","src/voicingPractice/rankPracticeFingerings.ts","scripts/p11-13/comparison.ts","scripts/p11-13/comparisonMetrics.ts","scripts/p11-13/EXPERIMENT-CONTRACT.md","scripts/p11-12/fixtures.ts","src/views/ProgressionVoicingPracticeView.tsx","src/voicingPractice/nextMove.ts","src/voicingPractice/fingeringDisplay.ts"];
const summary={schemaVersion:1,corpusId:"p11-13-public-synthetic-v1",corpusVersion:1,manifestSHA:createHash("sha256").update(JSON.stringify({large:baseCases,named:namedCases(),representative})).digest("hex"),codeCommit:head,scoringContract:"p11-13-properties-v1",snapshotSource:"public-authored-notes",boundarySource:"authored-onsets",handSource:"fixed-input-hand",policy,validWidth:width??null,baselineSum,sweep,results,caseRegressions,evaluationRegressions,anchorSweep,timeFingerDistribution,candidateIndexDistribution,representative:reps,savedRepresentative:{current:anchorControls("CURRENT"),experimental:anchorControls(policy)},switching:switchingDiagnostic(policy),
  sourceManifest:manifestFiles.map(file=>({file,sha256:createHash("sha256").update(readFileSync(file)).digest("hex")}))};
writeFileSync(`${directory}/comparison.json`,JSON.stringify(summary,null,2)+"\n");
writeFileSync(`${directory}/representative.md`,"# Representative comparison (not fingering Gold)\n\n|Case|IOI seconds|CURRENT|E1-T|Proxy movement CURRENT→E1-T|\n|---|---:|---|---|---:|\n"+reps.map(r=>`|${r.case.id}|${r.current.ioiSeconds}|${r.current.selected.map(a=>a.join()).join(" → ")}|${r.experimental.selected.map(a=>a.join()).join(" → ")}|${r.current.movement} → ${r.experimental.movement}|`).join("\n")+"\n",{encoding:"utf8"});
console.log(JSON.stringify({policy,validWidth:width??null,dev:dev.length,evaluation:evaluation.length,arms:results.map(r=>({name:r.name,devReassigned:r.dev.reassigned,evalReassigned:r.evaluation.reassigned,timeChanges:r.time.changes,context:r.context,runtime:r.runtime})),decision:width?"AGGREGATE_PROPERTIES_PASS / PER_CASE_REGRESSIONS / HUMAN_DECISION_PENDING":"NO_VALID_WIDTH / NOT_PROMOTABLE"}));
