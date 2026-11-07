import {HeldChordSettler} from '../practice/heldChordSettler';
import {type CellKey,type MasterTarget,type MasterRange} from './model';
import {targetForMasterRange} from './register';
import {DEFAULT_POLICY,type MasterPolicy} from './policy';
export type Mode='learn'|'recall'|'tempo';
export type Phase='ready'|'active'|'rest'|'feedback'|'paused';
export class Master251Engine {
 readonly target:MasterTarget;phase:Phase='ready';chordIndex=0;promptAt?:number;recallSec?:number;usedHint=false;hintLevel=0;ok?:boolean;message='';feedbackUntil=0;clockAt?:number;
 private settler?:HeldChordSettler;private matched=false;private currentNotes:number[]=[];
 private judgedNotes?:readonly number[];
 /** Display-only snapshot of a mismatch; never read by judging or persistence. */
 get lastJudgedNotes():readonly number[]|undefined{return this.judgedNotes;}
 constructor(readonly cell:CellKey,readonly mode:Mode,readonly bpm:number|undefined,readonly policy:MasterPolicy=DEFAULT_POLICY,readonly range:MasterRange='original'){this.target=targetForMasterRange(cell,range);}
 start(at:number,held:readonly number[]){if(this.phase!=='ready'||held.length)return false;this.phase='active';this.promptAt=at;this.arm();return true;}
 private arm(){this.judgedNotes=undefined;this.settler=new HeldChordSettler(this.target.chords[this.chordIndex].notes,this.policy.settleMs,this.policy.partialTimeoutMs);this.matched=false;}
 input(held:readonly number[],at:number,noteOn=false){this.tick(at);this.currentNotes=[...new Set(held)].sort((a,b)=>a-b);if(this.phase!=='active')return;this.settler?.observe(this.currentNotes,at,noteOn);}
 hint(){if(this.phase!=='active')return;this.usedHint=true;this.hintLevel=Math.min(4,this.hintLevel+1);}
 pause(){this.phase='paused';}
 private fail(at:number,message:string){this.ok=false;this.message=message;this.phase='feedback';this.feedbackUntil=at+this.policy.failureFeedbackMs;}
 private finish(at:number){this.ok=true;this.message='合いました';this.phase='feedback';this.feedbackUntil=at+this.policy.successFeedbackMs;}
 get beatMs(){return 60000/(this.bpm??80);}
 get chordMs(){return this.beatMs*this.target.beatsPerChord;}
 private mismatch(notes:readonly number[]){const expected=this.target.chords[this.chordIndex].notes;const extra=notes.filter(n=>!expected.includes(n)),missing=expected.filter(n=>!notes.includes(n));const samePc=extra.length&&missing.length&&extra.every(n=>missing.some(m=>m%12===n%12));return samePc?'音域（鍵盤の位置）が違います':extra.length?`余分な音があります（${extra.length}音）`:`不足する音があります（${missing.length}音）`;}
 tick(at:number){
  if(this.phase==='rest'){if(at>=this.clockAt!+4*this.chordMs)this.finish(at);return;}
  if(this.phase!=='active')return;
  // Poll before closing the slot: a candidate whose settle deadline is within the slot counts.
  const result=this.settler?.poll(at);
  if(result&&!this.matched){
   if(this.clockAt!==undefined&&result.settledAt>this.clockAt+(this.chordIndex+1)*this.chordMs){this.fail(at,'2拍の中で和音がそろいませんでした');return;}
   if(!result.exact){this.judgedNotes=Object.freeze([...result.notes]);this.fail(at,this.mismatch(result.notes));return;}
   if(this.chordIndex===0){if(result.completedOnMs===undefined){this.fail(at,'最初の和音をもう一度弾いてください');return;}this.recallSec=Math.max(0,(result.completedOnMs-this.promptAt!)/1000);}
   this.matched=true;
   if(this.mode==='tempo'&&this.bpm){if(this.chordIndex===0)this.clockAt=result.completedOnMs;}
   else if(this.chordIndex<2){this.chordIndex++;this.arm();return;}else {this.finish(at);return;}
  }
  if(this.mode==='tempo'&&this.clockAt!==undefined&&at>=this.clockAt+(this.chordIndex+1)*this.chordMs){
   if(!this.matched){this.fail(at,'2拍の中で和音がそろいませんでした');return;}
   if(this.chordIndex<2){this.chordIndex++;this.arm();}else this.phase='rest';
  }
 }
 get retry(){return !this.ok||this.usedHint;}
}
