import type {FingeringRankingOptions} from '../../domain/progressionFingering';
import type {FingeringPreferenceCollection} from '../../voicingPractice/fingeringPreferences';
import type {ThemeLesson,LessonChord} from '../../domain/chordDojo/lessonModel';
import {snapshotRevision} from '../../domain/chordDojo/targetSnapshot';
import {dojoFingerings} from './fingering';
/** Only an adapter and a frozen display cache. Hands and finger numbers come from production. */
export function freezeLessonDisplay(input:ThemeLesson,at:string,options:FingeringRankingOptions={},preferences?:FingeringPreferenceCollection,bpm=80):ThemeLesson {
 if(input.frozenAt)return input;
 const lesson=structuredClone(input),themePlans=dojoFingerings(lesson.chords,options,preferences,bpm);
 const freeze=(chord:LessonChord,plan:ReturnType<typeof dojoFingerings>[number]|undefined)=>{
  chord.referenceHands=plan?{lh:[...plan.hands.left],rh:[...plan.hands.right]}:undefined;
  chord.displayFingers=[];
  for(const [midi,label] of plan?.labels??[])for(const hand of ['left','right'] as const){const match=label.match(new RegExp((hand==='left'?'L':'R')+'([1-5])'));if(match)chord.displayFingers.push({midi,hand,finger:Number(match[1])});}
 };
 lesson.chords.forEach((chord,i)=>freeze(chord,themePlans[i]));
 const groups=new Map<string,typeof lesson.targets>();for(const target of lesson.targets){const key=target.taskKey+':'+target.composition;groups.set(key,[...(groups.get(key)??[]),target]);}
 for(const group of groups.values()){
  const first=group[0],related=lesson.related.find(r=>r.taskKey===first.taskKey&&r.kind==='voicing');
  const sourcePlans=first.taskKey===lesson.source.key?themePlans:related?[themePlans[related.chordIndices[0]]]:dojoFingerings(group.map(t=>t.chord),options,preferences,bpm);
  group.forEach((target,i)=>{freeze(target.chord,sourcePlans[i]);target.revision=snapshotRevision(target.chord);});
 }
 lesson.frozenAt=at;return lesson;
}
export function frozenDisplay(chord:LessonChord){
 if(!chord.referenceHands||!chord.displayFingers)return;
 const labels=new Map<number,string>();for(const {midi,hand,finger} of chord.displayFingers){const value=(hand==='left'?'L':'R')+finger,previous=labels.get(midi);labels.set(midi,previous?previous+'/'+value:value);}
 return {labels,hands:{left:chord.referenceHands.lh,right:chord.referenceHands.rh}};
}

export function freezeLegacyDisplay(targets:ThemeLesson['targets'],options:FingeringRankingOptions={},preferences?:FingeringPreferenceCollection,bpm=80){const result=structuredClone(targets);const groups=new Map<string,typeof result>();for(const t of result){const key=t.taskKey+':'+t.composition;groups.set(key,[...(groups.get(key)??[]),t]);}for(const group of groups.values()){const plans=dojoFingerings(group.map(t=>t.chord),options,preferences,bpm);group.forEach((t,i)=>{if(t.chord.displayFingers)return;const plan=plans[i];t.chord.referenceHands=plan?{lh:[...plan.hands.left],rh:[...plan.hands.right]}:undefined;t.chord.displayFingers=[];for(const [midi,label] of plan?.labels??[])for(const hand of ['left','right'] as const){const m=label.match(new RegExp((hand==='left'?'L':'R')+'([1-5])'));if(m)t.chord.displayFingers.push({midi,hand,finger:Number(m[1])});}t.revision=snapshotRevision(t.chord);});}return result;}
