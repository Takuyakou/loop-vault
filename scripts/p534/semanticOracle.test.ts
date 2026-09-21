import { describe, expect, it } from "vitest";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { progressionFixture, timingFixtures } from "./fixtures";
import { instrument } from "./isolationCore";
import { SEMANTIC_ORACLE, classifySemantic, type SemanticClassification } from "./semanticOracle";

function classification(id: string): SemanticClassification {
  const entry = SEMANTIC_ORACLE.find((e) => e.id === id)!;
  return classifySemantic(entry).classification;
}

function top1(id: string): string {
  const entry = SEMANTIC_ORACLE.find((e) => e.id === id)!;
  return classifySemantic(entry).top1Label;
}

describe("semantic regression corpus (S01–S07)", () => {
  it("S01 Abmaj9 is representable and correct", () => {
    expect(classification("S01")).toBe("REPRESENTABLE_AND_CORRECT");
    expect(top1("S01")).toBe("Abmaj9");
  });

  it("S02 altered dominant is a representability limit (no5 unsupported)", () => {
    const r = classifySemantic(SEMANTIC_ORACLE.find((e) => e.id === "S02")!);
    expect(r.classification).toBe("REPRESENTABILITY_LIMIT");
    // defining major 3rd (B, pc 11) must be reported unexplained
    expect(r.explanation.unexplainedObserved).toContain(11);
  });

  it("S03 Bm7 positive control passes", () => {
    expect(classification("S03")).toBe("REPRESENTABLE_AND_CORRECT");
    expect(top1("S03")).toBe("Bm7");
  });

  it("S04 B11(no5) is a representability limit, major 3rd preserved", () => {
    const r = classifySemantic(SEMANTIC_ORACLE.find((e) => e.id === "S04")!);
    expect(r.classification).toBe("REPRESENTABILITY_LIMIT");
    expect(r.explanation.top1PitchClasses).toContain(3); // D# major 3rd
  });

  it("S05 C/E structural bass is preserved", () => {
    expect(classification("S05")).toBe("REPRESENTABLE_AND_CORRECT");
    expect(top1("S05")).toBe("C/E");
  });

  it("S06 G7sus4 positive control passes", () => {
    expect(classification("S06")).toBe("REPRESENTABLE_AND_CORRECT");
    expect(top1("S06")).toBe("G7sus4");
  });

  it("S07 Bm7b5 positive control passes", () => {
    expect(classification("S07")).toBe("REPRESENTABLE_AND_CORRECT");
    expect(top1("S07")).toBe("Bm7b5");
  });
});

describe("meter characterization (failure-lock, not desired behavior)", () => {
  it("1/4 and 4/4 share identical windows/timeline, but diverge on bar/dash/block", () => {
    const roles14 = inferTrackRoles(parseMidi(progressionFixture(1, 4)), null);
    const a = instrument(parseMidi(progressionFixture(1, 4)), roles14);
    const roles44 = inferTrackRoles(parseMidi(progressionFixture(4, 4)), null);
    const b = instrument(parseMidi(progressionFixture(4, 4)), roles44);

    expect(a.counts.windowCount).toBe(b.counts.windowCount);
    expect(a.counts.rawTimelineItemCount).toBe(b.counts.rawTimelineItemCount);
    expect(a.counts.timelineItemCount).toBe(b.counts.timelineItemCount);
    expect(a.labels).toEqual(b.labels);

    const currentBaseline = {
      fragmentationObserved: a.counts.formattedBarCount > b.counts.formattedBarCount,
    };
    expect(currentBaseline.fragmentationObserved).toBe(true);
    expect(a.counts.dashCount).toBeGreaterThan(b.counts.dashCount);
  });
});

describe("timing hard negatives", () => {
  function result(id: string) {
    const tf = timingFixtures.find((f) => f.id === id)!;
    const data = parseMidi(tf.build());
    return instrument(data, inferTrackRoles(data, null));
  }

  it("T06 genuine two-chord boundary is preserved", () => {
    expect(result("T06").counts.boundaryCount).toBeGreaterThanOrEqual(1);
  });

  it("T07 arpeggio is not verticalized into a false boundary", () => {
    expect(result("T07").counts.boundaryCount).toBe(0);
  });

  it("T08 structural slash-bass change is preserved", () => {
    expect(result("T08").counts.boundaryCount).toBeGreaterThanOrEqual(1);
  });

  it("T05 bass re-strike is not a boundary primitive", () => {
    expect(result("T05").counts.boundaryCount).toBe(0);
  });
});
