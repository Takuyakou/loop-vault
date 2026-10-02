import { describe, it, expect } from "vitest";
import { generateFingeringCandidates, rankCyclicFingerings } from "../../src/domain/progressionFingering";
import { costs, viewFunctions } from "./privateAccess";
import { evaluate, eventsOf, namedCases } from "./fixtures";
import { personalAudit } from "./integration";

describe("P11-12 diagnostic accounting (not Gold fingering)",()=>{
  it("reconstructs public local costs from exact extracted private functions",()=>{
    for(const hand of ["left","right"]as const)for(const notes of [[48],[48,52],[48,49,55],[48,52,55,59],[48,50,52,55,59]]){
      const g=generateFingeringCandidates({hand,midiPitches:notes});if(g.status!=="supported")throw Error("fixture");
      for(const c of g.candidates)expect(costs.priorCost(c.fingers,costs.preferredFingers({hand,midiPitches:notes},notes).fingers)+costs.spacingCost(notes,c.fingers,hand)).toBeCloseTo(c.localCost,12);
    }
  });
  it("agrees with exhaustive two-event cyclic cost minimization without asserting any finger Gold",()=>{
    for(const c of namedCases().filter(c=>c.notes.length===2)){
      const r=evaluate(c);const gs=eventsOf(c).map(generateFingeringCandidates);
      if(gs[0]!.status!=="supported"||gs[1]!.status!=="supported")throw Error("fixture");
      const a=gs[0],b=gs[1];let best=Infinity;
      for(let i=0;i<a.candidates.length;i++)for(let j=0;j<b.candidates.length;j++)best=Math.min(best,a.candidates[i]!.localCost+b.candidates[j]!.localCost+costs.transitionCost(a,i,b,j)+costs.transitionCost(b,j,a,i));
      expect(r.totalScore).toBeCloseTo(best,12);
      expect(r.notesUnchanged).toBe(true);
    }
  });
  it("uses physical-signature persistence and the real effective anchored result",()=>{
    const r=personalAudit();expect(r.reloaded).toEqual(r.saved);expect(r.after).toEqual(r.before);
    const entry=r.reloaded.entries[0]!;const value=rankCyclicFingerings([{id:"public",hand:entry.hand,midiPitches:entry.pitches}],{anchors:new Map([["public",entry]])})[0];
    expect(viewFunctions.effectiveFingering(value,r.reloaded)?.fingers).toEqual(entry.fingers);
  });
});
