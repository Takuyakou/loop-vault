import { describe, expect, it } from "vitest";
import { advisorSuggestionToCandidate } from "./advisorDraft";
import { summarizeAdvisorEvaluations } from "./evaluation";
import { validateAdvisorResponse } from "./validateAdvisorResponse";
import type { AdvisorResponse, AdvisorStrategy } from "./types";

function response(): AdvisorResponse {
  return {
    schemaVersion: 1,
    analysis: "Three distinct directions.",
    suggestions: [
      suggestion("close", "close_development", "Cmaj7"),
      suggestion("contrast", "contrast", "Fm9"),
      suggestion("experimental", "experimental", "G7"),
    ],
    suggestedTagIds: ["mood.dreamy"],
  };
}

function suggestion(id: string, strategy: AdvisorStrategy, chord: string) {
  return {
    id,
    strategy,
    label: id,
    intent: `${strategy} intent`,
    key: "C",
    mode: "major",
    bars: 8 as const,
    timeSignature: "4/4" as const,
    events: Array.from({ length: 8 }, (_, index) => ({ bar: index + 1, startBeat: 1, durationBeats: 4, chord })),
    suggestedTagIds: ["use.variation"],
  };
}

describe("Progression Advisor response validation", () => {
  it("accepts exactly three complete and distinct strategies", () => {
    const result = validateAdvisorResponse(response());

    expect(result.success).toBe(true);
    if (result.success) expect(result.response.suggestions).toHaveLength(3);
  });

  it("rejects unknown fields and wrong suggestion counts", () => {
    expect(validateAdvisorResponse({ ...response(), hidden: true }).success).toBe(false);
    expect(validateAdvisorResponse({ ...response(), suggestions: response().suggestions.slice(0, 2) }).success).toBe(false);
  });

  it("requires each strategy exactly once", () => {
    const value = response();
    value.suggestions[2] = suggestion("duplicate-strategy", "contrast", "Am7");

    const result = validateAdvisorResponse(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.code === "strategy")).toBe(true);
  });

  it("rejects unknown taxonomy IDs and unsupported chords", () => {
    const unknownTag = response();
    unknownTag.suggestedTagIds = ["mood.not-real"];
    expect(validateAdvisorResponse(unknownTag).success).toBe(false);

    const invalidChord = response();
    invalidChord.suggestions[0]!.events[0]!.chord = "DefinitelyNotAChord";
    const chordResult = validateAdvisorResponse(invalidChord);
    expect(chordResult.success).toBe(false);
    if (!chordResult.success) expect(chordResult.issues.some((issue) => issue.code === "chord")).toBe(true);
  });

  it("rejects gaps, overlaps, cross-bar events, and incomplete bars", () => {
    const gap = response();
    gap.suggestions[0]!.events[0] = { bar: 1, startBeat: 2, durationBeats: 3, chord: "Cmaj7" };
    expect(validateAdvisorResponse(gap).success).toBe(false);

    const overlap = response();
    overlap.suggestions[0]!.events.splice(1, 0, { bar: 1, startBeat: 3, durationBeats: 1, chord: "Dm7" });
    expect(validateAdvisorResponse(overlap).success).toBe(false);

    const crossing = response();
    crossing.suggestions[0]!.events[0] = { bar: 1, startBeat: 1, durationBeats: 4.5, chord: "Cmaj7" };
    expect(validateAdvisorResponse(crossing).success).toBe(false);

    const incomplete = response();
    incomplete.suggestions[0]!.events.pop();
    expect(validateAdvisorResponse(incomplete).success).toBe(false);
  });

  it("rejects three labels wrapped around the same progression", () => {
    const duplicate = response();
    duplicate.suggestions[1]!.events = duplicate.suggestions[0]!.events.map((event) => ({ ...event }));

    const result = validateAdvisorResponse(duplicate);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.code === "duplicate")).toBe(true);
  });

  it("normalizes event order and duplicate tags deterministically", () => {
    const value = response();
    value.suggestedTagIds.push("mood.dreamy");
    value.suggestions[0]!.events.reverse();
    const first = validateAdvisorResponse(value);
    const second = validateAdvisorResponse(value);

    expect(first).toEqual(second);
    if (first.success) {
      expect(first.response.suggestedTagIds).toEqual(["mood.dreamy"]);
      expect(first.response.suggestions[0]!.events[0]!.bar).toBe(1);
    }
  });

  it("converts an accepted suggestion into an unverified candidate", () => {
    const candidate = advisorSuggestionToCandidate(response().suggestions[0]!);

    expect(candidate).toMatchObject({ startBar: 1, endBar: 8, lengthBars: 8, confidence: 0 });
    expect(candidate.chords).toHaveLength(8);
    expect(candidate.warnings).toContain("ai-generated-unverified");
    expect(candidate).not.toHaveProperty("userVerified");
  });

  it("summarizes fixed evaluation outcomes", () => {
    const valid = validateAdvisorResponse(response());
    const invalid = validateAdvisorResponse({});

    expect(summarizeAdvisorEvaluations([valid, invalid])).toEqual({ total: 2, accepted: 1, rejected: 1, acceptanceRate: 0.5 });
  });
});
