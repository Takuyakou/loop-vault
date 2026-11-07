import {dateKey,emptyItem,type DojoStore,type ItemRecord} from '../../domain/chordDojo/store';
import {weakKeys} from '../../domain/chordDojo/progress';
import {snapshotRevision} from '../../domain/chordDojo/targetSnapshot';
import {composition,pc,type Quality} from '../../domain/chordDojo/recipes';
export function keyDisplay(record:ItemRecord|undefined,root:number,limit:number){
 const key=record?.keys[root];const recent=record?.recent.filter(r=>r.key===root).slice(-1)[0];
 if(recent&&(!key||recent.at>=key.lastAt)){
  if(!recent.ok)return {state:'pending',seconds:undefined} as const;
  if(recent.self)return {state:'self',seconds:undefined} as const;
  if(recent.sec!==undefined&&recent.sec>limit)return {state:'slow',seconds:recent.sec} as const;
  if(!recent.independent)return {state:'pending',seconds:undefined} as const;
  return {state:'fast',seconds:recent.sec} as const;
 }
 if(!key)return {state:'pending',seconds:undefined} as const;
 if(key.self)return {state:'self',seconds:undefined} as const;
 return {state:key.lastSec!==undefined&&key.lastSec>limit?'slow':'fast',seconds:key.lastSec} as const;
}
export function compositionTiles(root:number,quality:Quality){
 return composition(root,quality).map(note=>{const interval=pc(note-root);const extension=interval===2?14:interval===9&&quality==='dom13'?21:interval;
 const label=interval===9&&quality==='dim7'?'♭♭7':({0:'1',2:'9',3:'♭3',4:'3',5:quality==='dom7sus4'?'4':'11',6:'♭5',7:'5',9:quality==='dom13'?'13':'6',10:'♭7',11:'7'}[interval]??String(interval));return {note,label,order:extension};}).sort((a,b)=>a.order-b.order);
}
export function lastPracticedAt(record:ItemRecord){return record.recent.slice(-1)[0]?.at??record.passedAt??record.provisionalAt;}
export function daysSincePractice(record:ItemRecord,now:Date){const at=lastPracticedAt(record);return at?Math.max(0,Math.floor((now.getTime()-Date.parse(at))/86400000)):undefined;}

export function individualShapeKeys(store:DojoStore,key:string,now:Date){return weakKeys(store.shapes[key]??emptyItem(),3,parseInt(snapshotRevision(dateKey(now)+':'+store.startedAt+':'+key),16));}
