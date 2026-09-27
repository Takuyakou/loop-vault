/**
 * P8.9 data-retention round trip (docs/phase8.9/contracts/P8.9-data-retention.md §2).
 *
 * Phase 8.9 removes several fields from the UI but must never drop, move or
 * rewrite their stored values. This test pushes a synthetic vault whose
 * to-be-hidden fields are all non-default through the app's real persistence
 * path — JsonVaultRepository.load() (parseVaultFileJson) and .save()
 * (serializeVault) over the product BrowserMemoryVaultStorage — and requires the
 * saved bytes to deep-equal the input. The vault store passes ideas/settings
 * through unchanged (setVault / currentVault in src/store/vaultStore.ts).
 *
 * Synthetic data only: no real titles, no personal paths.
 */
import { describe, expect, it } from "vitest";

import { DATA_PATH, JsonVaultRepository } from "./repository";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";

const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T09:30:00.000Z`;

const ASSET_MIDI = "a1a1a1a1-0000-4000-8000-000000000001";
const ASSET_AUDIO = "a1a1a1a1-0000-4000-8000-000000000002";

/** Every field Phase 8.9 hides from the UI carries a non-default value. */
function retentionVault() {
  return {
    app: "loopvault",
    fileVersion: 2,
    settings: { monthlyGoal: 7, language: "en", showRomanNumerals: false },
    ideas: [
      {
        id: "11111111-0000-4000-8000-000000000001",
        title: "Synthetic Idea A",
        bpm: 92,
        key: "Eb",
        genre: "synthetic-genre",
        moods: ["mood-a", "mood-b"],
        status: "done",
        prevStatus: "mix",
        nextAction: { text: "synthetic next action", updatedAt: at(3) },
        chordMemo: "Ebmaj7 - Cm7 - Fm7 - Bb7",
        references: [
          { title: "Synthetic reference", url: "https://example.com/ref", memo: "ref memo" },
          { title: "Title-only reference" },
        ],
        assets: [
          { id: ASSET_MIDI, type: "midi", path: "synthetic/assets/idea-a.mid", memo: "asset memo" },
          { id: ASSET_AUDIO, type: "audio", path: "synthetic/assets/idea-a.wav", missing: true },
          { id: "a1a1a1a1-0000-4000-8000-000000000003", type: "flp" },
          { id: "a1a1a1a1-0000-4000-8000-000000000004", type: "other", memo: "no path" },
        ],
        chordDrip: { preset: "synthetic", seed: 42, nested: { values: [1, 2, 3], flag: true } },
        progressionBlocks: [
          {
            id: "b1b1b1b1-0000-4000-8000-000000000001",
            pinned: true,
            sourceAssetId: ASSET_MIDI,
            sourceFileName: "idea-a.mid",
            summaryText: "Ebmaj7 Cm7 Fm7 Bb7",
            chords: [],
            memo: "block memo",
            tags: ["synthetic-tag"],
            suppressedAutoTags: [],
            capturedAt: at(2),
            analyzerVersion: "synthetic-analyzer",
          },
        ],
        statusHistory: [
          { status: "idea", at: at(1) },
          { status: "hold", at: at(2), reason: "synthetic reason" },
          { status: "mix", at: at(3) },
          { status: "done", at: at(3) },
        ],
        createdAt: at(1),
        updatedAt: at(4),
        completedAt: at(3),
      },
      {
        id: "11111111-0000-4000-8000-000000000002",
        title: "Synthetic Idea B",
        genre: "",
        moods: [],
        status: "hold",
        prevStatus: "arrange",
        nextAction: { text: "", updatedAt: at(5) },
        chordMemo: "",
        references: [],
        assets: [],
        progressionBlocks: [],
        statusHistory: [
          { status: "arrange", at: at(5) },
          { status: "hold", at: at(6), reason: "paused" },
        ],
        createdAt: at(5),
        updatedAt: at(6),
      },
    ],
  };
}

async function roundTrip(input: unknown) {
  const storage = new BrowserMemoryVaultStorage();
  await storage.ensureDir("loopvault");
  await storage.writeText(DATA_PATH, JSON.stringify(input));
  const repository = new JsonVaultRepository(storage, {
    now: () => new Date(at(9)),
  });
  const loaded = await repository.load();
  await repository.save(loaded.vault);
  return { loaded, saved: JSON.parse(await storage.readText(DATA_PATH)) as unknown };
}

describe("P8.9 data retention — load → save round trip", () => {
  it("keeps every to-be-hidden field byte-for-byte (deep-equal)", async () => {
    const input = retentionVault();
    const { loaded, saved } = await roundTrip(input);

    expect(loaded.created).toBe(false);
    expect(loaded.quarantine).toEqual([]);
    expect(saved).toEqual(input);
  });

  it("does not rewrite a stored English language setting", async () => {
    const { saved } = await roundTrip(retentionVault());
    expect((saved as { settings: { language: string } }).settings.language).toBe("en");
  });

  /**
   * Normalization the current code already applies. These are defaults for
   * ABSENT optional keys only; no present value is changed. Recorded in
   * docs/phase8.9/audit/P8.9-00-baseline.md.
   */
  it("only fills documented defaults for absent optional keys", async () => {
    const input = retentionVault();
    const sparse = structuredClone(input) as ReturnType<typeof retentionVault>;
    delete (sparse.settings as Partial<typeof sparse.settings>).language;
    delete (sparse.settings as Partial<typeof sparse.settings>).showRomanNumerals;
    const block = sparse.ideas[0].progressionBlocks[0] as Partial<(typeof sparse.ideas)[0]["progressionBlocks"][0]>;
    delete block.pinned;
    delete block.suppressedAutoTags;
    delete (sparse.ideas[1] as Partial<(typeof sparse.ideas)[1]>).progressionBlocks;

    const { saved } = await roundTrip(sparse);

    const expected = structuredClone(sparse) as ReturnType<typeof retentionVault>;
    expected.settings = { monthlyGoal: 7, language: "ja", showRomanNumerals: true };
    Object.assign(expected.ideas[0].progressionBlocks[0], { pinned: false, suppressedAutoTags: [] });
    expected.ideas[1].progressionBlocks = [];
    expect(saved).toEqual(expected);
  });
});
