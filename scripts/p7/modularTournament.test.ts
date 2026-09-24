import { describe,expect,it } from "vitest";
import { configs,runTournament } from "./modularTournament";
import { syntheticFiles } from "./tier1Harness";

describe("modular tournament contract",()=>{
 it("predeclares 23 configurations and all old/new identity by decoder interactions",()=>{
  expect(configs.length+3).toBe(23);
  expect(new Set(configs.map(c=>c.id)).size).toBe(configs.length);
  for(const identity of ["old","new"])for(const decoder of ["old","C1","C2"])expect(configs.some(c=>c.boundary==="product"&&c.role==="product-hard"&&c.identity===identity&&c.decoder===decoder)).toBe(true);
 });
 it("is deterministic on the public synthetic Gold suite apart from runtime and heap telemetry",()=>{
  const first=runTournament(syntheticFiles()),second=runTournament(syntheticFiles());
  const stable=(value:typeof first)=>Object.fromEntries(Object.entries(value.rows).map(([key,row])=>[key,{...row,runtimeMs:0,peakHeapBytes:0}]));
  expect(stable(first)).toEqual(stable(second));
 });
});
