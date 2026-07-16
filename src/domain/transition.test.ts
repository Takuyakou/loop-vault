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

  it("records a trimmed reason only when moving to Hold or Abandoned", () => {
    const original = makeIdea({ chordMemo: "Keep this memo unchanged" });
    const held = transition(original, "hold", now, {
      reason: "  Arrangement direction is undecided  ",
    });

    expect(held.ok).toBe(true);
    if (!held.ok) {
      return;
    }
    expect(held.idea.statusHistory[held.idea.statusHistory.length - 1]).toEqual({
      status: "hold",
      at: now.toISOString(),
      reason: "Arrangement direction is undecided",
    });
    expect(held.idea.chordMemo).toBe("Keep this memo unchanged");

    const abandoned = transition(makeIdea({ status: "loop" }), "abandoned", now, {
      reason: "No longer fits the project",
    });
    expect(abandoned.ok && abandoned.idea.statusHistory[abandoned.idea.statusHistory.length - 1]?.reason).toBe(
      "No longer fits the project",
    );
  });

  it("does not record a reason for pipeline transitions", () => {
    const result = transition(makeIdea({ status: "loop" }), "arrange", now, {
      reason: "This must not be persisted",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.idea.statusHistory[result.idea.statusHistory.length - 1]).toEqual({
      status: "arrange",
      at: now.toISOString(),
    });
  });

  it("rejects inactive-status reasons longer than 500 characters", () => {
    const result = transition(makeIdea(), "hold", now, {
      reason: "x".repeat(501),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "reason-too-long",
        message: "Status reason must be 500 characters or fewer.",
      },
    });
  });
});
