import { describe, expect, it } from "vitest";

describe("project scaffold", () => {
  it("runs the Vitest suite", () => {
    expect("loopvault").toContain("vault");
  });
});
