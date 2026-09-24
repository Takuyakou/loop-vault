/** Evaluation-only source-conditioned candidate vocabulary; never reads Gold to generate candidates. */
import { performance } from "node:perf_hooks";
import { parseChordLabel } from "../../src/domain/chords";
import { parseMidi } from "../../src/domain/midi/parser";
import { harmonicGoldExamples } from "./harmonicTruth";
import type { GoldFile } from "./tier1Harness";
type Mode="legacy-closed"|"expanded-bounded"|"factorized"|"shortcut-factorized";
const modes:readonly Mode[]=["legacy-closed","expanded-bounded","factorized","shortcut-factorized"];
const templates=[
 ["maj",[0,4,7]],["min",[0,3,7]],["dim",[0,3,6]],["aug",[0,4,8]],
 ["maj7",[0,4,7,11]],["min7",[0,3,7,10]],["dom7",[0,4,7,10]],
 ["min7b5",[0,3,6,10]],["dim7",[0,3,6,9]],["six",[0,4,7,9]],
 ["min6",[0,3,7,9]],["sixNine",[0,2,4,7,9]],["sus2",[0,2,7]],
 ["sus4",[0,5,7]],["dom7sus4",[0,5,7,10]],["add9",[0,2,4,7]],
 ["maj9",[0,2,4,7,11]],["min9",[0,2,3,7,10]],
 ["dom9",[0,2,4,7,10]],["min11",[0,2,3,5,7,10]],
 ["dom13",[0,2,4,7,10,9]],
] as const;
const pc=(n:number)=>(n%12+12)%12;
export interface Candidate {root:number;quality:string;bass:number;score:number;factors:readonly string[]}
function factors(root:number,observed:Set<number>,expected:Set<number>):string[]{
 const out:string[]=[];if(!observed.has(root))out.push("no-root");if(expected.has(pc(root+7))&&!observed.has(pc(root+7)))out.push("no5");
 for(const [degree,name] of [[1,"b9"],[2,"9"],[3,"#9"],[5,"11"],[6,"#11"],[8,"b13"],[9,"13"]] as const)if(observed.has(pc(root+degree))&&!expected.has(pc(root+degree)))out.push(name);
 return out;
}
export function generateCandidates(notes:readonly number[],mode:Mode):Candidate[]{
 if(!notes.length)return [];
 const observed=new Set(notes.map(pc)),bass=pc(Math.min(...notes));const rows:Candidate[]=[];
 for(let root=0;root<12;root++)for(const [quality,intervals] of templates){
  const expected=new Set(intervals.map(i=>pc(root+i)));const hit=[...observed].filter(x=>expected.has(x)).length,missing=[...expected].filter(x=>!observed.has(x)).length,extra=observed.size-hit;
  const score=hit/Math.max(1,observed.size)-0.12*missing-0.09*extra+(bass===root?0.08:expected.has(bass)?0.03:0);
  if(mode==="legacy-closed" && (missing>0||extra>0))continue;
  if(mode==="expanded-bounded" && (missing>1||extra>1))continue;
  rows.push({root,quality,bass,score,factors:mode==="legacy-closed"||mode==="expanded-bounded"?[]:factors(root,observed,expected)});
 }
 rows.sort((a,b)=>b.score-a.score||a.root-b.root||a.quality.localeCompare(b.quality));
 const cap=mode==="legacy-closed"?48:mode==="expanded-bounded"?96:mode==="factorized"?240:160;
 if(mode==="shortcut-factorized"){
  const simple=rows.filter(x=>x.factors.length===0).slice(0,32),tail=rows.filter(x=>x.factors.length>0).slice(0,128);
  return [...simple,...tail].sort((a,b)=>b.score-a.score).slice(0,cap);
 }
 return rows.slice(0,cap);
}
interface Metric { events:number; structuralRecall:number; top3:number; top1:number; maxCandidates:number; meanCandidates:number; runtimeMs:number; noCandidates:number }
const blank=():Metric=>({events:0,structuralRecall:0,top3:0,top1:0,maxCandidates:0,meanCandidates:0,runtimeMs:0,noCandidates:0});
function tally(out:Metric,notes:readonly number[],targets:readonly {root:number;quality:string;bass:number}[],mode:Mode):void {
 const t=performance.now(),rows=generateCandidates(notes,mode);out.runtimeMs+=performance.now()-t;out.events++;out.maxCandidates=Math.max(out.maxCandidates,rows.length);out.meanCandidates+=rows.length;if(!rows.length)out.noCandidates++;
 const match=(c:Candidate)=>targets.some(g=>g.root===c.root&&g.quality===c.quality&&g.bass===c.bass);
 if(rows.some(match))out.structuralRecall++;if(rows.slice(0,3).some(match))out.top3++;if(rows[0]&&match(rows[0]))out.top1++;
}
function sourceNotes(file:GoldFile,start:number,end:number):number[]{const raw=parseMidi(file.bytes);return [...new Set(raw.notes.filter(n=>n.startTick/raw.ticksPerBeat<end&&(n.startTick+n.durationTick)/raw.ticksPerBeat>start).map(n=>n.pitch))].sort((a,b)=>a-b);}
export function evaluateRepresentations(files:readonly GoldFile[]):Record<Mode,Metric>{
 const result=Object.fromEntries(modes.map(mode=>[mode,blank()])) as Record<Mode,Metric>;
 for(const file of files)for(const event of file.events){const chord=parseChordLabel(event.chordSymbol);if(!chord)continue;const notes=sourceNotes(file,event.startBeat,event.endBeat);for(const mode of modes)tally(result[mode],notes,[{root:chord.root,quality:chord.quality,bass:chord.bass??chord.root}],mode);}
 for(const out of Object.values(result))out.meanCandidates/=out.events;return result;
}
export function evaluateHarmonicExamples():Record<Mode,Metric>{const result=Object.fromEntries(modes.map(mode=>[mode,blank()])) as Record<Mode,Metric>;for(const gold of harmonicGoldExamples)for(const mode of modes)tally(result[mode],gold.notes,gold.identities,mode);for(const out of Object.values(result))out.meanCandidates/=out.events;return result;}
