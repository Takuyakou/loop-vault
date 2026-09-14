import { describe, expect, it } from "vitest";
import { generateFingeringCandidates, physicalVoicingSignature } from "./progressionFingering";
const chord=(root:number,quality:"maj"|"min",label:string)=>({root,quality,tensions:[] as const,label});
describe("progression fingering candidates",()=>{
 it("matches guide triad and generic priors",()=>{ const root=generateFingeringCandidates({hand:"right",midiPitches:[60,64,67],chord:chord(0,"maj","C")}); const second=generateFingeringCandidates({hand:"left",midiPitches:[55,60,64],chord:chord(0,"maj","C/G")}); expect(root.status==="supported"?root.candidates[0]!.fingers:[]).toEqual([1,3,5]); expect(second.status==="supported"?second.candidates[0]!.fingers:[]).toEqual([5,2,1]); });
 it("bounds candidate counts and rejects more than five",()=>{ expect([1,2,3,4,5].map(n=>{const r=generateFingeringCandidates({hand:"right",midiPitches:Array.from({length:n},(_,i)=>60+i)}); return r.status==="supported"?r.candidates.length:0;})).toEqual([5,10,10,5,1]); expect(generateFingeringCandidates({hand:"right",midiPitches:[60,61,62,63,64,65]})).toEqual({status:"unavailable",reason:"too-many-keys"}); });
 it("normalizes without mutating and is deterministic",()=>{const p=[67,60,64,60]; const a=generateFingeringCandidates({hand:"left",midiPitches:p}); const b=generateFingeringCandidates({hand:"left",midiPitches:p}); expect(a).toEqual(b); expect(p).toEqual([67,60,64,60]); expect(physicalVoicingSignature("left",p)).toBe("L:60,64,67");});
});
