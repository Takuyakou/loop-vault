import { describe, expect, it } from "vitest";
import { proposeBoundaries } from "./boundaryRoleScorer";
import { syntheticFiles } from "./tier1Harness";

describe("short passing chord boundary preservation",()=>{
 it("keeps both half-beat and one-beat passing chords in onset/lattice proposals",()=>{
  for(const [category,second] of [["half-beat-passing-chord",2.5],["one-beat-passing-chord",3]] as const){
   const file=syntheticFiles().find(f=>f.category===category);expect(file).toBeDefined();
   for(const mode of ["onset-cluster","lattice"] as const)expect(proposeBoundaries(file!,mode)).toEqual(expect.arrayContaining([2,second]));
  }
 });
});
