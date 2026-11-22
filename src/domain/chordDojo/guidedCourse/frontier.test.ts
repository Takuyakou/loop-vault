import { describe, expect, it } from "vitest";
import { courseFrontier, STATIONS, type StationProgress } from "./frontier";

const none = (id: StationProgress["id"]): StationProgress => ({ id, sameDayPassed: false, delayPassed: false, delayEligible: false });
function line(overrides: Partial<Record<string, Partial<StationProgress>>>): StationProgress[] {
  return STATIONS.map((id) => ({ ...none(id), ...(overrides[String(id)] ?? {}) }));
}

describe("P23-52 rule 1: the next level while one delayed check waits", () => {
  it("a fresh course starts at Lv1; everything else is locked", () => {
    const frontier = courseFrontier(line({}));
    expect(frontier.current).toBe(1);
    expect(frontier.due).toBeUndefined();
    expect(frontier.states.get(1)).toBe("now");
    expect(frontier.states.get(2)).toBe("locked");
  });

  it("Lv1's check waits: Lv2 can start", () => {
    const frontier = courseFrontier(line({ 1: { sameDayPassed: true } }));
    expect(frontier.current).toBe(2);
    expect(frontier.states.get(1)).toBe("waiting");
  });

  it("Lv1's check waits and Lv2's same day is passed: Lv3 cannot start (one waiting check at a time)", () => {
    const frontier = courseFrontier(line({ 1: { sameDayPassed: true }, 2: { sameDayPassed: true } }));
    expect(frontier.current).toBeUndefined();
    expect(frontier.states.get(3)).toBe("locked");
  });

  it("the mock ① state: Lv1's check is due, Lv2 is the current level", () => {
    const frontier = courseFrontier(line({ 1: { sameDayPassed: true, delayEligible: true } }));
    expect(frontier.due).toBe(1);
    expect(frontier.current).toBe(2);
    expect(frontier.states.get(1)).toBe("due");
  });

  it("Lv1 done, Lv2 waiting: Lv3 can start; Lv3 waiting hands over to Lv4", () => {
    expect(courseFrontier(line({ 1: { sameDayPassed: true, delayPassed: true }, 2: { sameDayPassed: true } })).current).toBe(3);
    const frontier = courseFrontier(line({ 1: { sameDayPassed: true, delayPassed: true }, 2: { sameDayPassed: true, delayPassed: true }, 3: { sameDayPassed: true } }));
    expect(frontier.current).toBe(4);
    expect(frontier.states.get(1)).toBe("done");
  });

  it("every station done: nothing current", () => {
    const all: Partial<Record<string, Partial<StationProgress>>> = {};
    for (const id of STATIONS) all[String(id)] = { sameDayPassed: true, delayPassed: true };
    const frontier = courseFrontier(line(all));
    expect(frontier.current).toBeUndefined();
    expect([...frontier.states.values()].every((state) => state === "done")).toBe(true);
  });
});
