import { describe, expect, it } from "vitest";
import type { Status } from "./types";
import { makeIdea } from "./testFactory";
import { transition } from "./transition";

const now = new Date("2026-07-10T09:30:00.000Z");
const statuses: Status[] = [
  "idea",
  "loop",
  "arrange",
  "mix",
  "done",
  "hold",
  "abandoned",
];
const pipelineStatuses: Status[] = ["idea", "loop", "arrange", "mix", "done"];
const inactiveStatuses: Status[] = ["hold", "abandoned"];
const transitionMatrix = statuses.flatMap((from) => statuses.map((to) => ({
  from,
  to,
  allowed: expectedNormalTransition(from, to),
})));
const repairMatrix = ([undefined, "hold", "abandoned"] as const).flatMap(
  (prevStatus) => statuses.map((to) => ({
    prevStatus,
    prevStatusLabel: prevStatus ?? "missing",
    to,
    allowed: to === "idea",
  })),
);

describe("transition", () => {
  it.each(transitionMatrix)(
    "$from -> $to allowed=$allowed for valid data",
    ({ from, to, allowed }) => {
      const result = transition(
        makeIdea({
          status: from,
          prevStatus: inactiveStatuses.includes(from) ? "loop" : undefined,
        }),
        to,
        now,
      );

      expect(result.ok).toBe(allowed);
    },
  );

  it.each(repairMatrix)(
    "Hold with $prevStatusLabel prevStatus -> $to allowed=$allowed",
    ({ prevStatus, to, allowed }) => {
      const result = transition(
        makeIdea({ status: "hold", prevStatus }),
        to,
        now,
      );

      expect(result.ok).toBe(allowed);
      if (result.ok) {
        expect(result.idea.status).toBe("idea");
        expect(result.idea.prevStatus).toBeUndefined();
      }
    },
  );

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

  it("reports invalid restore targets without blocking the Idea repair", () => {
    const result = transition(
      makeIdea({ status: "hold", prevStatus: "abandoned" }),
      "loop",
      now,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid-restore-target",
        message: expect.stringContaining("only repair to idea"),
      },
    });
  });

  it("preserves prevStatus while switching between Hold and Abandoned", () => {
    const abandoned = transition(
      makeIdea({ status: "hold", prevStatus: "mix" }),
      "abandoned",
      now,
    );

    expect(abandoned.ok).toBe(true);
    if (!abandoned.ok) return;
    expect(abandoned.idea.prevStatus).toBe("mix");

    const restored = transition(abandoned.idea, "mix", now);
    expect(restored.ok && restored.idea.status).toBe("mix");
    expect(restored.ok && restored.idea.prevStatus).toBeUndefined();
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

function expectedNormalTransition(from: Status, to: Status): boolean {
  if (from === to) return false;
  if (inactiveStatuses.includes(from)) {
    return inactiveStatuses.includes(to) || to === "loop";
  }
  if (inactiveStatuses.includes(to)) return true;
  return Math.abs(
    pipelineStatuses.indexOf(from) - pipelineStatuses.indexOf(to),
  ) === 1;
}
