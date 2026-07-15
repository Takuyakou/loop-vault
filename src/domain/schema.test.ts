import { describe, expect, it } from "vitest";
import {
  parseVaultFileJson,
  statusHistoryEntrySchema,
  vaultFileSchema,
} from "./schema";
import type { SongIdea, VaultFile } from "./types";

const timestamp = "2026-07-04T00:00:00.000Z";

function idea(overrides: Partial<SongIdea> = {}): SongIdea {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Night Drive",
    bpm: 74,
    key: "F",
    genre: "future garage",
    moods: ["late night"],
    status: "loop",
    nextAction: {
      text: "Make two drum variations",
      updatedAt: timestamp,
    },
    chordMemo: "Fmaj7 - Am7 - Gm7 - C7",
    references: [
      {
        title: "Reference",
        url: "https://example.com/reference",
        memo: "Snare texture",
      },
    ],
    assets: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        type: "flp",
        path: "C:\\Music\\night-drive.flp",
      },
    ],
    statusHistory: [{ status: "idea", at: timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function vault(overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    app: "loopvault",
    fileVersion: 1,
    settings: { monthlyGoal: 1, language: "ja" },
    ideas: [idea()],
    ...overrides,
  };
}

describe("vaultFileSchema", () => {
  it("accepts a valid VaultFile matching spec 3.5", () => {
    expect(vaultFileSchema.safeParse(vault()).success).toBe(true);
  });

  it("accepts and trims an optional status history reason", () => {
    const result = statusHistoryEntrySchema.safeParse({
      status: "hold",
      at: timestamp,
      reason: "  Waiting for a vocalist  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("Waiting for a vocalist");
    }
  });

  it("rejects status history reasons longer than 500 characters", () => {
    expect(statusHistoryEntrySchema.safeParse({
      status: "hold",
      at: timestamp,
      reason: "x".repeat(501),
    }).success).toBe(false);
  });

  it.each(["idea", "loop", "arrange", "mix", "done"] as const)(
    "rejects a reason for %s status history",
    (status) => {
      const result = statusHistoryEntrySchema.safeParse({
        status,
        at: timestamp,
        reason: "Only inactive statuses may store this",
      });

      expect(result.success).toBe(false);
    },
  );
});

describe("parseVaultFileJson", () => {
  it("parses a valid JSON vault", () => {
    const result = parseVaultFileJson(JSON.stringify(vault()));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.vault.ideas).toHaveLength(1);
    expect(result.quarantine).toHaveLength(0);
  });

  it("keeps fileVersion 1 and loads legacy status history without reasons", () => {
    const result = parseVaultFileJson(JSON.stringify(vault()));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.vault.fileVersion).toBe(1);
    expect(result.vault.ideas[0]?.statusHistory).toEqual([
      { status: "idea", at: timestamp },
    ]);
  });

  it("quarantines imported ideas with a reason on a non-inactive status", () => {
    const invalidIdea = idea({
      statusHistory: [
        {
          status: "loop",
          at: timestamp,
          reason: "This reason must not be imported",
        },
      ],
    });
    const result = parseVaultFileJson(
      JSON.stringify(vault({ ideas: [invalidIdea] })),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.vault.ideas).toHaveLength(0);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["statusHistory", 0, "reason"] }),
      ]),
    );
  });

  it("reports JSON syntax damage without creating an empty vault", () => {
    const result = parseVaultFileJson("{ not json");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.kind).toBe("invalid-json");
  });

  it("quarantines invalid records while keeping valid records", () => {
    const validIdea = idea();
    const invalidIdea = idea({
      id: "33333333-3333-4333-8333-333333333333",
      bpm: 10,
    });
    const result = parseVaultFileJson(
      JSON.stringify(vault({ ideas: [validIdea, invalidIdea] })),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.vault.ideas).toHaveLength(1);
    expect(result.vault.ideas[0]?.id).toBe(validIdea.id);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.index).toBe(1);
  });

  it("loads legacy ideas without progressionBlocks by defaulting to an empty array", () => {
    const legacyIdea = idea();
    const result = parseVaultFileJson(JSON.stringify(vault({ ideas: [legacyIdea] })));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.vault.ideas[0]?.progressionBlocks).toEqual([]);
  });

  it("loads legacy progression blocks without pinned as unpinned", () => {
    const legacyIdea = idea({
      progressionBlocks: [{
        id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887",
        summaryText: "legacy",
        chords: [],
        tags: [],
        capturedAt: "2026-01-01T00:00:00.000Z",
        analyzerVersion: "legacy",
      }],
    });
    const result = parseVaultFileJson(JSON.stringify(vault({ ideas: [legacyIdea] })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vault.ideas[0]?.progressionBlocks?.[0]?.pinned).toBe(false);
  });

  it("loads legacy settings without language by defaulting to Japanese", () => {
    const legacyVault = {
      app: "loopvault",
      fileVersion: 1,
      settings: { monthlyGoal: 1 },
      ideas: [idea()],
    };
    const result = parseVaultFileJson(JSON.stringify(legacyVault));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.vault.settings.language).toBe("ja");
    expect(result.vault.settings.showRomanNumerals).toBe(true);
  });
});
