import { describe, expect, it } from "vitest";
import { createEmptyVault, serializeVault } from "../repository";
import {
  parseVaultFileJson,
  parseVaultFileJsonAsLegacyV1,
  vaultFileSchema,
} from "../schema";
import type { SongIdea } from "../types";
import { extractSourceBasslineSnapshot } from ".";

const timestamp = "2026-08-21T00:00:00.000Z";

function idea(): SongIdea {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Synthetic",
    moods: [],
    status: "idea",
    nextAction: { text: "", updatedAt: timestamp },
    chordMemo: "",
    references: [],
    assets: [],
    progressionBlocks: [{
      id: "22222222-2222-4222-8222-222222222222",
      summaryText: "Cmaj7",
      chords: [],
      tags: [],
      capturedAt: timestamp,
      analyzerVersion: "synthetic",
      sourceBassline: extractSourceBasslineSnapshot({
        selectedSourceId: "source",
        selectedVoiceId: "voice",
        range: {
          authority: "raw-integer-ticks",
          constantMeterProven: true,
          barAlignmentProven: true,
          sourceId: "source",
          startTick: 0,
          endTick: 1_920,
          sourceEndTick: 1_920,
          ticksPerQuarter: 480,
          meter: { numerator: 4, denominator: 4 },
        },
        notes: [{
          sourceId: "source",
          voiceId: "voice",
          pitch: 36,
          velocity: 0.75,
          startTick: 0,
          durationTick: 480,
          ticksPerQuarter: 480,
        }],
      }),
    }],
    statusHistory: [{ status: "idea", at: timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("P5.22 Vault compatibility", () => {
  it("migrates a strict v1 Vault deterministically without backfilling a snapshot", () => {
    const legacy = { ...createEmptyVault(), fileVersion: 1, ideas: [{ ...idea(), progressionBlocks: [] }] };
    const first = parseVaultFileJson(JSON.stringify(legacy));
    const second = parseVaultFileJson(JSON.stringify(legacy));

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(first.vault.fileVersion).toBe(2);
    expect(first.vault.ideas[0]?.progressionBlocks).toEqual([]);
  });

  it("round-trips v2 snapshots while the supported legacy reader treats v2 as future", () => {
    const current = { ...createEmptyVault(), ideas: [idea()] };
    const raw = serializeVault(current);
    const parsed = parseVaultFileJson(raw);
    const legacy = parseVaultFileJsonAsLegacyV1(raw);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(serializeVault(parsed.vault)).toBe(raw);
    }
    expect(legacy).toEqual({
      ok: false,
      error: { kind: "future-version", fileVersion: 2 },
    });
  });

  it("keeps versions above v2 readonly and rejects sourceBassline under a v1 envelope", () => {
    const future = parseVaultFileJson(JSON.stringify({ ...createEmptyVault(), fileVersion: 3 }));
    expect(future).toEqual({
      ok: false,
      error: { kind: "future-version", fileVersion: 3 },
    });

    const invalidLegacy = parseVaultFileJson(JSON.stringify({
      ...createEmptyVault(),
      fileVersion: 1,
      ideas: [idea()],
    }));
    expect(invalidLegacy.ok).toBe(true);
    if (!invalidLegacy.ok) return;
    expect(invalidLegacy.vault.ideas).toEqual([]);
    expect(invalidLegacy.quarantine).toHaveLength(1);
  });

  it("rejects unknown and forbidden fields anywhere in the sourceBassline subtree", () => {
    const candidate = { ...createEmptyVault(), ideas: [idea()] };
    const snapshot = candidate.ideas[0]!.progressionBlocks![0]!.sourceBassline!;
    const tampered = {
      ...candidate,
      ideas: [{
        ...candidate.ideas[0],
        progressionBlocks: [{
          ...candidate.ideas[0]!.progressionBlocks![0],
          sourceBassline: { ...snapshot, voiceId: "transient-identity" },
        }],
      }],
    };

    expect(vaultFileSchema.safeParse(tampered).success).toBe(false);
  });
});
