import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { generateFingeringCandidates, rankCyclicFingerings } from "../../src/domain/progressionFingering";
import { assignPracticeHandsAcrossProgression, isPracticeHandAssignmentPlayable } from "../../src/voicingPractice/fingeringDisplay";
import { parseChordLabel } from "../../src/domain/chords";
import { resolveProgressionPracticeVoicings, type ResolvedProgressionPracticeVoicing } from "../../src/domain/progressionVoicingPractice";
import { isValidFingering } from "../../src/voicingPractice/fingeringPreferences";
import { computeNextMoves, fixedFingerSlots } from "../../src/voicingPractice/nextMove";
import { evaluate, eventsOf, largeCases, namedCases, nonCyclic, shapes, type Result } from "./fixtures";
import { personalAudit, project, syntheticSnapshots, emptyPreferences } from "./integration";
import { sourceManifest, costs } from "./privateAccess";
const output=".local-evaluation/fingering-ranker-audit";
mkdirSync(output,{recursive:true});
const write=(name:string,value:unknown)=>writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+"\n");
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const fingers=(r:Result)=>r.candidates.map(c=>c.selected);
const coverage:Result[]=[];
for(const hand of ["left","right"] as const)for(let n=1;n<=5;n++)for(const [shape,intervals]of Object.entries(shapes))coverage.push(evaluate({id:`coverage-${hand}-${n}-${shape}`,hand,shape,notes:[intervals.slice(0,n).map(p=>(hand==="left"?48:60)+p)],bpm:120,ioiBeats:1}));
for(const hand of ["left","right"]as const)for(const [inversion,notes]of [[0,[0,4,7]],[1,[4,7,12]],[2,[7,12,16]]]as const)coverage.push(evaluate({id:`triad-${hand}-${inversion}`,hand,shape:`triad-${inversion}`,notes:[notes.map(p=>(hand==="left"?48:60)+p)],chords:[{root:0,quality:"maj",tensions:[],label:"C"}],bpm:120,ioiBeats:1}));
const named=namedCases().map(evaluate);
const corpus=largeCases();
const large=corpus.map(evaluate);
const base=large.filter(r=>r.ioiBeats===1);
const rate=(hits:number,total:number)=>({hits,total,rate:total?hits/total:null});
const distribution:Record<string,Record<string,number>>={left:{},right:{}};
const single:Record<string,Record<string,number>>={left:{"1":0,"2":0,"3":0,"4":0,"5":0},right:{"1":0,"2":0,"3":0,"4":0,"5":0}};
const bins:Record<string,number[]>={};
let invalid=0, candidateInvalid=0, candidateTotal=0, common=0, retained=0, repeated=0,stable=0,changedArrays=0,transitions=0,cycledChanged=0,selectedNotFirst=0;
let maxSpan=0;
for(const r of large){
 for(const c of r.candidates){
  const key=`${r.hand}/${c.notes.length}`;(bins[key]??=[]).push(c.count);
  for(const f of c.selected)distribution[r.hand]![f]=(distribution[r.hand]![f]??0)+1;
  if(c.notes.length===1)single[r.hand]![c.selected[0]!]!++;
  if(!c.validity)invalid++;if(c.selectedIndex!==0)selectedNotFirst++;
  for(const v of c.localRanked){candidateTotal++;if(!isValidFingering(r.hand,c.notes,v.fingers))candidateInvalid++;}
  maxSpan=Math.max(maxSpan,c.span);
 }
 for(const t of r.transitions){common+=t.common.length;retained+=t.common.filter(c=>c.retained).length;transitions++;if(!t.sameFingerArray)changedArrays++;if(t.repeated){repeated++;if(t.sameFingerArray)stable++;}if(t.cyclic&&!t.sameFingerArray)cycledChanged++;}
}
const context=base.map(r=>{
 const probe=(kind:"previous"|"next")=>{
  const notes=r.notes.map(row=>[...row]);const at=kind==="previous"?0:2;
  notes[at]=[notes[at]![0]!+1,notes[at]![0]!+8];
  const other=evaluate({...r,id:`${r.id}-${kind}`,notes});
  return {changed:!equal(r.candidates[1]!.selected,other.candidates[1]!.selected),baseline:r.candidates[1]!.selected,other:other.candidates[1]!.selected,totalScore:other.totalScore};
 };
 const times=large.filter(t=>t.hand===r.hand&&t.shape===r.shape&&t.id.replace(/-ioi.+$/,"")===r.id.replace(/-ioi.+$/,""));
 const bpm=[60,120,240].map(bpm=>evaluate({...r,bpm}));
 const open=nonCyclic(r);
 return {id:r.id,previous:probe("previous"),next:probe("next"),ioiChanged:times.some(t=>!equal(fingers(t),fingers(r))),ioiScoreChanged:times.some(t=>t.totalScore!==r.totalScore),bpmChanged:bpm.some(t=>!equal(fingers(t),fingers(r))),bpmScoreChanged:bpm.some(t=>t.totalScore!==r.totalScore),open,cyclicSelected:fingers(r),cyclicScore:r.totalScore,wrapCost:r.transitions[r.transitions.length-1]!.cost,openChangesSelection:!equal(open.selected,fingers(r))};
});
const snapshots=syntheticSnapshots();
const sources=(["saved","source-midi","custom","basic-full"]as const).map(selection=>project(snapshots[selection]!,undefined,selection==="basic-full"?{lessonStudyCategory:"teacher"}:{}));
const sameAssignedSources=(["saved","source-midi","custom","basic-full"]as const).map(family=>({family,result:rankCyclicFingerings(eventsOf(named[0]!).map(e=>({...e,family})))}));
const personal=personalAudit();
const autoNeighbors=personal.before.frames.map((f,i)=>({event:i,previousOrNextOfSaved:i===0||i===2,changed:!equal(f.suggested,personal.during.frames[i]!.suggested)}));
const unsupported=[[],[60,61,62,63,64,65],[-1],[128],[60.5],[60,60]].map(notes=>({notes,result:generateFingeringCandidates({hand:"left",midiPitches:notes})}));
const validFirst={id:"valid",hand:"right"as const,midiPitches:[60,64,67]};
const unsupportedBypass={input:[validFirst,{id:"gap",hand:"right"as const,midiPitches:[]}],result:rankCyclicFingerings([validFirst,{id:"gap",hand:"right",midiPitches:[]}])};
const current=personal.before.frames[1]!;
const emptyHand=computeNextMoves(current.hands,{left:[],right:[]},current.effective,{});
const partialMoveDiagnostic={current,emptyTarget:emptyHand,slots:fixedFingerSlots(emptyHand),formal:false};
const connectionAlternates=named.filter(r=>r.shape.startsWith("upper-single-to-")).map(r=>{
 const groups=eventsOf(r).map(generateFingeringCandidates);
 if(groups[0]!.status!=="supported"||groups[1]!.status!=="supported")throw Error("fixture");
 const a=groups[0],b=groups[1];const fixed=r.candidates[1]!.selectedIndex!;
 return {id:r.id,notes:r.notes,selected:r.candidates[0]!.selected,alternatives:a.candidates.map((c,i)=>({fingers:c.fingers,local:c.localCost,transition:costs.transitionCost(a,i,b,fixed)+costs.transitionCost(b,fixed,a,i)}))};
});
const keyColor=named.filter(r=>r.shape.startsWith("color-"));
const handCases=[];
for(let count=1;count<=10;count++)for(let root=0;root<12;root++)for(const selection of ["saved","source-midi","custom"]as const){
 const midiNotes=[0,2,4,7,9,12,14,16,19,21].slice(0,count).map(n=>36+root+n);
 const voicing:ResolvedProgressionPracticeVoicing={origin:selection,midiNotes,bassNote:midiNotes[0],notes:midiNotes.map(midiNote=>({midiNote,pitchClass:midiNote%12,octave:Math.floor(midiNote/12)-1,degree:null})),addedColorDegrees:[]};
 const assigned=assignPracticeHandsAcrossProgression(selection,[voicing])[0]!;
 handCases.push({selection,count,root,midiNotes,assigned,valid:isPracticeHandAssignmentPlayable(midiNotes,assigned)});
}
const sourceSearch=[];
for(const label of ["C","Cm","Cmaj7","C7","Cadd9","C6","Csus4","Cm7b5"])for(const study of ["teacher","core"]as const)for(const color of [false,true])for(const open of [false,true]){
 const generated={...snapshots["basic-full"]!,events:snapshots["basic-full"]!.events.map(e=>({...e,chord:parseChordLabel(label)!}))};
 const options={lessonStudyCategory:study,lessonColorEnabled:color,lessonOpenEnabled:open};
 const plan=resolveProgressionPracticeVoicings(generated,options);
 if(plan.events.some(e=>e.status!=="SUPPORTED"))continue;
 const generatedProject=project(generated,emptyPreferences,options);
 const fixed={...generated,selection:"source-midi"as const,events:generated.events.map((e,i)=>{const v=plan.events[i]!;if(v.status!=="SUPPORTED")throw Error("fixture");return {...e,voicing:{kind:"source-midi"as const,midiNotes:v.voicing.midiNotes,bassNote:v.voicing.bassNote}};})};
 const fixedProject=project(fixed);
 sourceSearch.push({label,study,color,open,notesEqual:equal(generatedProject.notes,fixedProject.notes),handsEqual:equal(generatedProject.hands,fixedProject.hands),generated:generatedProject,fixed:fixedProject});
}
const uiPath=`${output}/ui-observations.json`;
const uiRows=existsSync(uiPath)?JSON.parse(readFileSync(uiPath,"utf8")) as {tag:string;changed?:number;total?:number}[]:[];
const rangeRow=uiRows.find(r=>r.tag==="range-result");
const summary={schemaVersion:1,head:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),corpusId:"p11-12-public-synthetic-v1",corpusSha256:createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),sourceManifest:sourceManifest(),
 method:"Product public functions; exact private functions AST-extracted read-only. Hypothetical open-chain diagnostic only. No fingering Gold, external dataset, private MIDI or fitting.",
 corpus:{progressions:large.length,baseComparisonCases:base.length,distinctHandPitchProgressions:new Set(base.map(r=>JSON.stringify([r.hand,r.notes]))).size,events:large.reduce((s,r)=>s+r.candidates.length,0),timingsBeats:[0.25,1,4],bpm:120,additionalBpm:[60,120,240],coverageCases:coverage.length,namedCases:named.length},
 candidates:Object.fromEntries(Object.entries(bins).map(([k,v])=>[k,{observations:v.length,min:Math.min(...v),max:Math.max(...v),mean:v.reduce((a,b)=>a+b,0)/v.length,empty:v.filter(n=>!n).length}])),
 distributions:{all:distribution,single},
 validity:{candidateTotal,candidateInvalid,selectedInvalid:invalid,notesChanged:large.filter(r=>!r.notesUnchanged).length,maxObservedSpan:maxSpan,handAssignmentCases:handCases.length,invalidHandAssignments:handCases.filter(c=>!c.valid).length,extremeStretchThreshold:"NOT_DEFINED_BY_RANKER; NOT_A_PHYSICAL_SAFETY_PASS"},
 transitions:{commonToneRetention:rate(retained,common),commonToneFingerChange:rate(common-retained,common),sameFingerArray:rate(transitions-changedArrays,transitions),changedFingerArray:rate(changedArrays,transitions),repeatedChordStability:rate(stable,repeated),cycleBoundaryFingerArrayChange:rate(cycledChanged,large.length),selectedDifferentFromLocalFirst:rate(selectedNotFirst,large.reduce((s,r)=>s+r.candidates.length,0))},
 context:{rangeSelectedChange:rangeRow?rate(rangeRow.changed!,rangeRow.total!):"NOT_MEASURED",uiObservationSha256:existsSync(uiPath)?createHash("sha256").update(readFileSync(uiPath)).digest("hex"):null,ioiSelectedChange:rate(context.filter(c=>c.ioiChanged).length,context.length),ioiScoreChange:rate(context.filter(c=>c.ioiScoreChanged).length,context.length),bpmSelectedChange:rate(context.filter(c=>c.bpmChanged).length,context.length),bpmScoreChange:rate(context.filter(c=>c.bpmScoreChanged).length,context.length),previousChanged:rate(context.filter(c=>c.previous.changed).length,context.length),nextChanged:rate(context.filter(c=>c.next.changed).length,context.length),cyclicVsOpenSelection:rate(context.filter(c=>c.openChangesSelection).length,context.length),positiveWrapCost:rate(context.filter(c=>c.wrapCost>0).length,context.length)},
 saved:{persistedExact:equal(personal.saved,personal.reloaded),restoredAuto:equal(personal.before,personal.after),neighborRecommendedChange:rate(autoNeighbors.filter(f=>f.previousOrNextOfSaved&&f.changed).length,2),splitChangedEvents:personal.freeAssignment.before.hands.filter((h,i)=>!equal(h,personal.freeAssignment.after.hands[i])).length},
 sources:{matchedGeneratedFixedComparisons:sourceSearch.length,matchedNotesComparisons:sourceSearch.filter(s=>s.notesEqual).length,changedHandAssignment:sourceSearch.filter(s=>!s.handsEqual).length,sameExactNotes:sources.every(s=>equal(s.notes,sources[0]!.notes)),fixedSourceHandsEqual:sources.slice(0,3).every(s=>equal(s.hands,sources[0]!.hands)),generatedHandsEqual:equal(sources[3]!.hands,sources[0]!.hands),sameAssignedFamilyOnlyInvariant:sameAssignedSources.every(s=>equal(s.result,sameAssignedSources[0]!.result))},
 definitions:{sameFingerArray:"Ordinal finger arrays equal across a transition; NOT physical comfort or same notes",commonToneRetention:"Same absolute MIDI pitch uses same finger, within one hand",cycleBoundaryChange:"Last/first selected finger arrays differ; NOT quality KPI",rates:"All 2160 timed cases; duplicated timing rows are disclosed, base comparison cases=720; distinct hand+pitch cases=696",sourceScope:"Same exact practice notes from actual Generated resolver then detached fixed snapshots; hand assignment reported separately"},
};
write("baseline-summary",summary);write("candidate-coverage",coverage);write("transition-metrics",{context,named,keyColor,connectionAlternates});write("case-results",large);write("integration-results",{sources,sameAssignedSources,personal,autoNeighbors,unsupported,unsupportedBypass,partialMoveDiagnostic,handCases,sourceSearch});
console.log(JSON.stringify({head:summary.head,progressions:large.length,events:summary.corpus.events,candidates:summary.validity.candidateTotal,invalid:summary.validity.candidateInvalid,context:summary.context,saved:summary.saved,sources:summary.sources,output},null,2));
