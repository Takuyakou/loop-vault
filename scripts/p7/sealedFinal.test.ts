import { describe,expect,it } from "vitest";
import { evaluateFinalCohort } from "./sealedFinal";
import { syntheticFiles } from "./tier1Harness";
describe("sealed final aggregate contract",()=>{
 it("reports only aggregate, category, and paired summaries on known public fixtures",()=>{
  const result=evaluateFinalCohort(syntheticFiles());expect(result.configurationsEvaluated).toBe(23);expect(result.categories).toBe(13);expect(Object.keys(result.categoryAggregates)).toHaveLength(13);expect(result.overall["Copy-Oracle"]?.exact).toBe(22);expect(JSON.stringify(result)).not.toContain("goldVoicingMidi");
 });
});
