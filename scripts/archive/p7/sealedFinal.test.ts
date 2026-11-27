import { describe,expect,it,vi } from "vitest";
import { evaluateFinalCohort } from "./sealedFinal";
import { syntheticFiles } from "./tier1Harness";

// P25 V41: this file's work takes seconds by itself; under load it passed vitest's 5 s default (FULL already allows 30 s).
vi.setConfig({ testTimeout: 30_000 });

describe("sealed final aggregate contract",()=>{
 it("reports only aggregate, category, and paired summaries on known public fixtures",()=>{
  const result=evaluateFinalCohort(syntheticFiles());expect(result.configurationsEvaluated).toBe(23);expect(result.categories).toBe(13);expect(Object.keys(result.categoryAggregates)).toHaveLength(13);expect(result.overall["Copy-Oracle"]?.exact).toBe(22);expect(JSON.stringify(result)).not.toContain("goldVoicingMidi");
 });
});
