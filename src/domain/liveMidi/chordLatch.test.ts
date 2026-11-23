import { describe, expect, it } from "vitest";
import { createChordLatch } from "./chordLatch";

describe("P24-06 the chord latch (pure)", () => {
  it("commits the three notes when they are released one at a time", () => {
    const latch = createChordLatch();
    expect(latch.update([48, 52, 55]).candidate).toEqual([48, 52, 55]);
    expect(latch.update([48, 52]).candidate).toEqual([48, 52, 55]);
    expect(latch.update([48]).candidate).toEqual([48, 52, 55]);
    const committed = latch.update([]).committed;
    expect(committed).toEqual([48, 52, 55]);
    // The next chord starts from nothing.
    expect(latch.update([]).committed).toBeUndefined();
    expect(latch.update([60, 64, 67]).candidate).toEqual([60, 64, 67]);
  });

  it("commits the larger set when the person presses another note before letting go", () => {
    const latch = createChordLatch();
    latch.update([48, 52, 55]);
    latch.update([48, 52, 55, 59]);
    latch.update([48, 52, 55]);
    expect(latch.update([]).committed).toEqual([48, 52, 55, 59]);
  });

  it("does not commit two notes or fewer", () => {
    const latch = createChordLatch();
    latch.update([48, 52]);
    expect(latch.update([]).committed).toBeUndefined();
    latch.update([48]);
    expect(latch.update([]).committed).toBeUndefined();
  });

  it("takes a same-sized replacement set, and forgets everything on reset", () => {
    const latch = createChordLatch();
    latch.update([48, 52, 55]);
    latch.update([48, 52, 56, 59].slice(0, 3));
    latch.update([48, 52, 56]);
    expect(latch.update([]).committed).toEqual([48, 52, 56]);
    latch.update([60, 64, 67]);
    latch.reset();
    expect(latch.update([]).committed).toBeUndefined();
  });
});
