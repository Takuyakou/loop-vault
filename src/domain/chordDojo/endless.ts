import {BUILTINS} from './builtins';

/**
 * P12.3 §8–10: random-key endless practice of one standard progression.
 * Everything here is a pure function on screen state: nothing is saved, and the time is always passed in.
 */
export interface EndlessResult {key:number;sec?:number;hint:boolean;self:boolean;skipped:boolean}
export interface EndlessState {
 builtinId:string;seed:number;
 /** From 1. */
 round:number;
 /** Keys finished in this round (0–11). The key on the screen is `bag[pos]`. */
 pos:number;
 bag:number[];key:number;
 chordIndex:number;
 /** Cards whose name is shown (matched, hinted, answer shown, played). */
 revealed:number[];
 hinted:boolean;manual:boolean;
 phase:'ready'|'active'|'clear'|'paused'|'summary';
 startedAt?:number;clearedAt?:number;
 results:EndlessResult[];
}

function mulberry32(seed:number){let a=seed|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/** The 12 keys in a shuffled order (Fisher–Yates). The first key is never `previous`. */
export function createKeyBag(seed:number,previous?:number):number[]{
 const random=mulberry32(seed),bag=Array.from({length:12},(_,i)=>i);
 for(let i=11;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
 if(previous!==undefined&&bag[0]===previous)[bag[0],bag[1]]=[bag[1],bag[0]];
 return bag;
}

const chordCount=(builtinId:string)=>BUILTINS.find(b=>b.id===builtinId)?.chords.length??0;
const withName=(revealed:number[],index:number)=>revealed.includes(index)?revealed:[...revealed,index];

export function startEndless(builtinId:string,seed:number,manual:boolean):EndlessState{
 const bag=createKeyBag(seed+1);
 return {builtinId,seed,round:1,pos:0,bag,key:bag[0],chordIndex:0,revealed:[],hinted:false,manual,phase:'ready',results:[]};
}
export function activate(state:EndlessState,now:number):EndlessState{return state.phase==='ready'?{...state,phase:'active',startedAt:now}:state;}
/** Showing a card's name. In a MIDI session, showing the current or a later card makes this key a hint key. */
export function revealChord(state:EndlessState,index:number):EndlessState{
 return {...state,revealed:withName(state.revealed,index),hinted:state.hinted||(!state.manual&&index>=state.chordIndex)};
}
/** The current card was played. `eventAt` is the time of the Note On/Off that completed it (the settle wait is not included). */
export function matchChord(state:EndlessState,eventAt:number):EndlessState{
 const revealed=withName(state.revealed,state.chordIndex),chordIndex=state.chordIndex+1;
 if(chordIndex<chordCount(state.builtinId))return {...state,revealed,chordIndex};
 const sec=state.hinted||state.manual||state.startedAt===undefined?undefined:Math.round((eventAt-state.startedAt)/100)/10;
 const result:EndlessResult={key:state.key,...(sec===undefined?{}:{sec}),hint:state.hinted,self:state.manual,skipped:false};
 return {...state,revealed,chordIndex,phase:'clear',clearedAt:eventAt,results:[...state.results,result]};
}
/** The Y / N buttons of a self-judged session. N changes nothing. */
export function selfJudge(state:EndlessState,ok:boolean,now:number):EndlessState{return ok?matchChord(state,now):state;}
/** The next key: position + 1, and a new bag when the round is over. `manual` decides how the next key is judged. */
export function nextKey(state:EndlessState,manual:boolean):EndlessState{
 let {round,pos,bag}=state;pos+=1;
 if(pos>=12){round+=1;pos=0;bag=createKeyBag(state.seed+round,state.key);}
 return {...state,round,pos,bag,key:bag[pos],chordIndex:0,revealed:[],hinted:false,manual,phase:'ready',startedAt:undefined,clearedAt:undefined};
}
export function skipKey(state:EndlessState):EndlessState{
 const result:EndlessResult={key:state.key,hint:state.hinted,self:state.manual,skipped:true};
 return nextKey({...state,results:[...state.results,result]},state.manual);
}
export function pause(state:EndlessState):EndlessState{return {...state,phase:'paused'};}
/** The same key again from the first card; what was shown stays shown. */
export function resumeSameKey(state:EndlessState):EndlessState{return {...state,chordIndex:0,phase:'ready',startedAt:undefined};}
export function switchToSelf(state:EndlessState):EndlessState{return {...state,manual:true,chordIndex:0,phase:'active'};}
export function finish(state:EndlessState):EndlessState{return {...state,phase:'summary'};}

export interface EndlessSummary {cleared:number;noHint:number;avgSec?:number;slow:EndlessResult[]}
export function summarize(results:readonly EndlessResult[]):EndlessSummary{
 const noHintRows=results.filter(r=>!r.skipped&&!r.hint&&!r.self);
 const secs=noHintRows.map(r=>r.sec).filter((s):s is number=>s!==undefined);
 const candidates=results.filter(r=>!r.self);
 const slow=[
  ...candidates.filter(r=>r.skipped),
  ...candidates.filter(r=>!r.skipped&&r.hint),
  ...candidates.filter(r=>!r.skipped&&!r.hint&&r.sec!==undefined).sort((a,b)=>b.sec!-a.sec!),
 ].slice(0,3);
 return {cleared:results.filter(r=>!r.skipped).length,noHint:noHintRows.length,...(secs.length?{avgSec:Math.round(secs.reduce((a,b)=>a+b,0)/secs.length*10)/10}:{}),slow};
}
