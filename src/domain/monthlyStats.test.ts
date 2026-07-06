import { describe, expect, it } from "vitest";
import { monthlyStats } from "./monthlyStats";
import { history, makeIdea } from "./testFactory";

describe("monthlyStats", () => {
  it("counts Done ideas in the current local month and reports remaining days", () => {
    const julyDone = makeIdea({
      id: "11111111-1111-4111-8111-111111111111",
      status: "done",
      completedAt: "2026-07-31T23:59:00+09:00",
    });
    const augustDone = makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      status: "done",
      completedAt: "2026-08-01T00:00:00+09:00",
    });

    const julyStats = monthlyStats(
      [julyDone, augustDone],
      new Date("2026-07-31T23:59:00+09:00"),
      1,
    );
    const augustStats = monthlyStats(
      [julyDone, augustDone],
      new Date("2026-08-01T00:00:00+09:00"),
      1,
    );

    expect(julyStats.doneCount).toBe(1);
    expect(julyStats.remainingDays).toBe(0);
    expect(augustStats.doneCount).toBe(1);
    expect(augustStats.remainingDays).toBe(30);
  });

  it("uses local timezone month boundaries rather than UTC month buckets", () => {
    const justAfterMidnightJst = makeIdea({
      id: "33333333-3333-4333-8333-333333333333",
      status: "done",
      completedAt: "2026-07-01T00:30:00+09:00",
    });

    const stats = monthlyStats(
      [justAfterMidnightJst],
      new Date("2026-07-15T12:00:00+09:00"),
      1,
    );

    expect(stats.doneCount).toBe(1);
  });

  it("counts every status for the pipeline breakdown", () => {
    const stats = monthlyStats(
      [
        makeIdea({ id: "44444444-4444-4444-8444-444444444444", status: "idea" }),
        makeIdea({ id: "55555555-5555-4555-8555-555555555555", status: "loop" }),
        makeIdea({ id: "66666666-6666-4666-8666-666666666666", status: "mix" }),
        makeIdea({ id: "77777777-7777-4777-8777-777777777777", status: "hold" }),
      ],
      new Date("2026-07-15T12:00:00+09:00"),
      1,
    );

    expect(stats.pipelineCounts).toMatchObject({
      idea: 1,
      loop: 1,
      arrange: 0,
      mix: 1,
      done: 0,
      hold: 1,
      abandoned: 0,
    });
  });

  it("builds trailing 12-month Done counts from first Done history entries", () => {
    const januaryDone = makeIdea({
      id: "88888888-8888-4888-8888-888888888888",
      statusHistory: [history("mix", "2026-01-05T00:00:00+09:00"), history("done", "2026-01-06T00:00:00+09:00")],
    });
    const redoneInMarch = makeIdea({
      id: "99999999-9999-4999-8999-999999999999",
      statusHistory: [
        history("mix", "2026-02-01T00:00:00+09:00"),
        history("done", "2026-02-02T00:00:00+09:00"),
        history("mix", "2026-03-01T00:00:00+09:00"),
        history("done", "2026-03-02T00:00:00+09:00"),
      ],
    });
    const outsideRange = makeIdea({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      statusHistory: [history("done", "2025-12-31T23:59:00+09:00")],
    });

    const stats = monthlyStats(
      [januaryDone, redoneInMarch, outsideRange],
      new Date("2026-12-15T12:00:00+09:00"),
      1,
    );

    expect(stats.trailingMonths[0]?.label).toBe("2026-01");
    expect(stats.trailingMonths[stats.trailingMonths.length - 1]?.label).toBe(
      "2026-12",
    );
    expect(
      stats.trailingMonths.find((month) => month.label === "2026-01")
        ?.doneCount,
    ).toBe(1);
    expect(
      stats.trailingMonths.find((month) => month.label === "2026-02")
        ?.doneCount,
    ).toBe(1);
    expect(
      stats.trailingMonths.find((month) => month.label === "2026-03")
        ?.doneCount,
    ).toBe(0);
  });
});
