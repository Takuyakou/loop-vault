import { describe, expect, it } from "vitest";
import type { VaultFile } from "../../types";
import { enumerateStoredProgressions, buildStoredProgressionCase } from "./storedProgressions";
import { realMidiEvaluationCaseSchema } from "./schema";

describe("real MIDI evaluation privacy", () => {
  it("keeps personal Vault fields and absolute paths out of evaluation cases", () => {
    const privatePath = "D:/Users/private/unreleased-song.mid";
    const vault: VaultFile = {
      app: "loopvault",
      fileVersion: 1,
      settings: { monthlyGoal: 1, language: "ja" },
      ideas: [{
        id: "11111111-1111-4111-8111-111111111111",
        title: "Private client title",
        moods: [], status: "idea",
        nextAction: { text: "Secret next action", updatedAt: "2026-07-15T00:00:00.000Z" },
        chordMemo: "Private memo",
        references: [{ title: "Reference", url: "https://private.example.test/song" }],
        assets: [{ id: "22222222-2222-4222-8222-222222222222", type: "midi", path: privatePath }],
        progressionBlocks: [{
          id: "33333333-3333-4333-8333-333333333333",
          sourceAssetId: "22222222-2222-4222-8222-222222222222",
          sourceFileName: "unreleased-song.mid",
          summaryText: "C",
          chords: [{
            bar: 1, beat: 1, durationBeats: 4,
            chord: { root: 0, quality: "maj", tensions: [], label: "C" },
            confidence: 0.9, alternatives: [], warnings: [],
          }],
          memo: "Private block memo", tags: ["private-tag"],
          capturedAt: "2026-07-15T00:00:00.000Z", analyzerVersion: "legacy-v1",
        }],
        statusHistory: [{ status: "idea", at: "2026-07-15T00:00:00.000Z" }],
        createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z",
      }],
    };
    const [reference] = enumerateStoredProgressions(vault);
    const evaluationCase = realMidiEvaluationCaseSchema.parse(
      buildStoredProgressionCase(reference, `sha256-${"a".repeat(64)}`),
    );
    const serialized = JSON.stringify(evaluationCase);
    [privatePath, "Private client title", "Secret next action", "Private memo", "Private block memo",
      "private-tag", "https://private.example.test/song"].forEach((secret) => expect(serialized).not.toContain(secret));
  });

  it("rejects a path added directly to the evaluation source object", () => {
    const result = realMidiEvaluationCaseSchema.safeParse({
      schemaVersion: 1,
      id: "case",
      source: { fingerprint: `sha256-${"b".repeat(64)}`, lastKnownPath: "D:/private.mid" },
      range: { startBeat: 0, endBeat: 4 },
      expected: { primary: [{ startBeat: 0, endBeat: 4, primary: "C", root: 0, quality: "maj" }] },
      label: { strength: "gold", origin: "manual-import" },
    });
    expect(result.success).toBe(false);
  });
});
