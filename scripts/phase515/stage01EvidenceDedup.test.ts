import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import type { MidiAnalyzerMode } from "../../src/domain/midi/types";
import {
  renderContractMidi,
  type Phase515CorpusContract,
} from "./corpusContract";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(
  resolve(repositoryRoot, "scripts/phase515/fixtures/manifest-v2.json"),
  "utf8",
)) as Phase515CorpusContract;

describe("P5.15-01 exact-note evidence dedup", () => {
  it("makes cases 02 and 03 analysis-deep-equal with 33 effective notes", () => {
    const cleanBytes = fixture("02_shell_fifths_pickup_irregular");
    const duplicateBytes = fixture("03_shell_fifths_pickup_irregular_exact_duplicates");
    const clean = analyzeEnabled(cleanBytes);
    const duplicate = analyzeEnabled(duplicateBytes);

    expect(parseMidi(cleanBytes).notes).toHaveLength(33);
    expect(parseMidi(duplicateBytes).notes).toHaveLength(66);
    expect(clean.noteEvidenceDedup).toMatchObject({
      originalNoteCount: 33,
      effectiveNoteCount: 33,
      duplicateCount: 0,
    });
    expect(duplicate.noteEvidenceDedup).toMatchObject({
      originalNoteCount: 66,
      effectiveNoteCount: 33,
      duplicateCount: 33,
    });
    expect(normalizeAnalysis(duplicate)).toEqual(normalizeAnalysis(clean));
  });

  it.each([
    "12_split_tracks_harmony_bass",
    "15_rootless_dominant_with_context",
    "32_type0_multichannel",
  ])("preserves separate voices for %s", (caseId) => {
    const bytes = fixture(caseId);
    const parsed = parseMidi(bytes);
    const result = analyzeEnabled(bytes);
    expect(result.noteEvidenceDedup).toMatchObject({
      originalNoteCount: parsed.notes.length,
      effectiveNoteCount: parsed.notes.length,
      duplicateCount: 0,
    });
  });

  it("is deterministic and flag OFF is exactly backward compatible", () => {
    const bytes = fixture("03_shell_fifths_pickup_irregular_exact_duplicates");
    expect(analyzeEnabled(bytes)).toEqual(analyzeEnabled(bytes));
    expect(analyzeMidi(bytes, { mode: "phase4-v1" }))
      .toEqual(analyzeMidi(bytes, {
        mode: "phase4-v1",
        phase515: { enableExactNoteEvidenceDedup: false },
      }));
  });

  it.each([
    "phase4-v1",
    "legacy-boundary-rerank",
    "hybrid-v1",
    "voice-aware-rerank-v1",
  ] satisfies MidiAnalyzerMode[])(
    "propagates one outer diagnostic without changing normalized output in %s",
    (mode) => {
      const cleanBytes = fixture("02_shell_fifths_pickup_irregular");
      const duplicateBytes = fixture("03_shell_fifths_pickup_irregular_exact_duplicates");
      const clean = analyzeMidi(cleanBytes, {
        mode,
        phase515: { enableExactNoteEvidenceDedup: true },
      });
      const duplicate = analyzeMidi(duplicateBytes, {
        mode,
        phase515: { enableExactNoteEvidenceDedup: true },
      });

      expect(clean.noteEvidenceDedup).toMatchObject({
        originalNoteCount: 33,
        effectiveNoteCount: 33,
        duplicateCount: 0,
      });
      expect(duplicate.noteEvidenceDedup).toMatchObject({
        originalNoteCount: 66,
        effectiveNoteCount: 33,
        duplicateCount: 33,
      });
      expect(normalizeAnalysis(duplicate)).toEqual(normalizeAnalysis(clean));
    },
  );

  it("propagates the primary diagnostic through Candidate Union", () => {
    const bytes = fixture("03_shell_fifths_pickup_irregular_exact_duplicates");
    const result = analyzeMidi(bytes, {
      mode: "phase4-v1",
      accuracyFirst: { enableAccuracyCandidateUnion: true },
      phase515: { enableExactNoteEvidenceDedup: true },
    });
    expect(result.noteEvidenceDedup).toMatchObject({
      originalNoteCount: 66,
      effectiveNoteCount: 33,
      duplicateCount: 33,
    });
  });
});

function fixture(id: string): Uint8Array {
  const item = contract.cases.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing contract fixture ${id}.`);
  return renderContractMidi(item);
}

function analyzeEnabled(bytes: Uint8Array) {
  return analyzeMidi(bytes, {
    mode: "phase4-v1",
    phase515: { enableExactNoteEvidenceDedup: true },
  });
}

function normalizeAnalysis(result: ReturnType<typeof analyzeMidi>) {
  const normalized: Partial<ReturnType<typeof analyzeMidi>> = { ...result };
  delete normalized.sourceFingerprint;
  delete normalized.noteEvidenceDedup;
  return normalized;
}
