import { advisorEvaluationCases } from "../src/domain/progressionAdvisor/evaluationFixtures";
import { summarizeAdvisorEvaluations } from "../src/domain/progressionAdvisor/evaluation";
import { validateAdvisorResponse } from "../src/domain/progressionAdvisor/validateAdvisorResponse";

const cases = advisorEvaluationCases();
const results = cases.map((entry) => validateAdvisorResponse(entry.response));
const mismatches = cases.filter((entry, index) => results[index]?.success !== entry.expectedValid).map((entry) => entry.id);
const report = {
  schemaVersion: 1,
  fixtureCount: cases.length,
  ...summarizeAdvisorEvaluations(results),
  expectedValid: cases.filter((entry) => entry.expectedValid).length,
  expectedInvalid: cases.filter((entry) => !entry.expectedValid).length,
  mismatches,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (mismatches.length) process.exitCode = 1;
