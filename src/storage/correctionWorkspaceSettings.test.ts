// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getCorrectionWorkspaceEnabled, setCorrectionWorkspaceEnabled } from "./correctionWorkspaceSettings";

describe("correction workspace setting", () => {
  afterEach(() => localStorage.clear());

  it("is off by default, remembers the switch and treats a broken value as off", () => {
    expect(getCorrectionWorkspaceEnabled()).toBe(false);
    setCorrectionWorkspaceEnabled(true);
    expect(getCorrectionWorkspaceEnabled()).toBe(true);
    setCorrectionWorkspaceEnabled(false);
    expect(getCorrectionWorkspaceEnabled()).toBe(false);
    localStorage.setItem("loop-vault:p10-workspace:v1", "{broken");
    expect(getCorrectionWorkspaceEnabled()).toBe(false);
  });
});
