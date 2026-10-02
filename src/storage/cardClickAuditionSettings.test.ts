// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getCardClickAudition, setCardClickAudition } from "./cardClickAuditionSettings";

describe("「押して鳴らす」 setting (P10.1 §10)", () => {
  afterEach(() => localStorage.clear());

  it("is on by default, and remembers on and off as words", () => {
    expect(getCardClickAudition()).toBe(true);
    setCardClickAudition(false);
    expect(localStorage.getItem("loop-vault:p10-card-click-audition:v1")).toBe("off");
    expect(getCardClickAudition()).toBe(false);
    setCardClickAudition(true);
    expect(localStorage.getItem("loop-vault:p10-card-click-audition:v1")).toBe("on");
    expect(getCardClickAudition()).toBe(true);
  });

  it("starts on again for someone who turned it off before P10.1 (stored as no value)", () => {
    localStorage.removeItem("loop-vault:p10-card-click-audition:v1");
    expect(getCardClickAudition()).toBe(true);
  });
});
