import {buildPracticeChordRequirements} from '../practice/chordRequirements';
import {matchPerformance} from '../practice/matchPerformance';
import type {ChordSymbol} from '../types';
import {pc,NAMES} from './recipes';
export type Judge='shape'|'exact'|'core'|'composition';
export interface Target {notes:readonly number[];chord:ChordSymbol;judge:Judge;bass?:'self'|'external';top?:number;}
const sorted=(ns:readonly number[])=>[...new Set(ns)].sort((a,b)=>a-b);
export function judgeChord(target:Target,input:readonly number[]):{ok:boolean;message:string}{
 const ns=sorted(input),expected=sorted(target.notes),a=sorted(ns.map(pc)),b=sorted(expected.map(pc));
 if(!ns.length)return {ok:false,message:'構成の音を弾いてください'};
 if(target.judge==='core'){
  const requirements=buildPracticeChordRequirements(target.chord,'normal');
  // P12.4-02: a written bass that is not a chord tone (D over C) is part of the answer, not an extra note.
  const bassPc=pc(target.chord.bass??target.chord.root);
  const allowed=requirements.allowedPitchClasses.includes(bassPc)?requirements:{...requirements,allowedPitchClasses:[...requirements.allowedPitchClasses,bassPc]};
  const r=matchPerformance({...allowed,requiredBassPitchClass:bassPc},{heldMidiNotes:ns,sustainedMidiNotes:[],attackRevision:1,timestampMs:0});
  if(r.state==='match')return {ok:true,message:'合いました'};
  if(r.foreignPitchClasses.length)return {ok:false,message:`余分な音 ${NAMES[r.foreignPitchClasses[0]]} があります`};
  if(!r.bassMatches)return {ok:false,message:`一番下の音が ${NAMES[pc(ns[0])]}（${NAMES[pc(target.chord.bass??target.chord.root)]} を指定）`};
  return {ok:false,message:`${NAMES[r.missingPitchClasses[0]??0]} がありません`};
 }
 const foreign=a.find(n=>!b.includes(n)),missing=b.find(n=>!a.includes(n));
 if(foreign!==undefined)return {ok:false,message:`余分な音 ${NAMES[foreign]} があります`};
 if(missing!==undefined)return {ok:false,message:`${NAMES[missing]} がありません`};
 if(target.judge==='composition')return {ok:true,message:'合いました'};
 if(target.judge==='exact'){return ns.join(',')===expected.join(',')?{ok:true,message:'合いました'}:{ok:false,message:'音は合っています。音域（鍵盤の位置）が違います'};}
 if(target.bass==='external'?pc(ns[0])===target.chord.root:pc(ns[0])!==target.chord.root)return {ok:false,message:'一番下の音が指定と違います'};
 if(target.top!==undefined&&pc(ns[ns.length-1]!)!==target.top)return {ok:false,message:'一番上の音が指定と違います'};
 if(ns.length!==expected.length||ns.slice(1).some((n,i)=>pc(n)!==pc(expected[i+1])))return {ok:false,message:'音は合っています。上声部の並びが違います'};
 const shift=ns[0]-expected[0];if(shift%12!==0||ns.some((n,i)=>n-expected[i]!==shift))return {ok:false,message:'音は合っています。音域の広がりが違います'};
 return {ok:true,message:'合いました'};
}
export function requiredCount(target:Target){return target.judge==='core'?buildPracticeChordRequirements(target.chord,'normal').requiredPitchClasses.length:target.judge==='composition'?new Set(target.notes.map(pc)).size:target.notes.length;}
export class ChordEntry {
 readonly held=new Map<string,number>();
 snapshot:number[]=[];lastOnMs?:number;deadlineMs?:number;done=false;
 constructor(readonly count:number,readonly settleMs:number){}
 event(channel:number,note:number,on:boolean,at:number){
  if(this.done)return;const k=channel+':'+note;
  if(on){this.held.set(k,note);this.lastOnMs=at;this.snapshot=sorted([...this.held.values()]);this.deadlineMs=this.snapshot.length>=this.count?at+this.settleMs:undefined;}
  else {this.held.delete(k);/* Preserve the full pre-release candidate until its deadline. */if(this.deadlineMs===undefined&&this.held.size===0){this.snapshot=[];this.lastOnMs=undefined;}}
 }
 poll(at:number){if(this.done||this.deadlineMs===undefined||at<this.deadlineMs)return undefined;this.done=true;return {notes:[...this.snapshot],lastOnMs:this.lastOnMs!};}
}
