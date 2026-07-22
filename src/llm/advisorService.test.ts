import { describe, expect, it } from "vitest";
import { isCurrentAdvisorResponse } from "./advisorService";

describe("Advisor request lifecycle", () => {
  it("accepts only the active request for the unchanged progression", () => {
    expect(isCurrentAdvisorResponse("request-2", "request-2", "fingerprint", "fingerprint")).toBe(true);
    expect(isCurrentAdvisorResponse("request-2", "request-1", "fingerprint", "fingerprint")).toBe(false);
    expect(isCurrentAdvisorResponse("request-2", "request-2", "changed", "fingerprint")).toBe(false);
  });
});
