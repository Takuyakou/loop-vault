import { describe, expect, it } from "vitest";
import {
  filterAndSortIdeas,
  filterIdeas,
  sortIdeas,
} from "./libraryFilters";
import { makeIdea } from "./testFactory";

describe("library filters", () => {
  it("applies status, genre, mood, and text filters together", () => {
    const target = makeIdea({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Night Drive",
      status: "loop",
      genre: "Future Garage",
      moods: ["Late Night", "Focused"],
      chordMemo: "Fmaj7 ambient lift",
      nextAction: { text: "Design ghost snare", updatedAt: "2026-07-01T00:00:00.000Z" },
    });
    const wrongMood = makeIdea({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Night Sketch",
      status: "loop",
      genre: "Future Garage",
      moods: ["Bright"],
      chordMemo: "Fmaj7 ambient lift",
    });
    const wrongStatus = makeIdea({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Night Mix",
      status: "mix",
      genre: "Future Garage",
      moods: ["Late Night"],
      chordMemo: "Fmaj7 ambient lift",
    });

    const result = filterIdeas([target, wrongMood, wrongStatus], {
      statuses: ["loop"],
      genres: ["future garage"],
      moods: ["late night"],
      query: "ghost",
    });

    expect(result.map((idea) => idea.id)).toEqual([target.id]);
  });

  it("treats an empty query as no text filter", () => {
    const ideas = [
      makeIdea({ id: "44444444-4444-4444-8444-444444444444", title: "A" }),
      makeIdea({ id: "55555555-5555-4555-8555-555555555555", title: "B" }),
    ];

    expect(filterIdeas(ideas, { query: "   " })).toHaveLength(2);
  });

  it("sorts by updatedAt and createdAt in either direction", () => {
    const older = makeIdea({
      id: "66666666-6666-4666-8666-666666666666",
      title: "Older",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
    const newer = makeIdea({
      id: "77777777-7777-4777-8777-777777777777",
      title: "Newer",
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(
      sortIdeas([older, newer], { field: "updatedAt", direction: "desc" }).map(
        (idea) => idea.id,
      ),
    ).toEqual([newer.id, older.id]);
    expect(
      sortIdeas([older, newer], { field: "createdAt", direction: "asc" }).map(
        (idea) => idea.id,
      ),
    ).toEqual([older.id, newer.id]);
  });

  it("sorts BPM while keeping undefined BPM records last", () => {
    const noBpm = makeIdea({
      id: "88888888-8888-4888-8888-888888888888",
      title: "No BPM",
      bpm: undefined,
    });
    const slow = makeIdea({
      id: "99999999-9999-4999-8999-999999999999",
      title: "Slow",
      bpm: 80,
    });
    const fast = makeIdea({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Fast",
      bpm: 150,
    });

    expect(
      sortIdeas([noBpm, fast, slow], { field: "bpm", direction: "asc" }).map(
        (idea) => idea.id,
      ),
    ).toEqual([slow.id, fast.id, noBpm.id]);
    expect(
      sortIdeas([noBpm, fast, slow], { field: "bpm", direction: "desc" }).map(
        (idea) => idea.id,
      ),
    ).toEqual([fast.id, slow.id, noBpm.id]);
  });

  it("combines filtering and sorting for the Library list", () => {
    const olderLoop = makeIdea({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Older Loop",
      status: "loop",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const newerLoop = makeIdea({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Newer Loop",
      status: "loop",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
    const idea = makeIdea({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Idea",
      status: "idea",
      updatedAt: "2026-07-03T00:00:00.000Z",
    });

    const result = filterAndSortIdeas(
      [olderLoop, newerLoop, idea],
      { statuses: ["loop"] },
      { field: "updatedAt", direction: "desc" },
    );

    expect(result.map((entry) => entry.id)).toEqual([
      newerLoop.id,
      olderLoop.id,
    ]);
  });
});
