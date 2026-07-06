import { describe, expect, it } from "vitest";
import { pickFocus } from "./focus";
import { makeIdea } from "./testFactory";

const now = new Date("2026-07-20T00:00:00.000Z");

describe("pickFocus", () => {
  it("prioritizes status weight before idle time", () => {
    const idea = makeIdea({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Old Idea",
      status: "idea",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const mix = makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Fresh Mix",
      status: "mix",
      updatedAt: "2026-07-19T00:00:00.000Z",
    });

    const result = pickFocus([idea, mix], now);

    expect(result.focus?.id).toBe(mix.id);
    expect(result.candidates.map((candidate) => candidate.idea.id)).toEqual([
      mix.id,
      idea.id,
    ]);
  });

  it("uses longer idle time to break ties within the same status", () => {
    const freshLoop = makeIdea({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Fresh Loop",
      status: "loop",
      updatedAt: "2026-07-18T00:00:00.000Z",
    });
    const oldLoop = makeIdea({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Old Loop",
      status: "loop",
      updatedAt: "2026-07-10T00:00:00.000Z",
    });

    const result = pickFocus([freshLoop, oldLoop], now);

    expect(result.focus?.id).toBe(oldLoop.id);
  });

  it("separates ideas with an unset Next Action from focus candidates", () => {
    const needsNext = makeIdea({
      id: "55555555-5555-4555-8555-555555555555",
      title: "Needs Next",
      status: "mix",
      nextAction: { text: "   ", updatedAt: "2026-07-19T00:00:00.000Z" },
    });
    const focusable = makeIdea({
      id: "66666666-6666-4666-8666-666666666666",
      title: "Focusable",
      status: "arrange",
    });

    const result = pickFocus([needsNext, focusable], now);

    expect(result.focus?.id).toBe(focusable.id);
    expect(result.needsNextAction.map((idea) => idea.id)).toEqual([
      needsNext.id,
    ]);
    expect(result.candidates.map((candidate) => candidate.idea.id)).not.toContain(
      needsNext.id,
    );
  });

  it("extracts 7-day stale warnings and 14-day Hold suggestions by boundary", () => {
    const exactlySevenDays = makeIdea({
      id: "77777777-7777-4777-8777-777777777777",
      title: "Exactly Seven",
      updatedAt: "2026-07-13T00:00:00.000Z",
    });
    const overSevenDays = makeIdea({
      id: "88888888-8888-4888-8888-888888888888",
      title: "Over Seven",
      updatedAt: "2026-07-12T23:59:59.999Z",
    });
    const overFourteenDays = makeIdea({
      id: "99999999-9999-4999-8999-999999999999",
      title: "Over Fourteen",
      updatedAt: "2026-07-05T23:59:59.999Z",
    });

    const result = pickFocus(
      [exactlySevenDays, overSevenDays, overFourteenDays],
      now,
    );

    expect(result.stale.map((entry) => entry.idea.id)).toEqual([
      overFourteenDays.id,
      overSevenDays.id,
    ]);
    expect(
      result.stale.find((entry) => entry.idea.id === overSevenDays.id)
        ?.suggestHold,
    ).toBe(false);
    expect(
      result.stale.find((entry) => entry.idea.id === overFourteenDays.id)
        ?.suggestHold,
    ).toBe(true);
  });

  it("excludes Hold, Abandoned, and Done ideas from focus and stale lists", () => {
    const hold = makeIdea({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "hold",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const abandoned = makeIdea({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "abandoned",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const done = makeIdea({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "done",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    const result = pickFocus([hold, abandoned, done], now);

    expect(result.focus).toBeUndefined();
    expect(result.candidates).toHaveLength(0);
    expect(result.needsNextAction).toHaveLength(0);
    expect(result.stale).toHaveLength(0);
  });
});
