import data from './canonical-fingering.json' with {type:'json'};
import {cellKey,type MasterTarget} from './model';
import {masterTemplateFingers} from './canonicalTemplates';
const catalog=new Map(data.cells.map(c=>[c.cell,c]));
const cache=new WeakMap<MasterTarget,ReturnType<typeof build>>();
function build(target:MasterTarget){
 const row=catalog.get(cellKey(target.form,target.key));
 if(!row||row.chords.length!==target.chords.length)throw Error('Master fingering profile missing');
 return target.chords.map((chord,i)=>{
  const fixed=row.chords[i];
  const offset=target.octaveOffset??0,shift=(ns:readonly number[])=>ns.map(n=>n+offset);
  if(JSON.stringify(shift(fixed.notes))!==JSON.stringify(chord.notes)||JSON.stringify({lh:shift(fixed.referenceHands.lh),rh:shift(fixed.referenceHands.rh)})!==JSON.stringify(chord.referenceHands))throw Error('Master fingering target mismatch');
  const labels=new Map<number,string>();
  for(const [hand,prefix] of [['lh','L'],['rh','R']] as const){
   if(JSON.stringify(fixed.fingers[hand])!==JSON.stringify(masterTemplateFingers(target.form,target.key,hand,i)))throw Error('Master teaching template mismatch');
   if(fixed.fingers[hand].length!==chord.referenceHands[hand].length||fixed.fingers[hand].some(f=>!Number.isInteger(f)||f<1||f>5))throw Error('Master fingering profile invalid');
   chord.referenceHands[hand].forEach((midi,j)=>{const next=prefix+fixed.fingers[hand][j],prior=labels.get(midi);labels.set(midi,prior?prior+'/'+next:next);});
  }
  return {labels,hands:{left:chord.referenceHands.lh,right:chord.referenceHands.rh}};
 });
}
/** Fixed Master Form teaching templates for both hands; personal anchors stay in Voicing Loop. */
export function master251CanonicalFingerings(target:MasterTarget){let plans=cache.get(target);if(!plans){plans=build(target);cache.set(target,plans);}return plans;}
