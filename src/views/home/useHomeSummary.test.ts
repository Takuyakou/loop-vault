import { describe, expect, it } from "vitest";
import { makeIdea } from "../../domain/testFactory";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";
import { createEmptyPracticeFile, type PracticeFileV2 } from "../../features/bass-practice/infra/repository/practiceRepository";
import type { DojoRecentEntry } from "../chord-dojo/dojoRecent";
import { deriveHomeSummary } from "./useHomeSummary";

/**
 * P22-03 §1: 「続きから」 is the newest of the three practices; each is only a candidate while its own destination can
 * open, and when none is a candidate the old behaviour (the last edited progression, or the old records) stays.
 */
const now = new Date(2026, 10, 10, 12, 0);
const ideasFor = (): SongIdea[] => [makeIdea({
  id: "idea",
  title: "Idea",
  updatedAt: new Date(2026, 10, 1).toISOString(),
  progressionBlocks: [1, 2].map((index) => block(index)),
})];

function block(index: number): SavedProgressionBlock {
  return {
    id: `block-${index}`,
    summaryText: `Loop ${index}`,
    chords: [{ bar: 1, beat: 1, durationBeats: 4, chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" }, confidence: 0.9, alternatives: [], warnings: [] }],
    detectedKey: "C",
    bpm: 90,
    tags: [],
    capturedAt: new Date(2026, 10, index).toISOString(),
    analyzerVersion: "p22-03-test",
  };
}

const goneNote = (at: string) => ({ version: 1 as const, reference: { ideaId: "idea", blockId: "gone" }, at });
const dojoEntry = (at: string): DojoRecentEntry => ({ kind: "standard", id: "ii-v-i-major", key: 0, at });
const bassFile = (at: string): PracticeFileV2 => ({
  ...createEmptyPracticeFile(now),
  rhythmAttempts: [{ completedAt: at } as never],
});

describe("the Home's 続きから (P22-03 §1)", () => {
  it("shows the Voicing Loop's last practice while its progression is in the Vault", () => {
    const summary = deriveHomeSummary(ideasFor(), undefined, now, undefined, [], {
      voicingLast: { reference: { ideaId: "idea", blockId: "block-1" }, at: "2026-11-10T09:00:00.000Z" },
    });
    expect(summary.continueFrom?.kind).toBe("voicing-loop");
    expect(summary.continueFrom?.kind === "voicing-loop" && summary.continueFrom.entry.block.id).toBe("block-1");
  });

  it("shows the Chord Dojo's newest practice with the Dojo home's words", () => {
    const summary = deriveHomeSummary(ideasFor(), undefined, now, undefined, [], { dojoRecent: [dojoEntry("2026-11-10T10:00:00.000Z")] });
    const next = summary.continueFrom;
    expect(next?.kind).toBe("chord-dojo");
    if (next?.kind !== "chord-dojo") return;
    expect(next.title).toBe("定番の進行・C");
    expect(next.subtitle).toBe("ii–V–I・今日");
    expect(next.recent.id).toBe("ii-v-i-major");
  });

  it("shows the Bass Practice's newest practice and which practice it was", () => {
    const summary = deriveHomeSummary(ideasFor(), bassFile("2026-11-10T11:00:00.000Z"), now);
    expect(summary.continueFrom).toMatchObject({ kind: "bass-practice", mode: "rhythm" });
  });

  it("takes the newest of the three", () => {
    const newer = deriveHomeSummary(ideasFor(), bassFile("2026-11-10T11:00:00.000Z"), now, undefined, [], {
      voicingLast: { reference: { ideaId: "idea", blockId: "block-1" }, at: "2026-11-10T09:00:00.000Z" },
      dojoRecent: [dojoEntry("2026-11-10T10:00:00.000Z")],
    });
    expect(newer.continueFrom?.kind).toBe("bass-practice");
    const oldest = deriveHomeSummary(ideasFor(), bassFile("2026-11-09T11:00:00.000Z"), now, undefined, [], {
      voicingLast: { reference: { ideaId: "idea", blockId: "block-1" }, at: "2026-11-10T09:00:00.000Z" },
      dojoRecent: [dojoEntry("2026-11-10T10:00:00.000Z")],
    });
    expect(oldest.continueFrom?.kind).toBe("chord-dojo");
  });

  it("never uses a practice whose destination cannot open", () => {
    const goneVoicing = deriveHomeSummary(ideasFor(), undefined, now, undefined, [], {
      voicingLast: goneNote("2026-11-10T09:00:00.000Z"),
    });
    expect(goneVoicing.continueFrom?.kind).toBe("edit");
    const goneDojo = deriveHomeSummary(ideasFor(), undefined, now, undefined, [], {
      dojoRecent: [{ ...dojoEntry("2026-11-10T10:00:00.000Z"), id: "no-such-builtin" }],
    });
    expect(goneDojo.continueFrom?.kind).toBe("edit");
  });

  it("keeps the old behaviour when nothing was practised", () => {
    const summary = deriveHomeSummary(ideasFor(), undefined, now);
    expect(summary.continueFrom).toMatchObject({ kind: "edit", via: "edit" });
    expect(summary.continueFrom?.kind === "edit" && summary.continueFrom.entry.block.id).toBe("block-2");
  });

  it("passes the Voicing Loop note through for the practice row", () => {
    const summary = deriveHomeSummary(ideasFor(), undefined, now, undefined, [], {
      voicingLast: { reference: { ideaId: "idea", blockId: "block-1" }, at: "2026-11-10T09:00:00.000Z" },
    });
    expect(summary.lastVoicingPractice?.at).toBe("2026-11-10T09:00:00.000Z");
  });
});
