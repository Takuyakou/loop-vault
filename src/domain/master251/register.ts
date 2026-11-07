import {targetForCell,withCells,type CellKey,type MasterTarget,type MasterRange,type MasterProgress,type MasterStore} from './model';
export const MASTER_RANGE_LABELS={original:'原音域','octave-down':'1オクターブ下'} as const;
const lowerTargets=new Map<CellKey,MasterTarget>();
/** A register layer only: canonical pitches/hands/fingers and harmony never change. */
export function targetForMasterRange(cell:CellKey,range:MasterRange='original'):MasterTarget {
 const original=targetForCell(cell);if(range==='original')return original;
 let target=lowerTargets.get(cell);if(!target){
  const down=(notes:readonly number[])=>notes.map(n=>{const midi=n-12;if(!Number.isInteger(midi)||midi<0||midi>127)throw Error('Master register exceeds MIDI range');return midi;});
  target={...original,octaveOffset:-12,chords:original.chords.map(c=>({...c,notes:down(c.notes),referenceHands:{lh:down(c.referenceHands.lh),rh:down(c.referenceHands.rh)}})) as unknown as MasterTarget['chords']};lowerTargets.set(cell,target);
 }return target;
}
export function selectedMasterRange(store?:MasterStore):MasterRange{return store?.selectedRange??'original';}
/** Original progress stays at its legacy location. A new range cannot inherit a grade or cursor. */
export function masterProgressForRange(store:MasterStore,range:MasterRange=selectedMasterRange(store)):MasterProgress {
 if(range==='octave-down')return withCells(store.octaveDown);
 const progress={...store};delete progress.selectedRange;delete progress.octaveDown;return withCells(progress);
}
export function withMasterRangeProgress(store:MasterStore,range:MasterRange,progress:MasterProgress):MasterStore {
 return range==='original'?{...progress,selectedRange:range,...(store.octaveDown?{octaveDown:store.octaveDown}:{})}:{...store,octaveDown:progress,selectedRange:range};
}
