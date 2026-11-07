import {afterDays,dateKey,emptyItem,type DojoStore,type ItemRecord} from './store';
export function weakKeys(item:ItemRecord,count:number,seed?:number){
 const latest=new Map<number,ItemRecord['recent'][number]>();for(const r of item.recent)if(r.key!==undefined&&(!latest.has(r.key)||r.at>=latest.get(r.key)!.at))latest.set(r.key,r);
 const rank=(k:number)=>{const r=latest.get(k),v=item.keys[k];return r&&(!r.ok||r.independent===false)?0:!v||v.self||v.lastSec===undefined?1:2;};
 return Array.from({length:12},(_,k)=>k).sort((a,b)=>rank(a)-rank(b)||((latest.get(b)?.sec??item.keys[b]?.lastSec??0)-(latest.get(a)?.sec??item.keys[a]?.lastSec??0))||(item.keys[a]?.lastAt??'').localeCompare(item.keys[b]?.lastAt??'')||(seed===undefined?a-b:(a-seed%12+12)%12-(b-seed%12+12)%12)).slice(0,count);
}
export function speedLimit(store:DojoStore){const all=[...Object.values(store.shapes),...Object.values(store.voicings)];const provisional=all.filter(i=>i.provisionalAt).length;if(provisional<3)return 5;const secs=all.flatMap(i=>i.recent.filter(r=>r.ok&&r.independent&&!r.self&&r.sec!==undefined)).sort((a,b)=>a.at.localeCompare(b.at)).slice(-20).map(r=>r.sec!).sort((a,b)=>a-b);if(secs.length<20)return 3;return Math.max(2,1.2*(secs[9]+secs[10])/2);}
export function applyAttempt(item:ItemRecord,kind:'shape'|'voicing'|'progression',input:{at:string;ok:boolean;sec?:number;self?:boolean;key:number;stage:'recall'|'tempo';answerSeen:boolean;limit:number},reviewDays:readonly number[]):ItemRecord{
 const next:ItemRecord=structuredClone(item);const independent=input.ok&&(input.self||!input.answerSeen&&(kind==='progression'||input.sec===undefined||input.sec<=input.limit));
 next.recent=[...next.recent,{at:input.at,ok:input.ok,sec:input.self?undefined:input.sec,self:input.self,key:input.key,independent}].slice(-20);
 if(!input.ok){next.state='new';delete next.provisionalAt;delete next.passedAt;next.nextCheckAt=afterDays(input.at,1);return next;}
 if(!independent)return next;
 if(kind==='shape'||kind==='progression')next.keys[input.key]={lastSec:input.self?undefined:input.sec,bestSec:input.self||input.sec===undefined?undefined:Math.min(input.sec,next.keys[input.key]?.bestSec??Infinity),lastAt:input.at,self:input.self};
 const day=dateKey(new Date(input.at));const failedAt=next.recent.map((r,i)=>r.ok?-1:i).reduce((a,b)=>Math.max(a,b),-1);const today=next.recent.slice(failedAt+1).filter(r=>r.ok&&r.independent&&dateKey(new Date(r.at))===day);
 const later=Boolean(item.provisionalAt&&dateKey(new Date(item.provisionalAt))<day);
 const keyCount=new Set(today.map(r=>r.key)).size;
 if(next.state==='new'&&(kind!=='shape'||keyCount>=3)){next.state='provisional';next.provisionalAt=input.at;next.nextCheckAt=afterDays(input.at,1);}
 if(!input.self&&later&&(kind==='shape'?keyCount>=4:kind==='progression'?input.stage==='tempo':true)){next.state='passed';next.passedAt=input.at;next.nextCheckAt=afterDays(input.at,reviewDays[0]);}
 if(kind==='shape'&&!input.self&&next.state==='passed'&&Array.from({length:12},(_,k)=>next.keys[k]).every(k=>k&&!k.self)){next.state='twelve-keys';next.nextCheckAt=afterDays(input.at,reviewDays[1]);}
 return next;
}
export function recallQuality(store:DojoStore,quality:string,ok:boolean,at:string){const previous=store.knownQualities[quality];const step=ok?Math.min(2,(previous?.recallStep??0)+1) as 0|1|2:0;return {...previous,at:previous?.at??at,lastRecallAt:at,recallStep:step,nextRecallAt:afterDays(at,ok?[7,30,90][step]:1)};}
export const newItem=emptyItem;
