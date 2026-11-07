import type {ChordSymbol} from '../types';
import {pc} from './recipes';
export type NoteHand='left'|'right'|'unknown';
export interface WrittenPitch {step:'C'|'D'|'E'|'F'|'G'|'A'|'B';alter:number;octave:number;}
export interface SnapshotNote {id:string;midi:number;hand:NoteHand;spelling:WrittenPitch;finger?:number;}
export interface TargetSnapshot {targetId:string;revision:string;midiNotes:readonly number[];bass?:number;chordSymbol:string;keyContext?:string;notes:readonly SnapshotNote[];representative?:boolean;}
export interface TargetDisplayPlan {hands?:{left:readonly number[];right:readonly number[]};labels?:ReadonlyMap<number,string>;}
const STEPS=['C','D','E','F','G','A','B'] as const;
const NATURAL=[0,2,4,5,7,9,11];
const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const DEGREES:Record<string,Record<number,number>>={
 maj:{0:0,4:2,7:4},min:{0:0,3:2,7:4},maj7:{0:0,4:2,7:4,11:6},maj9:{0:0,2:1,4:2,7:4,11:6},
 sixNine:{0:0,2:1,4:2,7:4,9:5},min7:{0:0,3:2,7:4,10:6},min9:{0:0,2:1,3:2,7:4,10:6},min6:{0:0,3:2,7:4,9:5},
 dom7:{0:0,4:2,7:4,10:6},dom9:{0:0,2:1,4:2,7:4,10:6},dom13:{0:0,2:1,4:2,7:4,9:5,10:6},
 dom7sus4:{0:0,5:3,7:4,10:6},min7b5:{0:0,3:2,6:4,10:6},dim7:{0:0,3:2,6:4,9:6},sus4:{0:0,5:3,7:4},aug:{0:0,4:2,8:4},dim:{0:0,3:2,6:4},
};
const TENSIONS:Record<string,[number,number]>={'9':[2,1],b9:[1,1],'#9':[3,1],'11':[5,3],'#11':[6,3],'13':[9,5],b13:[8,5],'#5':[8,4]};
function token(text:string){const m=/^([A-G])([#b♯♭]{0,2})/.exec(text);if(!m)return;return {step:m[1] as WrittenPitch['step'],alter:[...m[2]].reduce((n,c)=>n+(c==='#'||c==='♯'?1:-1),0)};}
export const writtenMidi=(p:WrittenPitch)=>(p.octave+1)*12+NATURAL[STEPS.indexOf(p.step)]+p.alter;
function pitch(midi:number,step:WrittenPitch['step'],alter:number):WrittenPitch {const octave=(midi-NATURAL[STEPS.indexOf(step)]-alter)/12-1;return {step,alter,octave};}
export function spellMidi(midi:number,chord:ChordSymbol,keyContext?:string):WrittenPitch {
 const root=token(chord.label),validRoot=root&&pc(NATURAL[STEPS.indexOf(root.step)]+root.alter)===chord.root?root:token(SHARP[chord.root])!;
 const bassText=chord.label.split('/')[1],bass= bassText?token(bassText):undefined;
 if(bass&&chord.bass!==undefined&&pc(midi)===chord.bass&&pc(NATURAL[STEPS.indexOf(bass.step)]+bass.alter)===chord.bass)return pitch(midi,bass.step,bass.alter);
 const degrees={...DEGREES[chord.quality]};
 for(const t of chord.tensions??[]){const x=TENSIONS[t];if(x)degrees[x[0]]=x[1];}
 const degree=degrees[pc(midi-chord.root)];
 if(degree!==undefined){const step=STEPS[(STEPS.indexOf(validRoot.step)+degree)%7];let alter=pc(midi-NATURAL[STEPS.indexOf(step)]);if(alter>6)alter-=12;if(Math.abs(alter)<=2)return pitch(midi,step,alter);}
 const preference=(keyContext??chord.label).includes('b')||(keyContext??chord.label).includes('♭')?FLAT:SHARP;
 const fallback=token(preference[pc(midi)])!;return pitch(midi,fallback.step,fallback.alter);
}
export function snapshotRevision(value:unknown){let hash=2166136261;for(const c of JSON.stringify(value))hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(16).padStart(8,'0');}
/** The exact target pitches and production display plan are the only inputs. No chord-to-voicing generation. */
export function targetSnapshot(targetId:string,chord:ChordSymbol,midiNotes:readonly number[],plan?:TargetDisplayPlan,keyContext?:string,representative=false):TargetSnapshot {
 const occurrences=new Map<number,number>();
 const notes=midiNotes.map((midi,index)=>{const occurrence=occurrences.get(midi)??0;occurrences.set(midi,occurrence+1);
  const left=plan?.hands?.left.includes(midi),right=plan?.hands?.right.includes(midi);
  const hand:NoteHand=left&&right?(occurrence===0?'left':'right'):left?'left':right?'right':'unknown';
  const label=plan?.labels?.get(midi),match=label?.match(new RegExp((hand==='left'?'L':hand==='right'?'R':'!')+'([1-5])'));
  return {id:targetId+':note:'+index,midi,hand,spelling:spellMidi(midi,chord,keyContext),...(match?{finger:Number(match[1])}:{})};
 });
 return {targetId,revision:snapshotRevision({midiNotes,notes,chord,keyContext}),midiNotes:[...midiNotes],bass:midiNotes.length?Math.min(...midiNotes):undefined,chordSymbol:chord.label,keyContext,notes,representative};
}

/** A physical key may show both hand labels; duplicates keep their own staff note IDs. */
export function snapshotFingerLabels(snapshot:TargetSnapshot|undefined){if(!snapshot)return;const result=new Map<number,string>();for(const note of snapshot.notes){if(!note.finger||note.hand==='unknown')continue;const label=(note.hand==='left'?'左':'右')+note.finger,prior=result.get(note.midi);if(!prior)result.set(note.midi,label);else if(!prior.split('/').includes(label))result.set(note.midi,prior+'/'+label);}return result;}
