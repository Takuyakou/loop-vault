import { describe, expect, it } from "vitest";
import { generateFingeringCandidates, rankCyclicFingerings, type ProgressionFingeringEvent } from "./progressionFingering";
import { handPositionCostModel, handPositionProxy, keyboardPositionProxy, rankHandPositionFingerings, timePressure, type HandPositionPolicy } from "./handPositionFingering";
const policy: HandPositionPolicy = {variant:"E1-T",lambda:0.5,curve:"inverse"};
const events = (notes:number[][], seconds=0.125):ProgressionFingeringEvent[] => notes.map((midiPitches,i)=>({id:String(i),hand:"left",midiPitches,startSeconds:i*seconds,durationSeconds:seconds}));
const fingers=(result:ReturnType<typeof rankHandPositionFingerings>)=>result.map(r=>r.status==="supported"?r.fingers:[]);
describe("P11-13b hand position and time",()=>{
  it("uses deterministic keyboard coordinates, median aggregation and mirrored finger offsets",()=>{
    for(let pitch=0;pitch<116;pitch++)expect(keyboardPositionProxy(pitch+12)-keyboardPositionProxy(pitch)).toBe(7);
    expect(keyboardPositionProxy(61)-keyboardPositionProxy(60)).toBe(0.5);
    expect(handPositionProxy("left",[48,52,55],[5,3,1])).toBe(handPositionProxy("right",[48,52,55],[1,3,5]));
    const pairs=[keyboardPositionProxy(48),keyboardPositionProxy(52)-2,keyboardPositionProxy(55)-4].sort((a,b)=>a-b);
    expect(handPositionProxy("left",[48,52,55],[5,3,1])).toBe(pairs[1]);
  });
  it("makes pressure monotonic, while a weak prior creates a real time-dependent tradeoff",()=>{
    for(const curve of ["inverse","sqrt","shifted-inverse"] as const){const values=[0,0.001,0.1,0.5,1,4,16].map(t=>timePressure(t,curve));expect(values.every((v,i)=>!i||v<=values[i-1]!)).toBe(true);}
    const notes=[[48],[50],[52],[53]];const fast=rankHandPositionFingerings(events(notes,0.125),policy),slow=rankHandPositionFingerings(events(notes,8),policy);
    expect(fingers(fast)).not.toEqual(fingers(slow));
    const movement=(r:typeof fast)=>r.reduce((s,v,i)=>{const n=r[(i+1)%r.length]!;return v.status==="supported"&&n.status==="supported"?s+Math.abs(handPositionProxy("left",n.pitches,n.fingers)-handPositionProxy("left",v.pitches,v.fingers)):s;},0);
    expect(movement(fast)).toBeLessThanOrEqual(movement(slow));
    for(const variant of ["E1-raw","E1-T-zero-prior"] as const)expect(fingers(rankHandPositionFingerings(events(notes,0.125),{...policy,variant}))).toEqual(fingers(rankHandPositionFingerings(events(notes,8),{...policy,variant})));
  });
  it("matches exhaustive cyclic minimization including the final event duration",()=>{
    const input=events([[48],[52,55]],0.5);const gs=input.map(generateFingeringCandidates);
    if(gs[0]!.status!=="supported"||gs[1]!.status!=="supported")throw Error("fixture");
    const [a,b]=gs,model=handPositionCostModel(policy);let minimum=Infinity;
    for(let i=0;i<a.candidates.length;i++)for(let j=0;j<b.candidates.length;j++)minimum=Math.min(minimum,model.local(input[0]!,a,i)+model.local(input[1]!,b,j)+model.transition(a,i,b,j,0.5)+model.transition(b,j,a,i,0.5));
    const ranked=rankHandPositionFingerings(input,policy);if(ranked[0]!.status!=="supported"||ranked[1]!.status!=="supported")throw Error("solver");
    const selected=fingers(ranked);
    const ai=a.candidates.findIndex(c=>c.fingers.join()===selected[0]!.join()),bi=b.candidates.findIndex(c=>c.fingers.join()===selected[1]!.join());
    expect(model.local(input[0]!,a,ai)+model.local(input[1]!,b,bi)+model.transition(a,ai,b,bi,0.5)+model.transition(b,bi,a,ai,0.5)).toBeCloseTo(minimum,12);
  });
  it("holds Saved even when costly; excludes unresolved segments from cycles and bridges empty hands",()=>{
    const source=events([[48],[50],[52]]);const g=generateFingeringCandidates(source[1]!);if(g.status!=="supported")throw Error("fixture");
    const before=rankHandPositionFingerings(source,policy);const alternate=g.candidates.find(c=>c.fingers.join()!==(before[1]!.status==="supported"?before[1]!.fingers.join():""))!;
    const saved=rankHandPositionFingerings(source,policy,{anchors:new Map([["1",{signature:g.signature,fingers:alternate.fingers}]])});
    expect(saved[1]).toMatchObject({fingers:alternate.fingers});expect([0,2].some(i=>JSON.stringify(saved[i])!==JSON.stringify(before[i]))).toBe(true);
    const barrier=events([[48],[50],[1,2,3,4,5,6],[52],[55]]);
    expect(rankHandPositionFingerings(barrier,policy).slice(0,2)).toEqual(rankHandPositionFingerings(barrier.slice(0,2),policy,{cyclic:false}));
    const empty=events([[48],[],[],[52]],1);expect(fingers(rankHandPositionFingerings(empty,policy)).filter(f=>f.length)).toEqual(fingers(rankHandPositionFingerings([empty[0]!,empty[3]!],policy,{loopDurationSeconds:4})));
  });
  it("preserves notes and candidate sets with repeat stability and deterministic reruns",()=>{
    for(const hand of ["left","right"] as const)for(let n=1;n<=5;n++){
      const notes=Array.from({length:n},(_,i)=>48+i*2);const input=events([notes,notes,notes]).map(e=>({...e,hand}));const source=JSON.stringify(input),candidates=input.map(generateFingeringCandidates);
      const result=rankHandPositionFingerings(input,policy);const arrays=fingers(result);
      expect(arrays.every(f=>f.join()===arrays[0]!.join())).toBe(true);
      expect(rankHandPositionFingerings(input,policy)).toEqual(result);expect(input.map(generateFingeringCandidates)).toEqual(candidates);expect(JSON.stringify(input)).toBe(source);
      expect(result.every(r=>r.status==="supported")).toBe(true);
      expect(rankCyclicFingerings(input).every(r=>r.status==="supported")).toBe(true);
    }
  });
});
