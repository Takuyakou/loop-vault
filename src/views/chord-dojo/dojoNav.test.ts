import { describe, expect, it } from "vitest";
import { CHOICE_NAMES, HOME_NAME, parentOf, placeKey } from "./dojoNav";

describe("Chord Dojo places (P12.4-01)", () => {
  it("the top has no parent; every list, the finish and Master go up to the top", () => {
    expect(parentOf({ screen: "home" })).toBeUndefined();
    for (const choose of Object.keys(CHOICE_NAMES) as (keyof typeof CHOICE_NAMES)[]) expect(parentOf({ screen: "choose", choose })).toEqual({ place: { screen: "home" }, label: HOME_NAME });
    expect(parentOf({ screen: "finish" })?.place).toEqual({ screen: "home" });
    expect(parentOf({ screen: "master251" })?.place).toEqual({ screen: "home" });
    expect(parentOf({ screen: "ear" })?.place).toEqual({ screen: "home" });
    expect(parentOf({ screen: "ear" })?.label).toBe("今日の練習");
  });

  it("random key goes up to the standard-progression list, named for it", () => {
    expect(parentOf({ screen: "endless" })).toEqual({ place: { screen: "choose", choose: "builtin-progressions" }, label: "定番の進行" });
  });

  it("a practice goes up to the list it was opened from, or to the top when it is today's plan", () => {
    expect(parentOf({ screen: "practice", from: "shape" })).toEqual({ place: { screen: "choose", choose: "shape" }, label: "型の一覧" });
    expect(parentOf({ screen: "practice" })).toEqual({ place: { screen: "home" }, label: HOME_NAME });
  });

  it("places have distinct stable keys", () => {
    const keys = [placeKey({ screen: "home" }), placeKey({ screen: "choose", choose: "shape" }), placeKey({ screen: "choose", choose: "voicing" }), placeKey({ screen: "practice" }), placeKey({ screen: "endless" }, "a"), placeKey({ screen: "endless" }, "b")];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
