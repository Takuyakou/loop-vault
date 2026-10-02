import { parseChordLabel } from "../../src/domain/chords";
import { resolveProgressionPracticeVoicings, type ProgressionVoicingPracticeSnapshot, type ProgressionVoicingSelection, type ResolveProgressionPracticeVoicingsOptions } from "../../src/domain/progressionVoicingPractice";
import { assignPracticeHandsAcrossProgression, isPracticeHandAssignmentPlayable } from "../../src/voicingPractice/fingeringDisplay";
import { loadFingeringPreferences, savePersonalFingering, resetPersonalFingering, type FingeringPreferenceCollection } from "../../src/voicingPractice/fingeringPreferences";
import { computeNextMoves, fixedFingerSlots } from "../../src/voicingPractice/nextMove";
import { generateFingeringCandidates } from "../../src/domain/progressionFingering";
import { viewFunctions } from "./privateAccess";
export const emptyPreferences: FingeringPreferenceCollection = {version:1,entries:[]};
export function syntheticSnapshots() {
  const labels=["Cmaj7","Dm7","G7","Cmaj7"];
  const generated: ProgressionVoicingPracticeSnapshot={version:1,fingerprint:"p11-12-public-generated",source:{kind:"vault",reference:{ideaId:"public-audit",blockId:"public-audit"}},selection:"basic-full",bpm:120,meter:{numerator:4,denominator:4},lengthBeats:16,
    events:labels.map((label,i)=>({id:`event-${i}`,startBeat:i*4,durationBeats:4,chord:parseChordLabel(label)!})),
    spans:labels.map((_,i)=>({kind:"chord",eventIndex:i,startBeat:i*4,durationBeats:4})),
  };
  const plan=resolveProgressionPracticeVoicings(generated,{lessonStudyCategory:"teacher"});
  const result: Partial<Record<ProgressionVoicingSelection,ProgressionVoicingPracticeSnapshot>>={"basic-full":generated};
  for(const selection of ["saved","source-midi","custom"] as const) result[selection]={...generated,selection,fingerprint:`p11-12-public-${selection}`,events:generated.events.map((e,i)=>{
    const v=plan.events[i]!;if(v.status!=="SUPPORTED")throw Error("Generated fixture unsupported");
    return {...e,voicing:{kind:selection,midiNotes:v.voicing.midiNotes,bassNote:v.voicing.bassNote}};
  })};
  for(const selection of ["basic-shell","full-shell","rootless-shell","left-hand"] as const)result[selection]={...generated,selection,fingerprint:`p11-12-public-${selection}`};
  return result;
}
export function project(snapshot:ProgressionVoicingPracticeSnapshot,preferences=emptyPreferences,options:ResolveProgressionPracticeVoicingsOptions={}) {
  const plan=resolveProgressionPracticeVoicings(snapshot,options);
  const voicings=plan.events.map(e=>e.status==="SUPPORTED"?e.voicing:undefined);
  const hands=assignPracticeHandsAcrossProgression(snapshot.selection,voicings);
  const ranked={left:viewFunctions.rankFingeringsForHand(snapshot,hands,snapshot.selection,"left",preferences),right:viewFunctions.rankFingeringsForHand(snapshot,hands,snapshot.selection,"right",preferences)};
  const frames=snapshot.events.map((event,i)=>{
    const suggested=Object.fromEntries((["left","right"] as const).map(hand=>[hand,ranked[hand].find(r=>r.id===event.id)])) as {left:typeof ranked.left[number]|undefined;right:typeof ranked.right[number]|undefined};
    const effective={left:viewFunctions.effectiveFingering(suggested.left,preferences),right:viewFunctions.effectiveFingering(suggested.right,preferences)};
    const labels=new Map<number,string>();
    viewFunctions.addKeyboardFingerLabels(labels,effective.left,"L");viewFunctions.addKeyboardFingerLabels(labels,effective.right,"R");
    return {eventId:event.id,hands:hands[i]!,suggested,effective,keyboardLabels:Object.fromEntries(labels),cardLabels:{left:viewFunctions.fingerSummary(effective.left,"L",hands[i]!.left.length,"unavailable"),right:viewFunctions.fingerSummary(effective.right,"R",hands[i]!.right.length,"unavailable")}};
  });
  return {selection:snapshot.selection,notes:voicings.map(v=>v?.midiNotes),hands,playable:voicings.map((v,i)=>v?isPracticeHandAssignmentPlayable(v.midiNotes,hands[i]!):false),frames,
    moves:frames.map((f,i)=>{const next=(i+1)%frames.length;const moves=computeNextMoves(f.hands,frames[next]!.hands,f.effective,frames[next]!.effective);return {from:i,to:next,moves,slots:fixedFingerSlots(moves)};})};
}
export function personalAudit() {
  // Generated hand assignments are explicit: isolates post-ranker overwrite from split optimization.
  const snapshot=syntheticSnapshots()["basic-full"]!;
  const options={lessonStudyCategory:"teacher" as const};
  const before=project(snapshot,emptyPreferences,options);
  const target=before.frames[1]!.effective.right!;
  const candidates=generateFingeringCandidates({hand:"right",midiPitches:target.pitches});
  if(candidates.status!=="supported")throw Error("fixture");
  const alternate=candidates.candidates.find(c=>c.fingers.join()!==target.fingers.join())!;
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const saved=savePersonalFingering(emptyPreferences,{hand:"right",pitches:target.pitches,fingers:alternate.fingers},storage,()=>0);
  const reloaded=loadFingeringPreferences(storage);
  const during=project(snapshot,reloaded,options);
  const after=project(snapshot,resetPersonalFingering(reloaded,target.signature,storage),options);
  // Separate source split experiment: saved preferences can bias assignment by -100.
  const freeSnapshot=syntheticSnapshots()["source-midi"]!;
  const freeBefore=project(freeSnapshot);
  const notes=[...freeBefore.notes[1]!].sort((a,b)=>a-b);
  const existingCount=freeBefore.hands[1]!.left.length;
  const alternativeCount=Array.from({length:Math.min(5,notes.length)+1},(_,i)=>i).find(i=>i>0&&i!==existingCount&&notes.length-i<=5)!;
  const left=notes.slice(0,alternativeCount);
  const leftCandidates=generateFingeringCandidates({hand:"left",midiPitches:left});
  if(leftCandidates.status!=="supported")throw Error("fixture");
  const splitPreference=savePersonalFingering(emptyPreferences,{hand:"left",pitches:left,fingers:leftCandidates.candidates[0]!.fingers},storage,()=>0);
  const freeAfter=project(freeSnapshot,splitPreference);
  return {saved,reloaded,targetEvent:1,before,during,after,freeAssignment:{before:freeBefore,after:freeAfter,preference:splitPreference}};
}
