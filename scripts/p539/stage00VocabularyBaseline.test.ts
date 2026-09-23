import { describe, expect, it } from "vitest";

import { classifyRepresentability, detectorQualities } from "../../src/domain/midi/evaluation/metricsV2";
import {
  buildStage00VocabularyBaseline,
  canonicalKey,
  summarizeStage00VocabularyBaseline,
} from "./stage00VocabularyBaseline";

describe("P5.39-00 vocabulary and representability baseline", () => {
  it("freezes the current closed vocabulary and generated 12-root baseline", () => {
    const rows = buildStage00VocabularyBaseline();
    const summary = summarizeStage00VocabularyBaseline(rows);

    expect(detectorQualities).toHaveLength(21);
    expect(summary).toMatchInlineSnapshot(`
      {
        "classifications": {
          "not-representable": 24,
          "parser-unsupported": 24,
          "representable-correct": 264,
          "representable-misranked": 0,
        },
        "maxCandidateCount": 252,
        "minCandidateCount": 252,
        "misrankedFamilies": {},
        "neighboringUnsupportedRows": 24,
        "qualityCount": 21,
        "roots": 12,
        "slashControlRows": 12,
        "supportedControlRows": 252,
        "targetRows": 24,
      }
    `);
  });

  it("separates parser limits from detector-vocabulary limits", () => {
    const rows = buildStage00VocabularyBaseline();
    const targets = rows.filter((row) => row.id.startsWith("target:"));
    const neighbors = rows.filter((row) => row.id.startsWith("neighbor:"));

    expect(targets).toHaveLength(24);
    expect(targets.every((row) => row.classification === "parser-unsupported")).toBe(true);
    expect(neighbors).toHaveLength(24);
    expect(neighbors.every((row) => row.classification === "not-representable")).toBe(true);
    expect(neighbors.every((row) => (
      classifyRepresentability(row.targetLabel).representability
        === "detector-vocabulary-unsupported"
    ))).toBe(true);
  });

  it("keeps supported canonical identities representable across all roots", () => {
    const rows = buildStage00VocabularyBaseline();
    const controls = rows.filter((row) => row.id.startsWith("control:"));

    expect(controls).toHaveLength(12 * detectorQualities.length);
    expect(controls.every((row) => canonicalKey(row.targetLabel) !== null)).toBe(true);
    expect(controls.every((row) => (
      classifyRepresentability(row.targetLabel).representability === "representable"
    ))).toBe(true);
  });

  it("is deterministic and keeps candidate enumeration bounded", () => {
    const first = buildStage00VocabularyBaseline();
    const second = buildStage00VocabularyBaseline();

    expect(second).toEqual(first);
    expect(first.every((row) => row.candidateCount === 252)).toBe(true);
  });
});
