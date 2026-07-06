import { describe, expect, it } from "vitest";
import { makeIdea } from "./testFactory";
import { transition } from "./transition";

const now = new Date("2026-07-10T09:30:00.000Z");

describe("transition", () => {
  it("rejects skipped pipeline jumps", () => {
    const result = transition(makeIdea({ status: "idea" }), "mix", now);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("invalid-jump");
  });

  it("restores Hold ideas to prevStatus", () => {
    const result = transition(
      makeIdea({ status: "hold", prevStatus: "arrange" }),
      "arrange",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.idea.status).toBe("arrange");
    expect(result.idea.prevStatus).toBeUndefined();
    expect(result.idea.statusHistory[result.idea.statusHistory.length - 1]).toEqual({
      status: "arrange",
      at: now.toISOString(),
    });
  });

  it("restores Abandoned ideas to prevStatus", () => {
    const result = transition(
      makeIdea({ status: "abandoned", prevStatus: "loop" }),
      "loop",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.idea.status).toBe("loop");
    expect(result.idea.prevStatus).toBeUndefined();
  });

  it("keeps completedAt unchanged when Done is revisited", () => {
    const completedAt = "2026-07-01T12:00:00.000Z";
    const mixedAgain = transition(
      makeIdea({ status: "done", completedAt }),
      "mix",
      new Date("2026-07-09T12:00:00.000Z"),
    );

    expect(mixedAgain.ok).toBe(true);
    if (!mixedAgain.ok) {
      return;
    }

    const doneAgain = transition(mixedAgain.idea, "done", now);

    expect(doneAgain.ok).toBe(true);
    if (!doneAgain.ok) {
      return;
    }
    expect(doneAgain.idea.completedAt).toBe(completedAt);
  });

  it("records every successful transition in statusHistory", () => {
    const result = transition(makeIdea({ status: "loop" }), "arrange", now);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.idea.statusHistory).toHaveLength(2);
    expect(result.idea.statusHistory[1]).toEqual({
      status: "arrange",
      at: now.toISOString(),
    });
    expect(result.idea.updatedAt).toBe(now.toISOString());
  });
});
