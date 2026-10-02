import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateFingeringCandidates } from "../../src/domain/progressionFingering";
import { handPositionCostModel } from "../../src/domain/handPositionFingering";
import { costs } from "../p11-12/privateAccess";
import type { Case } from "../p11-12/fixtures";
import { aggregate, contextSensitivity, inputs, matchedTime, measure, runtime, solveArm, type ComparableArm } from "./comparisonMetrics";
import { COMMON_TONE_BASE, COMMON_TONE_GAMMAS, commonToneCostModel, sharedFingerChanges } from "./commonTone";
import { commonToneDevCases, commonToneRepresentatives, commonToneTimeProbes } from "./commonToneInputs";

const sha=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const directory=".local-evaluation/p11-13/common-tone";mkdirSync(directory,{recursive:true});
const artifactPaths=[".local-evaluation/p11-13/comparison.json",".local-evaluation/p11-13/frozen-policy.json",".local-evaluation/p11-13/lambda-followup/comparison.json"];
const artifacts=artifactPaths.map(file=>({file,sha256:sha(readFileSync(file))}));
const prior=JSON.parse(readFileSync(artifactPaths[2]!,"utf8")) as {manifestSHA:string;arms:{name:string;stats:ReturnType<typeof aggregate>}[]};
const dev=commonToneDevCases();const current=dev.map(c=>measure(c,"CURRENT"));const plain=dev.map(c=>measure(c,COMMON_TONE_BASE));
if(dev.length!==1148||sha(JSON.stringify(dev))!==prior.manifestSHA)throw Error("Dev inputs changed");
for(const [name,rows] of [["CURRENT",current],["lambda=2",plain]] as const) {
  if(JSON.stringify(aggregate(rows))!==JSON.stringify(prior.arms.find(a=>a.name===name)!.stats))throw Error(`Prior dev aggregate mismatch ${name}`);
}
const original24=new Set(plain.flatMap((r,i)=>r.reassigned>current[i]!.reassigned?[i]:[]));
if(original24.size!==24)throw Error("Original regression cohort changed");
const anchorMaps=dev.map(c=>new Map(inputs(c).flatMap(e=>{
  const g=generateFingeringCandidates(e);return g.status==="supported"?[[e.id,{signature:g.signature,fingers:g.candidates[g.candidates.length-1]!.fingers}] as const]:[];
})));
const secondsGrid=[0.125,0.25,0.5,1,2,4];
function timeProbes(arm:ComparableArm) {
  return commonToneTimeProbes().map(c=>{
    const rows=secondsGrid.map(seconds=>measure({...c,ioiBeats:seconds*c.bpm/60},arm));
    return {id:c.id,rows,changes:rows.slice(1).filter((r,i)=>JSON.stringify(r.selected)!==JSON.stringify(rows[i]!.selected)).length,
      direction:rows.slice(1).every((r,i)=>r.preferred<=rows[i]!.preferred+1e-9&&r.movement>=rows[i]!.movement-1e-9)};
  });
}
function sharedRuntime(arm:ComparableArm) {
  const input=inputs({id:"shared-runtime",hand:"right",notes:Array.from({length:128},(_,i)=>[60,64,67+i%3]),bpm:120,ioiBeats:1,shape:"shared-stress"});
  const solve=()=>solveArm(input,arm);solve();
  const values=Array.from({length:12},()=>{const start=performance.now();solve();return performance.now()-start;}).sort((a,b)=>a-b);
  return {events:128,maxCandidates:10,commonComparisons:256,medianMs:values[6],p95Ms:values[11]};
}
const savedCase:Case={id:"anchor",hand:"left",notes:[[48],[50],[52]],bpm:120,ioiBeats:0.25,shape:"anchor"};
const savedEvent=inputs(savedCase)[1]!;const savedGroup=generateFingeringCandidates(savedEvent);
if(savedGroup.status!=="supported")throw Error("Saved fixture unsupported");
const savedAnchors=new Map([[savedEvent.id,{signature:savedGroup.signature,fingers:[4] as const}]]);
const representatives=commonToneRepresentatives();
function run(name:string,arm:ComparableArm,gamma:number) {
  const rows=name==="CURRENT"?current:name==="E1-T"?plain:dev.map(c=>measure(c,arm));
  const stats=aggregate(rows);
  const casewise=rows.reduce((v,r,i)=>{const delta=r.reassigned-current[i]!.reassigned;
    v[delta<0?"improved":delta>0?"regressed":"equal"]++;if(delta>0)v.added+=delta;if(delta<0)v.removed-=delta;return v;
  },{improved:0,regressed:0,equal:0,added:0,removed:0});
  const cohort={resolved:0,remaining:0,lowered:0,partial:0,unchanged:0,worsened:0,newRegressions:0};
  rows.forEach((r,i)=>{
    if(original24.has(i)) {
      if(r.reassigned<=current[i]!.reassigned)cohort.resolved++;else cohort.remaining++;
      if(r.reassigned<plain[i]!.reassigned){cohort.lowered++;if(r.reassigned>current[i]!.reassigned)cohort.partial++;}
      else if(r.reassigned===plain[i]!.reassigned)cohort.unchanged++;else cohort.worsened++;
    } else if(r.reassigned>current[i]!.reassigned)cohort.newRegressions++;
  });
  const families=[...new Set(dev.map(c=>c.shape))].map(shape=>{
    const indexes=dev.flatMap((c,i)=>c.shape===shape?[i]:[]);
    return {shape,cases:indexes.length,current:aggregate(indexes.map(i=>current[i]!)),plain:aggregate(indexes.map(i=>plain[i]!)),result:aggregate(indexes.map(i=>rows[i]!)),
      regressionCases:indexes.filter(i=>rows[i]!.reassigned>current[i]!.reassigned).length,
      original:indexes.filter(i=>original24.has(i)).length,resolved:indexes.filter(i=>original24.has(i)&&rows[i]!.reassigned<=current[i]!.reassigned).length,
      newRegressions:indexes.filter(i=>!original24.has(i)&&rows[i]!.reassigned>current[i]!.reassigned).length};
  });
  const anchors=aggregate(dev.map((c,i)=>measure(c,arm,anchorMaps[i])));
  const before=measure(savedCase,arm),during=measure(savedCase,arm,savedAnchors);
  return {name,gamma,policy:{...COMMON_TONE_BASE,gamma,baseline:name==="CURRENT"?"CURRENT":"E1-T"},stats,retained:stats.common-stats.reassigned,
    casewise,cohort,families,anchors,time:matchedTime(arm),commonTime:timeProbes(arm),context:contextSensitivity(arm),
    representative:representatives.map(c=>measure(c,arm)),saved:{before,during,fingers:[4],changedNeighbors:[0,2].filter(i=>before.selected[i]!.join()!==during.selected[i]!.join()).length},
    runtime:runtime(arm),sharedRuntime:sharedRuntime(arm),rows};
}
const armInputs:[string,ComparableArm,number][]=[["CURRENT","CURRENT",0],["E1-T",COMMON_TONE_BASE,0],...COMMON_TONE_GAMMAS.map(gamma=>[`CT=${gamma}`,{costModel:commonToneCostModel(gamma)},gamma] as [string,ComparableArm,number])];
const results=armInputs.map(([name,arm,gamma])=>run(name,arm,gamma));const baseline=results[1]!;
const eligibility=results.slice(2).map(r=>{
  const checks={commonCases:r.casewise.regressed<24,commonTotal:r.stats.reassigned<=2122,
    failures:r.stats.candidateEmpty<=baseline.stats.candidateEmpty&&r.stats.solverFailure<=baseline.stats.solverFailure&&r.stats.structuralFailure<=baseline.stats.structuralFailure,
    anchors:r.anchors.anchorRetained===r.anchors.anchorTotal,determinism:r.stats.deterministic===dev.length,
    immutable:r.stats.notesUnchanged===dev.length&&r.stats.candidatesUnchanged===dev.length,
    repeat:r.stats.repeatedChanged<=baseline.stats.repeatedChanged,
    originalTime:r.time.direction&&r.time.changes>0,
    commonTime:r.commonTime.every((p,i)=>p.direction&&(baseline.commonTime[i]!.changes===0||p.changes>0)),
    context:r.context.changed>0,positionGain:r.stats.movement<results[0]!.stats.movement};
  return {name:r.name,gamma:r.gamma,checks,eligible:Object.values(checks).every(Boolean)};
});
const eligible=results.slice(2).filter(r=>eligibility.find(e=>e.name===r.name)!.eligible).sort((a,b)=>a.casewise.regressed-b.casewise.regressed||a.cohort.newRegressions-b.cohort.newRegressions||a.stats.reassigned-b.stats.reassigned||a.stats.movement-b.stats.movement||a.gamma-b.gamma);
const selected=eligible[0];
function detail(c:Case,arm:ComparableArm,gamma:number) {
  const events=inputs(c);const groups=events.map(e=>{const g=generateFingeringCandidates(e);if(g.status!=="supported")throw Error("Detail fixture unsupported");return g;});
  const row=measure(c,arm);const indexes=groups.map((g,i)=>g.candidates.findIndex(v=>v.fingers.join()===row.selected[i]!.join()));
  const base=handPositionCostModel(COMMON_TONE_BASE);
  const local=groups.map((g,i)=>base.local(events[i]!,g,indexes[i]!));
  const edges=groups.map((a,i)=>{
    const j=(i+1)%groups.length,b=groups[j]!,ai=indexes[i]!,bi=indexes[j]!;const seconds=c.ioiBeats*60/c.bpm;
    const commonPitch=a.pitches.filter(p=>b.pitches.includes(p));
    const common=commonPitch.map(p=>({pitch:p,before:a.candidates[ai]!.fingers[a.pitches.indexOf(p)],after:b.candidates[bi]!.fingers[b.pitches.indexOf(p)]}));
    const e1=base.transition(a,ai,b,bi,seconds);const ct=gamma*sharedFingerChanges(a,ai,b,bi);
    return {from:i,to:j,wrap:j===0,seconds,hand:c.hand,notesBefore:a.pitches,notesAfter:b.pitches,commonPitch,common,
      positionBefore:row.positions[i],positionAfter:row.positions[j],e1Transition:e1,commonToneCost:ct,totalTransition:e1+ct};
  });
  const e1Cost=local.reduce((s,v)=>s+v,0)+edges.reduce((s,e)=>s+e.e1Transition,0);
  const commonToneCost=edges.reduce((s,e)=>s+e.commonToneCost,0);
  const currentObjective=groups.reduce((s,g,i)=>s+g.candidates[indexes[i]!]!.localCost+costs.transitionCost(g,indexes[i]!,groups[(i+1)%groups.length]!,indexes[(i+1)%groups.length]!),0);
  return {selected:row.selected,positionProxy:row.positions,commonReassignment:row.reassigned,localE1Cost:local,edges,
    e1Cost,commonToneCost,totalCost:arm==="CURRENT"?currentObjective:e1Cost+commonToneCost,
    costContract:arm==="CURRENT"?"CURRENT actual objective; e1Cost is counterfactual only":"lambda2 inverse + gamma penalty"};
}
const cohortCases=[...original24].map(i=>({case:dev[i],candidates:inputs(dev[i]!).map(generateFingeringCandidates),
  arms:armInputs.map(([name,arm,gamma])=>({name,gamma,...detail(dev[i]!,arm,gamma)}))}));
