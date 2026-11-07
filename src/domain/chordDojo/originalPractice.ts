import data from './originalPractice.json';
import type {ChordQuality,ChordSymbol} from '../types';
import {NAMES,pc} from './recipes';

/**
 * P12.5-02: "Original Practice". The answer is the real voicing taken from the player's own MIDI
 * (originalPractice.json), not a shape from the table, and notes outside it are ignored when judging.
 * The reference key is E♭ major; every note moves by the same number of semitones for another key.
 */
export const ORIGINAL_GROUP_NAME='Original Practice';
/** The key the notes are written in (E♭). */
export const ORIGINAL_TONIC=3;
/** The shift is kept in −6…+5 so that the range never goes far up or down. */
export const ORIGINAL_SHIFTS=[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5] as const;
export const originalShiftOf=(tonic:number)=>((pc(tonic-ORIGINAL_TONIC)+6)%12)-6;
export const originalTonicOf=(shift:number)=>pc(ORIGINAL_TONIC+shift);
/** The twelve keys in the order of the keyboard (C, D♭ … B), each with its shift from E♭. */
export const ORIGINAL_KEYS=Array.from({length:12},(_,tonic)=>({tonic,shift:originalShiftOf(tonic)}));

interface CardSpec{root:number;quality:ChordQuality;suffix:string;degree:string;bass?:number}
/** By the label written in the JSON: how the card is named, what degree it is (E♭ = I) and how it is spelt as a chord. */
const SPECS:Record<string,CardSpec>={
 Fm11:{root:5,quality:'min11',suffix:'m11',degree:'ii11'},
 Bb7sus4:{root:10,quality:'dom7sus4',suffix:'7sus4',degree:'V7sus4'},
 Bb9:{root:10,quality:'dom9',suffix:'9',degree:'V9'},
 Ebmaj9:{root:3,quality:'maj9',suffix:'maj9',degree:'Imaj9'},
 Edim7:{root:4,quality:'dim7',suffix:'dim7',degree:'♯idim7'},
 'Cadd9/E':{root:0,quality:'add9',suffix:'add2',degree:'VIadd9/♯I',bass:4},
};
export interface OriginalCard{
 label:string;degree:string;chord:ChordSymbol;
 /** What must be held (struck + held). */expected:number[];
 /** What must be pressed again after the card begins. */struck:number[];
 /** What may be kept held from the previous card (inside `expected`). */carried:number[];
 left:number[];right:number[];
 /** Where the card sits in the original, and how its notes were spread (for playing the card as it was played). */
 startBeat:number;durationBeats:number;offsets:{pitch:number;offsetBeats:number;durationBeats:number;velocity:number}[];
}
export interface OriginalProgression{id:string;title:string;name:string;tempoBpm:number;bars:number;cards:OriginalCard[];degrees:string[]}
interface RawEvent{index:number;startBeat:number;durationBeats:number;label:string;expectedPitches:number[];expectedNames:string[];leftHand:string[];rightHand:string[];heldFromPrevious:string[];struck:{name:string;pitch:number;offsetBeats:number;durationBeats:number;velocity:number}[]}
interface RawProgression{id:string;title:string;tempoBpm:number;bars:number;events:RawEvent[]}
const RAW=(data as unknown as {progressions:RawProgression[]}).progressions;

function card(e:RawEvent,shift:number):OriginalCard{
 const spec=SPECS[e.label];if(!spec)throw new Error(`Original Practice: no spec for ${e.label}`);
 const at=(names:string[])=>names.map(n=>e.expectedPitches[e.expectedNames.indexOf(n)]!+shift);
 const bass=spec.bass===undefined?undefined:pc(spec.bass+shift);
 const root=pc(spec.root+shift);
 const label=NAMES[root]+spec.suffix+(bass===undefined?'':`/${NAMES[bass]}`);
 return {label,degree:spec.degree,chord:{root,quality:spec.quality,tensions:[],...(bass===undefined?{}:{bass}),label},
  expected:e.expectedPitches.map(n=>n+shift),struck:e.struck.map(s=>s.pitch+shift),carried:at(e.heldFromPrevious),left:at(e.leftHand),right:at(e.rightHand),
  startBeat:e.startBeat,durationBeats:e.durationBeats,offsets:e.struck.map(s=>({pitch:s.pitch+shift,offsetBeats:s.offsetBeats,durationBeats:s.durationBeats,velocity:s.velocity}))};
}
/** `shift`: semitones from E♭ (−6…+5). Every pitch moves by it; the names are spelt with the app's flat names. */
function originalProgression(raw:RawProgression,shift:number):OriginalProgression{
 const cards=raw.events.map(e=>card(e,shift));
 return {id:raw.id,title:raw.title,name:raw.title.replace(/^\d+\s+/,''),tempoBpm:raw.tempoBpm,bars:raw.bars,cards,degrees:cards.map(c=>c.degree)};
}
export const ORIGINAL_IDS:string[]=RAW.map(r=>r.id);
export const isOriginalId=(id:string)=>ORIGINAL_IDS.includes(id);
export function buildOriginal(id:string,shift=0):OriginalProgression{
 const raw=RAW.find(r=>r.id===id);if(!raw)throw new Error(`Original Practice: unknown ${id}`);
 if(!ORIGINAL_SHIFTS.includes(shift as typeof ORIGINAL_SHIFTS[number]))throw new Error(`Original Practice: shift ${shift} is outside −6…+5`);
 return originalProgression(raw,shift);
}
export const originalTitle=(id:string)=>RAW.find(r=>r.id===id)!.title;
/** The record key of a progression (the same shape as the standard progressions, so it sits in the same table). */
export const originalRecordKey=(id:string)=>`builtin:${id}:1`;
/** The next key for 「ランダムキー」: one of the keys played through the fewest times in this session, never the current one. */
export function pickOriginalShift(played:Readonly<Record<number,number>>,current:number,random:number):number{
 const pool=ORIGINAL_SHIFTS.filter(s=>s!==current),count=(s:number)=>played[originalTonicOf(s)]??0,least=Math.min(...pool.map(count));
 const bag=pool.filter(s=>count(s)===least);return bag[Math.min(bag.length-1,Math.floor(random*bag.length))]!;
}
/** Total laps played through (完奏) over every key, from the record. */
export const totalLaps=(laps:Readonly<Record<string,{count:number}>>|undefined)=>Object.values(laps??{}).reduce((n,l)=>n+l.count,0);
