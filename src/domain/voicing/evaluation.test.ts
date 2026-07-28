import { describe, expect, it } from "vitest";
import {
  leakedNotes,
  voicingNoteSetMetrics,
  voicingRegisterMetrics,
  voicingRepresentationMetrics,
} from "./evaluation";

describe("voicing evaluation", () => {
  it("separates precision loss from recall loss", () => {
    expect(voicingNoteSetMetrics([48, 60, 64, 71], [48, 60, 64, 67])).toMatchObject({
      exact: false,
      truePositive: 3,
      extraNoteCount: 1,
      missingNoteCount: 1,
      precision: 0.75,
      recall: 0.75,
      f1: 0.75,
    });
  });

  it("treats two empty N.C. note sets as exact", () => {
    expect(voicingNoteSetMetrics([], [])).toMatchObject({
      exact: true,
      precision: 1,
      recall: 1,
      f1: 1,
    });
    expect(voicingRegisterMetrics([], [])).toMatchObject({
      bassNoteCorrect: true,
      topNoteCorrect: true,
      registerExact: true,
    });
  });

  it("reports bass, top and octave register errors independently", () => {
    expect(voicingRegisterMetrics([36, 60, 76], [48, 60, 72])).toEqual({
      bassNoteCorrect: false,
      topNoteCorrect: false,
      lowestNoteAbsoluteError: 12,
      highestNoteAbsoluteError: 4,
      registerExact: false,
      octaveError: true,
    });
  });

  it("does not call aggregated or empty evidence simultaneous", () => {
    expect(voicingRepresentationMetrics("simultaneous-voicing", "aggregated")).toMatchObject({
      accurate: false,
      aggregatedAsSimultaneous: true,
    });
    expect(voicingRepresentationMetrics(undefined, "none")).toMatchObject({
      accurate: true,
      actual: "none",
    });
  });

  it("only counts distractors that are not also Gold notes", () => {
    expect(leakedNotes([48, 60, 61, 67], [48, 60, 67], [60, 61])).toEqual([61]);
  });
});
