import { describe, expect, it } from "vitest";
import { normalizedIdentity } from "../p7/harmonicTruth";
import { validateTier2Gold } from "./tier2Scorer";
import { rankingCases, unknownCases } from "./rankingAuthoredGold";
import { p86Factors, rankLocal, sourceCandidates, type RankingPolicy } from "./localRankingV2";
const policies: RankingPolicy[]=["OLD","PITCH_BASS","FACTOR_NO_CONTEXT","FACTOR_CONTEXT"];
describe("P9.5 source-only local ranking",()=>{
  it("keeps authored Gold independent and split diverse",()=>{
    expect(rankingCases.filter((row)=>row.split==="dev")).toHaveLength(14);
    expect(rankingCases.filter((row)=>row.split==="validation")).toHaveLength(7);
    expect(new Set(rankingCases.map((row)=>row.category)).size).toBeGreaterThan(8);
    expect(rankingCases.flatMap((row)=>validateTier2Gold(row.gold))).toEqual([]);
    expect(unknownCases.filter((row)=>row.split==="dev")).toHaveLength(3);
  });
  it("preserves exactly the same candidate membership under each ranking policy",()=>{
    for(const row of rankingCases){
      const candidates=sourceCandidates(row.source);
      const expected=candidates.map((item)=>normalizedIdentity({root:item.root,quality:item.quality,bass:item.bass,
        factors:p86Factors(item,row.source.map((note)=>note.pitch))})).sort();
      for(const policy of policies){
        const ranked=rankLocal(row.source,candidates,policy);
        expect(ranked.candidates.map((item)=>normalizedIdentity(item.identity)).sort()).toEqual(expected);
        expect(ranked.candidates.every((item)=>Number.isFinite(item.score))).toBe(true);
      }
    }
  });
  it("retains short passing chords as eligible candidates with no duration rejection",()=>{
    for(const row of rankingCases.filter((item)=>item.category==="short-passing")){
      const result=rankLocal(row.source,sourceCandidates(row.source),"FACTOR_NO_CONTEXT");
      expect(result.unknown).toBe(false);
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });
  it("flags sparse evidence but retains Top-K for review",()=>{
    for(const row of unknownCases.filter((item)=>item.category==="insufficient-context")){
      const result=rankLocal(row.source,sourceCandidates(row.source),"FACTOR_NO_CONTEXT");
      expect(result.unknown).toBe(true);
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });
  it("keeps a ghost-bass candidate miss distinct from ranker loss",()=>{
    const row=rankingCases.find((item)=>item.id==="ghost-bass")!;
    const candidates=sourceCandidates(row.source);
    expect(candidates.every((candidate)=>candidate.bass!==row.gold.harmonic.identities[0]!.bass)).toBe(true);
    expect(rankLocal(row.source,candidates,"FACTOR_NO_CONTEXT").candidates).toHaveLength(candidates.length);
  });
  it("does not let prior context suppress a fully re-struck passing chord",()=>{
    const row=rankingCases.find((item)=>item.id==="half-beat-passing")!;
    const previous=rankLocal(row.previousSource!,sourceCandidates(row.previousSource!),"OLD").candidates[0]!.identity;
    const ranked=rankLocal(row.source,sourceCandidates(row.source),"FACTOR_CONTEXT",previous);
    expect(ranked.candidates[0]?.features.localContext).toBe(0);
  });
});
