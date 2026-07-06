import type { SongIdea, Status } from "./types";

export const baseTime = "2026-07-04T00:00:00.000Z";

export function makeIdea(overrides: Partial<SongIdea> = {}): SongIdea {
  const status = overrides.status ?? "idea";

  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Night Drive",
    bpm: 74,
    key: "F",
    genre: "future garage",
    moods: ["late night"],
    status,
    nextAction: {
      text: "Make two drum variations",
      updatedAt: baseTime,
    },
    chordMemo: "Fmaj7 - Am7 - Gm7 - C7",
    references: [],
    assets: [],
    statusHistory: [{ status, at: baseTime }],
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides,
  };
}

export function history(status: Status, at: string = baseTime) {
  return { status, at };
}