const files=["src/domain/progressionFingering.ts","src/domain/handPositionFingering.ts","src/voicingPractice/rankPracticeFingerings.ts","scripts/p11-12/fixtures.ts","scripts/p11-12/privateAccess.ts","scripts/p11-13/comparisonMetrics.ts","scripts/p11-13/commonTone.ts","scripts/p11-13/commonToneInputs.ts","scripts/p11-13/commonToneComparison.ts","scripts/p11-13/COMMON-TONE-EXPERIMENT-CONTRACT.md"];
const provenance={corpusId:"p11-13-public-synthetic-v1",corpusVersion:1,manifestSHA:sha(JSON.stringify(dev)),split:"dev-only",codeCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
  scoringContract:"p11-13-properties-v1",metricVersion:"common-tone-followup-v1",boundarySource:"authored-onsets",identitySource:"authored-or-absent-fixed",snapshotSource:"public-authored-notes",handSource:"fixed-input-hand",
  originalArtifacts:artifacts,sourceManifest:files.map(file=>({file,sha256:sha(readFileSync(file))}))};
for(const artifact of artifacts)if(sha(readFileSync(artifact.file))!==artifact.sha256)throw Error("Original artifact modified");
writeFileSync(`${directory}/original-24-cases.json`,JSON.stringify({schemaVersion:1,provenance,cases:cohortCases},null,2)+"\n");
const summary={schemaVersion:1,provenance,policyGrid:COMMON_TONE_GAMMAS,eligibility,selectedGamma:selected?.gamma??null,
  decision:selected?"COMMON_TONE_USEFUL":eligibility.every(e=>!e.checks.failures||!e.checks.originalTime||!e.checks.commonTime)?"COMMON_TONE_HARMFUL":"COMMON_TONE_NO_CLEAR_GAIN",
  results:results.map(result=>({...result,rows:undefined}))};
writeFileSync(`${directory}/comparison.json`,JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({codeCommit:provenance.codeCommit,decision:summary.decision,selectedGamma:summary.selectedGamma,
  arms:summary.results.map(r=>({name:r.name,retained:r.retained,reassigned:r.stats.reassigned,casewise:r.casewise,cohort:r.cohort,movement:r.stats.movement,time:r.time.changes,commonTime:r.commonTime.map(t=>({id:t.id,direction:t.direction,changes:t.changes})),runtime:r.runtime,sharedRuntime:r.sharedRuntime})),eligibility}));
