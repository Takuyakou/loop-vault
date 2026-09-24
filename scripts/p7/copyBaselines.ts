/** Frozen P7.0-06 source-note copy controls. No chord inference or Gold-conditioned note selection. */
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import type { ChordTimelineItem } from "../../src/domain/types";
import type { GoldFile } from "./tier1Harness";
export type CopyArm="Copy-Oracle"|"Copy-Simple"|"Copy-ProductBoundary";
export interface CopyResult { events:number; exact:number; truePositive:number; predicted:number; gold:number; boundaryHits:number; boundaries:number; goldBoundaries:number }
const blank=():CopyResult=>({events:0,exact:0,truePositive:0,predicted:0,gold:0,boundaryHits:0,boundaries:0,goldBoundaries:0});
const start=(p:ChordTimelineItem)=>(p.bar-1)*4+p.beat-1;
function plan(file:GoldFile,arm:CopyArm):Array<{start:number;end:number;notes:number[]}>{
 if(arm==="Copy-Oracle")return file.events.map(e=>({start:e.startBeat,end:e.endBeat,notes:[...e.goldVoicingMidi]}));
 const parsed=parseMidi(file.bytes);const end=Math.max(...parsed.notes.map(n=>(n.startTick+n.durationTick)/parsed.ticksPerBeat));
 const starts=arm==="Copy-Simple"?Array.from({length:Math.ceil(end)},(_,i)=>i):analyzeMidi(file.bytes,{enablePresentationGrouping:false}).fullTimeline.map(start).filter(v=>v>=0&&v<end);
 const points=[...new Set([0,...starts,end])].sort((a,b)=>a-b);
 return points.slice(0,-1).map((s,i)=>{const e=points[i+1]!;const notes=[...new Set(parsed.notes.filter(n=>{
  const ns=n.startTick/parsed.ticksPerBeat,ne=(n.startTick+n.durationTick)/parsed.ticksPerBeat;
  return Math.max(0,Math.min(ne,e)-Math.max(ns,s))>0;
 }).map(n=>n.pitch))].sort((a,b)=>a-b);return {start:s,end:e,notes};});
}
export function evaluateCopyBaseline(files:readonly GoldFile[],arm:CopyArm):CopyResult {
 const out=blank();for(const file of files){const segments=plan(file,arm);const boundaries=segments.slice(1).map(s=>s.start),goldBoundaries=file.events.slice(1).map(e=>e.startBeat);out.boundaries+=boundaries.length;out.goldBoundaries+=goldBoundaries.length;out.boundaryHits+=boundaries.filter(p=>goldBoundaries.some(g=>Math.abs(g-p)<.001)).length;
 for(const event of file.events){out.events++;const mid=(event.startBeat+event.endBeat)/2;const actual=segments.find(s=>s.start<=mid&&s.end>mid)?.notes??[];const gold=new Set(event.goldVoicingMidi),candidate=new Set(actual);const tp=[...candidate].filter(n=>gold.has(n)).length;out.truePositive+=tp;out.predicted+=candidate.size;out.gold+=gold.size;if(tp===gold.size&&candidate.size===gold.size)out.exact++;}}
 return out;
}
