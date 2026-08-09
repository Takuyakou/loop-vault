import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import { makeIdea } from "../../../domain/testFactory";
import { createChordContextHistoryEntry } from "../domain/chordContextHistory";
import type { SavedProgressionBlock, SongIdea } from "../../../domain/types";
import {
  buildVaultPickerCandidateViews,
  filterVaultPickerCandidates,
  normalizeDisplayTitle,
} from "./vaultPickerCandidates";

function progression(id: string, root: number = 0): SavedProgressionBlock {
  return {
    id,
    summaryText: "Synthetic test metadata that never reaches Practice",
    detectedKey: root === 2 ? "D major" : "C major",
    bpm: 96,
    timeSignature: "4/4",
    chords: [{
      bar: 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(root, "maj7"),
      confidence: 1,
      alternatives: [],
      warnings: [],
    }],
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "fixture",
  };
}

function idea(id: string, title: string, block: SavedProgressionBlock): SongIdea {
  return makeIdea({ id, title, progressionBlocks: [block] });
}

describe("Vault picker candidate ViewModel", () => {
  it("projects a normalized live title only for picker presentation while preserving the safe snapshot", () => {
    const privateTitle = "  \u591c\u{1f31f} / Cafe\u0301  ";
    const [candidate] = buildVaultPickerCandidateViews(
      [idea("idea-night", privateTitle, progression("night-block"))],
      "Untitled progression",
    );

    expect(candidate).toMatchObject({
      displayTitle: "\u591c\u{1f31f} / Caf\u00e9",
      searchableTitle: "\u591c\u{1f31f} / caf\u00e9",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(JSON.stringify(candidate.safeSnapshot)).not.toContain(privateTitle.trim());
    expect(JSON.stringify(candidate.safeSnapshot)).not.toMatch(/title|sourceAsset|summaryText/i);
    const history = createChordContextHistoryEntry({
      id: "history:title-boundary",
      completedAt: "2026-08-09T00:00:00.000Z",
      snapshot: candidate.safeSnapshot,
      effectiveBpm: 96,
      listenMode: "bass-and-chords",
      playMode: "chords-only",
      metronomeUsed: false,
      recordCompareUsed: false,
    });
    expect(JSON.stringify(history)).not.toContain(candidate.displayTitle);
  });

  it("uses a neutral fallback for missing or whitespace-only live titles without mutating the Vault value", () => {
    const source = idea("idea-empty", "   ", progression("empty-block"));
    const [candidate] = buildVaultPickerCandidateViews([source], "\u7121\u984c\u306e\u9032\u884C");

    expect(candidate?.displayTitle).toBe("\u7121\u984c\u306e\u9032\u884C");
    expect(source.title).toBe("   ");
    expect(normalizeDisplayTitle("\t", " ")).toBe("Untitled progression");
  });

  it("keeps duplicate and long titles distinct by their safe source snapshots", () => {
    const title = "Same title ".repeat(8).trim();
    const candidates = buildVaultPickerCandidateViews([
      idea("idea-one", title, progression("block-one", 0)),
      idea("idea-two", title, progression("block-two", 2)),
    ], "Untitled progression");

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.displayTitle)).toEqual([title, title]);
    expect(new Set(candidates.map((candidate) => candidate.safeSnapshot.signature)).size).toBe(2);
    expect(new Set(candidates.map((candidate) => candidate.safeSnapshot.source.reference.ideaId)).size).toBe(2);
  });

  it("matches normalized live titles and retains the established key, section, and chord search", () => {
    const candidates = buildVaultPickerCandidateViews([
      idea("idea-night", "\u591c\u{1f31f} Groove", progression("night-block", 0)),
      idea("idea-sun", "Sunny / Symbols + #", progression("sun-block", 2)),
    ], "Untitled progression");

    expect(filterVaultPickerCandidates(candidates, "  \u591c\u{1f31f}  ")).toHaveLength(1);
    expect(filterVaultPickerCandidates(candidates, "SUNNY")).toHaveLength(1);
    expect(filterVaultPickerCandidates(candidates, "#")).toHaveLength(1);
    expect(filterVaultPickerCandidates(candidates, "Dmaj7")).toHaveLength(1);
    expect(filterVaultPickerCandidates(candidates, "bars 1-1")).toHaveLength(2);
    expect(filterVaultPickerCandidates(candidates, "no match")).toHaveLength(0);
  });
});
