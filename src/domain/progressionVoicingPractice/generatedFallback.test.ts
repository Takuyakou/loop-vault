import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { resolveProgressionPracticeVoicings, progressionPracticePlaybackNotes } from "./voicingResolution";
import { STYLE_VOICING_REGISTER } from "../voicingPractice/register";
import type { ProgressionVoicingPracticeSnapshot, ProgressionVoicingSelection } from "./types";
function snapshot(labels: string[], selection: ProgressionVoicingSelection): ProgressionVoicingPracticeSnapshot {
 return {version:1,fingerprint:"public-p11-fallback",selection,source:{kind:"vault",reference:{ideaId:"public",blockId:"public-block"}},bpm:120,meter:{numerator:4,denominator:4},lengthBeats:labels.length*4,
 events:labels.map((label,i)=>({id:`e${i}`,startBeat:i*4,durationBeats:4,chord:parseChordLabel(label)!})),spans:labels.map((_,i)=>({kind:"chord",eventIndex:i,startBeat:i*4,durationBeats:4}))};
}
describe("P11 explicit detailed shape fallback",()=>{
 it.each(["teacher","core"] as const)("keeps supported shape notes and substitutes only failures using %s",study=>{
  for(const selection of ["basic-shell","full-shell","rootless-shell","left-hand"] as const){
   const input=snapshot(["Ebmaj7","Cm7","Ebadd9/G"],selection),before=JSON.stringify(input);
   const original=resolveProgressionPracticeVoicings(input);
   const mixed=resolveProgressionPracticeVoicings(input,{detailedFallbackStudy:study});
   expect(mixed.events.slice(0,2)).toEqual(original.events.slice(0,2));
   expect(mixed.events[2]).toMatchObject({status:"SUPPORTED",shapeFallback:{from:selection,study},voicing:{explanation:{study}}});
   expect(JSON.stringify(input)).toBe(before);
   const direct=resolveProgressionPracticeVoicings(snapshot(["Ebadd9/G"],"basic-full"),{lessonStudyCategory:study,lessonProgressionOptimization:false});
   if(mixed.events[2]!.status==="SUPPORTED"&&direct.events[0]!.status==="SUPPORTED")expect(mixed.events[2]!.voicing).toEqual(direct.events[0]!.voicing);
  }
 });
 it("ends the chain at the chosen study if hand constraints reject it too",()=>{
  const result=resolveProgressionPracticeVoicings(snapshot(["Ebadd9/G"],"basic-shell"),{detailedFallbackStudy:"core",maxRightHandSpanSemitones:0});
  expect(result.events[0]).toMatchObject({status:"UNSUPPORTED_RULE"});
  expect(result.events[0]).not.toHaveProperty("shapeFallback");
 });
});
describe("P11 bass voice, not merely bass membership",()=>{
 const families = [
  ["Eb7", "G", "Bb", "Db"], ["Ebmaj7", "G", "Bb", "D"],
  ["Ebm7", "Gb", "Bb", "Db"], ["Ebm7b5", "Gb", "A", "Db"],
  ["Eb6", "G", "Bb", "D"], ["Eb6/9", "G", "Bb", "D"],
  ["Ebadd9", "G", "Bb", "D"],
 ] as const;
 for(const [label, third, fifth, seventh] of families)it(`${label}: root, 3rd, 5th, 7th, 9th and non-chord bass across every generated path`,()=>{
  for(const bass of ["Eb",third,fifth,seventh,"F","E"])for(const selection of ["basic-shell","full-shell","rootless-shell","left-hand","basic-full"] as const)for(const study of ["teacher","core"] as const)
  for(const leftHandVariant of (selection === "left-hand" ? ["auto", "A", "B"] as const : ["auto"] as const))
  for(const modifier of (selection === "basic-full" ? [{color:false,open:false},{color:true,open:false},{color:false,open:true},{color:true,open:true}] : [{color:false,open:false}])) {
   const input=snapshot([`${label}/${bass}`],selection);
   const options=selection==="basic-full"
    ? {lessonStudyCategory:study,lessonColorEnabled:modifier.color,lessonOpenEnabled:modifier.open}
    : {detailedFallbackStudy:study,leftHandVariant};
   const result=resolveProgressionPracticeVoicings(input,options).events[0]!;
   expect(result.status).toBe("SUPPORTED");if(result.status!=="SUPPORTED")continue;
   const v=result.voicing,notes=progressionPracticePlaybackNotes(v),bassVoice=v.referenceBassNote??v.bassNote;
   expect(bassVoice).toBeDefined();expect(bassVoice).toBe(Math.min(...notes));expect(bassVoice!%12).toBe(input.events[0]!.chord.bass);
   expect(new Set(notes).size).toBe(notes.length);
   for(const [hand, lower, upper] of [[v.leftHandNotes??[],STYLE_VOICING_REGISTER.leftHandMin,STYLE_VOICING_REGISTER.leftHandMax],[v.rightHandNotes??[],STYLE_VOICING_REGISTER.rightHandMin,STYLE_VOICING_REGISTER.rightHandMax]] as const)if(hand.length){
    expect(Math.max(...hand)-Math.min(...hand)).toBeLessThanOrEqual(12);
    expect(Math.min(...hand)).toBeGreaterThanOrEqual(lower);expect(Math.max(...hand)).toBeLessThanOrEqual(upper);
   }
  }
 });
});
