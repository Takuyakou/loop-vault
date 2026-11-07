import {makeIdea} from '../domain/testFactory';
import type {SavedProgressionBlock} from '../domain/types';
/** Public synthetic list; includes a user-authored warning-like name and analyzer memo separately. */
export function dojoLongIdeas(){
 return [4,8,12,16,24,32,63,66].map((bars,i)=>{
  const origin=i===1?28:1;
  const block:SavedProgressionBlock={id:`12000000-0000-4000-8000-${String(i+101).padStart(12,'0')}`,summaryText:'C G',sourceFileName:'public-synthetic.mid',memo:i===0?'ambiguous-bass; ambiguous-quality':i===2?'ユーザー名 ambiguous-bass を含む進行':undefined,tags:['public-synthetic'],capturedAt:'2026-10-05T00:00:00.000Z',analyzerVersion:'synthetic',bpm:70,timeSignature:'4/4',sourceStartBeat:(origin-1)*4,sourceEndBeat:(origin-1+bars)*4,startBar:origin,endBar:origin+bars-1,
   chords:Array.from({length:bars},(_,n)=>({eventId:`public-${i}-${n}`,bar:origin+n,beat:1,durationBeats:4,confidence:1,alternatives:[],warnings:[],chord:{root:n%2?7:0,quality:'maj',tensions:[],label:n%2?'G':'C'}}))};
  return makeIdea({id:`12000000-0000-4000-8000-${String(i+201).padStart(12,'0')}`,title:i===7?'とても長い進行の名前・公開合成サンプル・'.repeat(12):`合成進行 ${bars}小節`,bpm:70,progressionBlocks:[block]});
 });
}
