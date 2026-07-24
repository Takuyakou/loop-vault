import { describe, expect, it } from "vitest";
import {
  practiceProgressState,
  progressionFingerprint,
} from "./practice";
import { createTranspositionSession } from "./practiceTransposition";
import {
  parseVaultFileJson,
  statusHistoryEntrySchema,
  vaultFileSchema,
} from "./schema";
import type { SavedProgressionBlock, SongIdea, VaultFile } from "./types";

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
    expect(result.vault.ideas[0]?.progressionBlocks?.[0]?.suppressedAutoTags).toEqual([]);
  });

  it("loads optional event identity and voicing memory without changing fileVersion", () => {
    const withVoicing = idea({
      progressionBlocks: [{
        id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887",
        summaryText: "Cmaj7",
        chords: [{
          eventId: "event-1",
          bar: 1,
          beat: 1,
          durationBeats: 4,
          chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
          confidence: 0.9,
          alternatives: [],
          warnings: [],
          voicingMemory: {
            sourceVoicing: {
              schemaVersion: 1,
              source: "midi-extracted",
              representation: "simultaneous-voicing",
              midiNotes: [48, 55, 59, 64],
              bassNote: 48,
              capturedForChordKey: "0:maj7:-:-",
              confidence: 0.9,
            },
          },
        }],
        tags: [],
        capturedAt: "2026-01-01T00:00:00.000Z",
        analyzerVersion: "legacy",
      }],
    });
    const result = parseVaultFileJson(JSON.stringify(vault({ ideas: [withVoicing] })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vault.fileVersion).toBe(1);
    expect(result.vault.ideas[0]?.progressionBlocks?.[0]?.chords[0]?.eventId).toBe("event-1");
  });

  it("loads optional practice progress while old blocks remain valid at fileVersion 1", () => {
    const withPractice = idea({
      progressionBlocks: [{
        id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887",
        summaryText: "Cmaj7",
        chords: [],
        tags: [],
        capturedAt: "2026-01-01T00:00:00.000Z",
        analyzerVersion: "legacy",
        practice: {
          schemaVersion: 1,
          progressionFingerprint: "practice-v1-12345678",
          confirmedLevel: 2,
          lastPracticedAt: "2026-07-23T00:00:00.000Z",
        },
      }],
    });
    const result = parseVaultFileJson(JSON.stringify(vault({ ideas: [withPractice] })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vault.fileVersion).toBe(1);
    expect(result.vault.ideas[0]?.progressionBlocks?.[0]?.practice?.confirmedLevel).toBe(2);
  });

  it("loads optional L4/L5 transposition progress without changing fileVersion 1", () => {
    const withTransposition = idea({
      progressionBlocks: [{
        id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887",
        summaryText: "Cmaj7",
        chords: [],
        tags: [],
        capturedAt: "2026-01-01T00:00:00.000Z",
        analyzerVersion: "legacy",
        practice: {
          schemaVersion: 1,
          progressionFingerprint: "practice-v1-12345678",
          confirmedLevel: 3,
          provisional: {
            level: 4,
            clearedAt: "2026-07-24T00:00:00.000Z",
            clearedOnLocalDate: "2026-07-24",
            targetTempo: 70,
            confirmationPitchClasses: [5, 7],
          },
          transposition: {
            schemaVersion: 1,
            clearedKeyPitchClasses: [2, 4, 5, 7, 9, 11],
            updatedAt: "2026-07-24T00:00:00.000Z",
          },
        },
      }],
    });
    const result = parseVaultFileJson(JSON.stringify(vault({
      ideas: [withTransposition],
    })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vault.fileVersion).toBe(1);
    expect(result.vault.ideas[0]?.progressionBlocks?.[0]?.practice)
      .toMatchObject({
        provisional: {
          level: 4,
          confirmationPitchClasses: [5, 7],
        },
        transposition: {
          schemaVersion: 1,
          clearedKeyPitchClasses: [2, 4, 5, 7, 9, 11],
        },
      });
  });

  it("loads legacy L4/L5 provisional clears without confirmation pitch classes", () => {
    const legacyProvisional = (
      level: 4 | 5,
      id: string,
    ): SavedProgressionBlock => ({
      id,
      summaryText: `Legacy L${level}`,
      chords: [],
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "legacy",
      practice: {
        schemaVersion: 1,
        progressionFingerprint: `practice-v1-legacy-l${level}`,
        confirmedLevel: (level - 1) as 3 | 4,
        provisional: {
          level,
          clearedAt: "2026-07-23T00:00:00.000Z",
          clearedOnLocalDate: "2026-07-23",
          targetTempo: 70,
        },
      },
    });
    const legacyVault = vault({
      ideas: [idea({
        progressionBlocks: [
          legacyProvisional(4, "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887"),
          legacyProvisional(5, "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb888"),
        ],
      })],
    });
    expect(vaultFileSchema.safeParse(legacyVault).success).toBe(true);
    const result = parseVaultFileJson(JSON.stringify(legacyVault));
    const reloaded = parseVaultFileJson(JSON.stringify(legacyVault));

    expect(result.ok).toBe(true);
    expect(reloaded.ok).toBe(true);
    if (!result.ok || !reloaded.ok) return;
    expect(result.vault.fileVersion).toBe(1);
    const firstKeys = result.vault.ideas[0]?.progressionBlocks
      ?.map((block) => block.practice?.provisional?.confirmationPitchClasses);
    expect(firstKeys?.[0]).toHaveLength(2);
    expect(firstKeys?.[1]).toHaveLength(4);
    expect(reloaded.vault.ideas[0]?.progressionBlocks
      ?.map((block) => block.practice?.provisional?.confirmationPitchClasses))
      .toEqual(firstKeys);
  });

  it("baselines a legacy Idea key once and preserves progress before future key changes become stale", () => {
    const source: SavedProgressionBlock = {
      id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb889",
      summaryText: "Legacy key baseline",
      chords: [],
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "legacy",
    };
    const legacyPractice = {
      schemaVersion: 1 as const,
      progressionFingerprint: progressionFingerprint(source),
      confirmedLevel: 3 as const,
      provisional: {
        level: 4 as const,
        clearedAt: "2026-07-23T00:00:00.000Z",
        clearedOnLocalDate: "2026-07-23",
        targetTempo: 70,
      },
      transposition: {
        schemaVersion: 1 as const,
        clearedKeyPitchClasses: [2, 3, 5, 7, 9, 10],
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
    };
    const legacyVault = vault({
      ideas: [idea({
        key: "C major",
        progressionBlocks: [{ ...source, practice: legacyPractice }],
      })],
    });
    const loaded = parseVaultFileJson(JSON.stringify(legacyVault));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const loadedBlock = loaded.vault.ideas[0]?.progressionBlocks?.[0];
    expect(loadedBlock?.practice).toMatchObject({
      progressionFingerprint: progressionFingerprint(source, "C major"),
      confirmedLevel: 3,
      transposition: legacyPractice.transposition,
    });
    const confirmationKeys = loadedBlock?.practice?.provisional
      ?.confirmationPitchClasses;
    expect(confirmationKeys).toHaveLength(2);

    const reload = parseVaultFileJson(JSON.stringify(loaded.vault));
    expect(reload.ok).toBe(true);
    if (!reload.ok) return;
    expect(reload.vault.ideas[0]?.progressionBlocks?.[0]?.practice
      ?.provisional?.confirmationPitchClasses).toEqual(confirmationKeys);

    const changedKeyVault = {
      ...reload.vault,
      ideas: reload.vault.ideas.map((loadedIdea) => ({
        ...loadedIdea,
        key: "D major",
      })),
    };
    const changed = parseVaultFileJson(JSON.stringify(changedKeyVault));
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const changedBlock = changed.vault.ideas[0]?.progressionBlocks?.[0];
    expect(changedBlock?.practice?.progressionFingerprint)
      .toBe(progressionFingerprint(source, "C major"));
    expect(changedBlock && practiceProgressState(
      changedBlock,
      "2026-07-24",
      "D major",
    )).toBe("stale");

    const confirmation = createTranspositionSession({
      level: 4,
      sourceKeyPitchClass: 0,
      sourceMode: "major",
      seed: 999,
      eligibility: { eligible: true, reasons: [] },
      progress: loadedBlock?.practice?.transposition,
      provisional: loadedBlock?.practice?.provisional,
      localDate: "2026-07-24",
    });
    expect(confirmation.inConfirmationChallenge).toBe(true);
    expect(confirmation.confirmationPitchClasses).toEqual(confirmationKeys);
  });

  it.each([
    [4, [5]],
    [5, [0, 2, 5]],
    [3, [5, 7]],
  ] as const)(
    "rejects confirmation pitch classes with an invalid L%s count",
    (level, confirmationPitchClasses) => {
      const candidate = vault({
        ideas: [idea({
          progressionBlocks: [{
            id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887",
            summaryText: "Invalid confirmation",
            chords: [],
            tags: [],
            capturedAt: "2026-01-01T00:00:00.000Z",
            analyzerVersion: "legacy",
            practice: {
              schemaVersion: 1,
              progressionFingerprint: "practice-v1-invalid-confirmation",
              provisional: {
                level,
                clearedAt: "2026-07-23T00:00:00.000Z",
                clearedOnLocalDate: "2026-07-23",
                targetTempo: 70,
                confirmationPitchClasses: [...confirmationPitchClasses],
              },
            },
          }],
        })],
      });

      expect(vaultFileSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it("rejects unsorted, duplicate, or out-of-range transposition pitch classes", () => {
    const blockBase = {
      id: "91d92f3c-fc9d-4fe5-8cc9-4bec2d7fb887",
      summaryText: "Cmaj7",
      chords: [],
      tags: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
      analyzerVersion: "legacy",
    };
    for (const clearedKeyPitchClasses of [[7, 5], [5, 5], [12]]) {
      const candidate = vault({
        ideas: [idea({
          progressionBlocks: [{
            ...blockBase,
            practice: {
              schemaVersion: 1,
              progressionFingerprint: "practice-v1-12345678",
              transposition: {
                schemaVersion: 1,
                clearedKeyPitchClasses,
              },
            },
          }],
        })],
      });
      expect(vaultFileSchema.safeParse(candidate).success).toBe(false);
    }
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
