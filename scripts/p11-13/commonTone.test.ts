import { expect, it } from "vitest";
import { generateFingeringCandidates, rankCyclicFingerings, type ProgressionFingeringEvent, type SupportedCandidates } from "../../src/domain/progressionFingering";
import { handPositionCostModel, rankHandPositionFingerings } from "../../src/domain/handPositionFingering";
import { rankPracticeHandFingerings } from "../../src/voicingPractice/rankPracticeFingerings";
import { assignPracticeHandsAcrossProgression } from "../../src/voicingPractice/fingeringDisplay";
import { resolveProgressionPracticeVoicings } from "../../src/domain/progressionVoicingPractice";
import { syntheticSnapshots } from "../p11-12/integration";
import { COMMON_TONE_BASE, commonToneCostModel } from "./commonTone";

const events = (notes: number[][]): ProgressionFingeringEvent[] => notes.map((midiPitches,i)=>({id:String(i),hand:"right",midiPitches,startSeconds:i,durationSeconds:1}));
const group = (pitches: number[], hand: "left"|"right" = "right") => {
  const value=generateFingeringCandidates({hand,midiPitches:pitches});
  if(value.status!=="supported")throw Error("fixture");return value;
};
const index = (g: SupportedCandidates, fingers: number[]) => g.candidates.findIndex(c=>c.fingers.join()===fingers.join());

it("uses exact MIDI pitch and same hand; leaves base local and movement costs intact",()=>{
  const a=group([60,64,67]),b=group([60,65,69]);const base=handPositionCostModel(COMMON_TONE_BASE),soft=commonToneCostModel(0.5);
  const i=index(a,[1,3,5]),same=index(b,[1,3,5]),different=index(b,[2,4,5]);
  expect(soft.transition(a,i,b,same,1)-base.transition(a,i,b,same,1)).toBe(0);
  expect(soft.transition(a,i,b,different,1)-base.transition(a,i,b,different,1)).toBe(0.5);
  const octave=group([72,76,79]),left=group([60,64,67],"left");
  expect(soft.transition(a,i,octave,0,1)).toBe(base.transition(a,i,octave,0,1));
  expect(soft.transition(a,i,left,0,1)).toBe(base.transition(a,i,left,0,1));
});
it("gamma zero is the identical lambda2 policy; notes and candidates stay intact",()=>{
  const input=events([[60,61],[62,63],[60,63],[67,68]]);const original=JSON.stringify(input),candidates=input.map(generateFingeringCandidates);
  expect(rankCyclicFingerings(input,{costModel:commonToneCostModel(0)})).toEqual(rankHandPositionFingerings(input,COMMON_TONE_BASE));
  expect(JSON.stringify(input)).toBe(original);expect(input.map(generateFingeringCandidates)).toEqual(candidates);
});
it("soft preference permits forced finger changes and never overwrites Saved anchors",()=>{
  const input=events([[60],[60]]);const anchors=new Map([['0',{signature:"R:60",fingers:[1] as const}],['1',{signature:"R:60",fingers:[5] as const}]]);
  const result=rankCyclicFingerings(input,{costModel:commonToneCostModel(1),anchors});
  expect(result).toMatchObject([{status:"supported",fingers:[1]},{status:"supported",fingers:[5]}]);
});
it("retains segment barriers and empty-hand elapsed IOI with the injected preference",()=>{
  const input=events([[60],[],[64],[],[60,61,62,63,64,65],[67],[69]]);
  const times:number[]=[];const soft=commonToneCostModel(1);
  const model={...soft,transition:(a:SupportedCandidates,i:number,b:SupportedCandidates,j:number,seconds:number)=>{times.push(seconds);return soft.transition(a,i,b,j,seconds);}};
  const result=rankCyclicFingerings(input,{costModel:model});
  expect(result.slice(0,4)).toEqual(rankCyclicFingerings(input.slice(0,4),{costModel:soft,cyclic:false}));
  expect(result.slice(5)).toEqual(rankCyclicFingerings(input.slice(5),{costModel:soft,cyclic:false}));
  expect(result[4]!.status).toBe("unavailable");expect(new Set(times)).toEqual(new Set([1,2]));
});
it("Range metadata cannot alter full-progression input or selected fingerings in the product adapter",()=>{
  const snapshot=syntheticSnapshots()["source-midi"]!;
  const plan=resolveProgressionPracticeVoicings(snapshot);
  const hands=assignPracticeHandsAcrossProgression("source-midi",plan.events.map(e=>e.status==="SUPPORTED"?e.voicing:undefined));
  const before=JSON.stringify({snapshot,hands});
  for(const gamma of [0.125,0.25,0.5,1]) {
    const solve=(range?:{start:number;end:number})=>rankPracticeHandFingerings({...snapshot,...(range?{range}:{})},hands,"source-midi","right",undefined,{costModel:commonToneCostModel(gamma)});
    const baseline=solve();expect(solve({start:1,end:2})).toEqual(baseline);expect(solve({start:0,end:0})).toEqual(baseline);
  }
  expect(JSON.stringify({snapshot,hands})).toBe(before);
});
