import {type MasterCell,type Attempt} from './model';
export const DEFAULT_POLICY={settleMs:60,partialTimeoutMs:1200,successFeedbackMs:450,failureFeedbackMs:1600,tempoLadder:[40,50,60,70,80] as readonly number[],initialBpm:60,initialRecallSec:5,intermediateRecallSec:3,adaptiveMinSec:1.5,adaptiveMaxSec:5,previewNext:false,reviewDays:14};
export type MasterPolicy=typeof DEFAULT_POLICY;
const day=(at:string)=>{const d=new Date(at);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;};
export function recallThreshold(cell:MasterCell,policy=DEFAULT_POLICY){const ns=cell.recent.filter(r=>r.ok&&!r.usedHint&&r.recallSec!==undefined).map(r=>r.recallSec!).sort((a,b)=>a-b);if(ns.length<3)return policy.initialRecallSec;if(ns.length<8)return policy.intermediateRecallSec;return Math.max(policy.adaptiveMinSec,Math.min(policy.adaptiveMaxSec,ns[Math.floor((ns.length-1)*.75)]*1.25));}
export function recordAttempt(cell:MasterCell,attempt:Attempt,mode:'learn'|'recall'|'tempo',policy=DEFAULT_POLICY):MasterCell {
 attempt={...attempt,usedHint:attempt.usedHint||mode==='learn'};
 const next:MasterCell={...cell,attempts:cell.attempts+1,successes:cell.successes+Number(attempt.ok),lastAt:attempt.at,recent:[...cell.recent,attempt].slice(-20)};
 const independent=attempt.ok&&!attempt.usedHint,fast=attempt.recallSec!==undefined&&attempt.recallSec<=recallThreshold(cell,policy),qualifies=independent&&mode==='tempo'&&attempt.bpm===80&&fast;
 if(attempt.ok){next.lastSuccessAt=attempt.at;if(independent)next.nextReviewAt=new Date(Date.parse(attempt.at)+policy.reviewDays*86400000).toISOString();if(independent&&attempt.recallSec!==undefined)next.bestRecallSec=Math.min(cell.bestRecallSec??Infinity,attempt.recallSec);
  if(cell.status==='new')next.status='learning';
  if(independent&&mode==='recall')next.learnedAt=cell.learnedAt??attempt.at;
  if(independent&&mode==='recall'&&fast){next.status=cell.status==='master'?'master':'passed';next.currentBpm=cell.currentBpm??policy.initialBpm;}
  if(independent&&mode==='tempo'){const i=policy.tempoLadder.indexOf(attempt.bpm??policy.initialBpm);next.currentBpm=policy.tempoLadder[Math.min(policy.tempoLadder.length-1,i+1)];if(cell.status!=='master')next.status='passed';}
  if(qualifies){if(cell.qualifiedAt&&day(cell.qualifiedAt)!==day(attempt.at))next.status='master';next.qualifiedAt=attempt.at;if(cell.reviewDue&&cell.reviewFailedAt&&day(cell.reviewFailedAt)!==day(attempt.at)){next.reviewDue=false;next.reviewFailedAt=undefined;}}
 } else {
  if(cell.status==='master'){if(cell.reviewDue&&cell.reviewFailedAt&&day(cell.reviewFailedAt)!==day(attempt.at)){next.status='passed';next.reviewDue=false;next.reviewFailedAt=undefined;next.qualifiedAt=undefined;}else {next.reviewDue=true;next.reviewFailedAt=cell.reviewFailedAt??attempt.at;}}
  if(mode==='tempo'&&cell.status!=='master'){const i=policy.tempoLadder.indexOf(attempt.bpm??policy.initialBpm);next.currentBpm=policy.tempoLadder[Math.max(0,i-1)];}
 }
 return next;
}
export function modeFor(cell:MasterCell):'learn'|'recall'|'tempo'{return cell.status==='new'?'learn':cell.currentBpm?'tempo':'recall';}
