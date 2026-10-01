// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getLegacyCaptureEnabled, setLegacyCaptureEnabled } from "./correctionWorkspaceSettings";

describe("legacy capture screen setting (P10.0-06)", () => {
  afterEach(() => localStorage.clear());

  it("is off by default, remembers the switch and treats a broken value as off", () => {
    expect(getLegacyCaptureEnabled()).toBe(false);
    setLegacyCaptureEnabled(true);
    expect(getLegacyCaptureEnabled()).toBe(true);
    setLegacyCaptureEnabled(false);
    expect(getLegacyCaptureEnabled()).toBe(false);
    localStorage.setItem("loop-vault:p10-legacy-capture:v1", "{broken");
    expect(getLegacyCaptureEnabled()).toBe(false);
  });

  it("does not read the P10.0-02 workspace key", () => {
    localStorage.setItem("loop-vault:p10-workspace:v1", "on");
    expect(getLegacyCaptureEnabled()).toBe(false);
  });
});
