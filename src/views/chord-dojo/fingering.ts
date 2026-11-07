import type {ChordSymbol,SavedProgressionBlock} from '../../domain/types';
import {buildProgressionVoicingPracticeSnapshot} from '../../domain/progressionVoicingPractice/snapshot';
import {normalizedChordKey} from '../../domain/voicing';
import {assignPracticeHandsAcrossProgression,isPracticeHandAssignmentPlayable} from '../../voicingPractice/fingeringDisplay';
import {rankPracticeHandFingerings} from '../../voicingPractice/rankPracticeFingerings';
import type {FingeringRankingOptions} from '../../domain/progressionFingering';
import type {FingeringPreferenceCollection} from '../../voicingPractice/fingeringPreferences';
export interface FingeringChord {chord:ChordSymbol;notes:readonly number[];beats:number;referenceHands?:{lh:readonly number[];rh:readonly number[]};}
/** Data adapter only: production Voicing Loop hand assignment and ranker remain the solver. */
export function dojoFingerings(chords:readonly FingeringChord[],options:FingeringRankingOptions={},preferences?:FingeringPreferenceCollection,bpm=80){
 if(!chords.length)return [];let beat=0;
 const block:SavedProgressionBlock={id:'12000000-0000-4000-8000-000000000031',summaryText:'',bpm,timeSignature:'4/4',capturedAt:'2026-10-05T00:00:00Z',tags:[],analyzerVersion:'dojo-fingering-display',chords:chords.map((c,i)=>{const start=beat;beat+=c.beats;return {eventId:`dojo-finger-${i}`,bar:Math.floor(start/4)+1,beat:start%4+1,durationBeats:c.beats,chord:c.chord,confidence:1,alternatives:[],warnings:[],voicingMemory:{practiceVoicingOverride:{schemaVersion:1,source:'manual',representation:'simultaneous-voicing',midiNotes:[...c.notes],capturedForChordKey:normalizedChordKey(c.chord)}}};})};
 const result=buildProgressionVoicingPracticeSnapshot({block,sourceReference:{ideaId:'12000000-0000-4000-8000-000000000032',blockId:block.id},selection:'custom'});if(!result.ok)return [];
 const hands=assignPracticeHandsAcrossProgression('custom',chords.map(c=>({origin:'custom',midiNotes:c.notes,bassNote:c.notes[0],addedColorDegrees:[],notes:[],leftHandNotes:c.referenceHands?.lh,rightHandNotes:c.referenceHands?.rh})),preferences);
 const left=rankPracticeHandFingerings(result.snapshot,hands,'custom','left',preferences,options,[],bpm),right=rankPracticeHandFingerings(result.snapshot,hands,'custom','right',preferences,options,[],bpm);
 return chords.map((c,i)=>{const labels=new Map<number,string>();if(isPracticeHandAssignmentPlayable(c.notes,hands[i]))for(const [entries,prefix] of [[left,'L'],[right,'R']] as const){const entry=entries[i];if(entry?.status==='supported')entry.pitches.forEach((note,index)=>{const next=`${prefix}${entry.fingers[index]}`,prior=labels.get(note);labels.set(note,prior?`${prior}/${next}`:next);});}return {labels,hands:hands[i]};});
}
export const showDojoFingers=(stage:string|undefined,answer:boolean,composition:boolean)=>answer&&!composition&&stage!=='tempo';
export const showMasterFingers=(prompt:boolean,answer:boolean,hintLevel:number)=>prompt&&(answer||hintLevel>0);
