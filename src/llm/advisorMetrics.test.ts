import { describe, expect, it } from "vitest";
import { readAdvisorRunMetrics, recordAdvisorRunMetric, summarizeAdvisorRunMetrics } from "./advisorMetrics";

function storage() {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, value: () => value };
}

describe("Advisor local metrics", () => {
  it("stores only operational metadata and summarizes usage", () => {
    const target = storage();
    recordAdvisorRunMetric({ requestId: "request-1", provider: "openai", model: "model", latencyMs: 120, retryCount: 1, status: "success", usage: { inputTokens: 10, outputTokens: 20 } }, target);
    const entries = readAdvisorRunMetrics(target);

    expect(entries).toHaveLength(1);
    expect(summarizeAdvisorRunMetrics(entries)).toEqual({ total: 1, successful: 1, failed: 0, averageLatencyMs: 120, inputTokens: 10, outputTokens: 20, retries: 1 });
    expect(target.value()).not.toContain("apiKey");
    expect(target.value()).not.toContain("response");
    expect(target.value()).not.toContain("prompt");
  });
});
