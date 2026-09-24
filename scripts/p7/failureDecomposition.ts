import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseChordLabel } from "../../src/domain/chords";
import type { ChordTimelineItem } from "../../src/domain/types";
import { harmonyFiles, syntheticFiles, type GoldFile } from "./tier1Harness";

interface Counts { events:number; goldBoundaries:number; productBoundaries:number; boundaryHits:number; overSplit:number; underSplit:number; goldVoicingBoundaries:number; voicingBoundaryHits:number; top1:number; top3:number; candidateRecall:number; noCandidate:number; namingOnly:number; cardDelta:number; confidenceMarginSum:number; nearTie:number; marginCount:number; }
const empty=():Counts=>({events:0,goldBoundaries:0,productBoundaries:0,boundaryHits:0,overSplit:0,underSplit:0,goldVoicingBoundaries:0,voicingBoundaryHits:0,top1:0,top3:0,candidateRecall:0,noCandidate:0,namingOnly:0,cardDelta:0,confidenceMarginSum:0,nearTie:0,marginCount:0});
const start=(item:ChordTimelineItem)=> (item.bar-1)*4+item.beat-1;
const eq=(a:number,b:number)=>Math.abs(a-b)<0.001;
const label=(s:string)=>s.replace(/\s+/g,"").toLowerCase();
function measure(file:GoldFile,out:Counts):void {
 const product=analyzeMidi(file.bytes,{enablePresentationGrouping:false}).fullTimeline;
 const events=file.events;
 out.events+=events.length; out.cardDelta+=Math.abs(product.length-events.length);
 const goldStarts=events.slice(1).map(e=>e.startBeat), productStarts=product.slice(1).map(start);
 out.goldBoundaries+=goldStarts.length; out.productBoundaries+=productStarts.length;
 out.boundaryHits+=productStarts.filter(p=>goldStarts.some(g=>eq(g,p))).length;
 out.overSplit+=productStarts.filter(p=>!goldStarts.some(g=>eq(g,p))).length;
 out.underSplit+=goldStarts.filter(g=>!productStarts.some(p=>eq(g,p))).length;
 for(let i=1;i<events.length;i++) if(label(events[i]!.chordSymbol)===label(events[i-1]!.chordSymbol) && JSON.stringify([...events[i]!.goldVoicingMidi].sort((a,b)=>a-b))!==JSON.stringify([...events[i-1]!.goldVoicingMidi].sort((a,b)=>a-b))){out.goldVoicingBoundaries++;if(productStarts.some(p=>eq(p,events[i]!.startBeat)))out.voicingBoundaryHits++;}
 for(const event of events){
  const mid=(event.startBeat+event.endBeat)/2;
  const item=product.find(p=>start(p)<=mid && start(p)+p.durationBeats>mid);
  if(!item){out.noCandidate++;continue;}
  const candidates=[item.chord,...item.alternatives.map(a=>a.chord)];
  const rank=candidates.findIndex(c=>label(c.label)===label(event.chordSymbol));
  if(rank===0)out.top1++;
  if(rank>=0 && rank<3)out.top3++;
  if(rank>=0)out.candidateRecall++;
  const goldChord=parseChordLabel(event.chordSymbol);
  if(rank<0 && goldChord && candidates.some(c=>c.root===goldChord.root && c.quality===goldChord.quality && c.bass===goldChord.bass))out.namingOnly++;
  const second=item.alternatives[0]?.confidence;
  if(second!==undefined){const margin=item.confidence-second;out.confidenceMarginSum+=margin;out.marginCount++;if(margin<0.05)out.nearTie++;}
 }
}
function summarize(c:Counts){const p=c.productBoundaries ? c.boundaryHits/c.productBoundaries:1,r=c.goldBoundaries ? c.boundaryHits/c.goldBoundaries:1;return {...c,boundaryPrecision:p,boundaryRecall:r,boundaryF1:p+r?2*p*r/(p+r):0,top1Rate:c.top1/c.events,top3Rate:c.top3/c.events,candidateRecallRate:c.candidateRecall/c.events,meanMargin:c.marginCount?c.confidenceMarginSum/c.marginCount:null};}
function arg(n:string){const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];}
const split=arg("--split")??"dev";if(split!=="dev"&&split!=="validation")throw new Error("Only dev and validation are permitted.");
const c=arg("--corpus");if(!c)throw new Error("--corpus required");
const groups:{name:string,files:GoldFile[]}[]=[{name:"synthetic",files:syntheticFiles()},{name:"harmony-support-"+split,files:await harmonyFiles(c,split)}];
for(const g of groups){const counts=empty();for(const file of g.files)measure(file,counts);process.stdout.write(JSON.stringify({group:g.name,...summarize(counts)},null,2)+"\n");}
