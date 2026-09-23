import { describe, expect, it } from "vitest";

import { buildMidi } from "../p534/fixtures";
import { buildBlindExcerptMidi, buildBlindRegionEvidence, type AnonymousRegionId } from "../p539/groundTruthPacket";
import { exactRankingEvidence } from "../p539/shadowCandidateRanking";
import { evaluateStage03bInteractions, projectedStateAt, projectStage03bTimeline } from "../p539/stage03bInteraction";
import { buildIndividualAlterationNeighborIdentities, type ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { parseMidi } from "../../src/domain/midi/parser";
import { rankStage01ShadowCandidates } from "./shadowCandidateGenerationCorrection";
import { isolateLocalFailure, isolateWindowDivergence, plannedWindowStates, renderStage02aSourceOnly } from "./stage02aFailureIsolation";

describe("P5.40-02a frozen Shadow failure isolation", () => {
  it("keeps ungenerated semantic truth separate from a pitch-equivalent candidate", () => {
    const correct: ShadowRootRelativeIdentity = {
      rootPitchClass: 0, triad: "minor", seventh: "minor7",
      extensions: ["9", "11"], alterations: [], omissions: [],
    };
    const result = isolateLocalFailure(rankStage01ShadowCandidates(exactRankingEvidence(correct)), correct);
    expect(result.category).toBe("SEMANTIC-GRAMMAR-MISMATCH");
    expect(result.literalGenerated).toBe(false);
    expect(result.correct).toBeNull();
    expect(result.winnerVsCorrect).toBeNull();
    expect(result.pitchEquivalent.length).toBeGreaterThan(0);
  });

  it("recomposes the signed winner-versus-correct score contributions", () => {
    const candidate = buildIndividualAlterationNeighborIdentities().find(({ identity }) => {
      const result = rankStage01ShadowCandidates(exactRankingEvidence(identity));
      return result.rankedCandidates.some((row) => row.identityKey !== result.topCandidate.identityKey
        && row.generationReason === "individual-alteration-neighbor");
    });
    if (!candidate) throw new Error("Synthetic comparison candidate unavailable");
    const result = isolateLocalFailure(
      rankStage01ShadowCandidates(exactRankingEvidence(candidate.identity)), candidate.identity,
    );
    expect(result.literalGenerated).toBe(true);
    expect(result.correct).not.toBeNull();
    expect(result.winnerVsCorrect).not.toBeNull();
    const comparison = result.winnerVsCorrect!;
    expect(Object.values(comparison.delta).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(comparison.winnerAdvantage, 12);
  });

  it("locates the first ranking divergence before Family B and smoothing", () => {
    const ticksPerBeat = 96;
    const bytes = buildMidi({
      ticksPerBeat, tempoMicrosPerBeat: 500_000,
      notes: [
        ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: ticksPerBeat })),
        ...[45, 49, 64].map((pitch) => ({ pitch, startTick: ticksPerBeat, durationTick: ticksPerBeat })),
      ],
    });
    const old = evaluateStage03bInteractions(bytes);
    const next = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
    const oldFinal = projectStage03bTimeline(old.data, old.windows, "model-a");
    const nextFinal = projectStage03bTimeline(next.data, next.windows, "model-a");
    const index = old.windows[0]?.index;
    if (index === undefined || !next.windows[0]) throw new Error("Synthetic window unavailable");
    const at = (spans: typeof oldFinal) => [0, 1].map((offset) => {
      const state = projectedStateAt(spans, index * 2 + offset + 0.5);
      if (!state) throw new Error("Synthetic final state unavailable");
      return state.identityKey;
    });
    const trace = isolateWindowDivergence(old.windows[0], next.windows[0], at(oldFinal), at(nextFinal));
    expect(trace.firstDivergence).toBe("RANKING");
    expect(trace.rankingChanged).toBe(true);
    expect(trace.smoothingCausal).toBe(false);
    expect(plannedWindowStates(next.windows[0])).toEqual(trace.shadowPlanned);
  });

  it("renders an anonymous packet from source only, without candidate or origin data", () => {
    const ticksPerBeat = 96;
    const bytes = buildMidi({
      ticksPerBeat, tempoMicrosPerBeat: 500_000,
      notes: [48, 52, 55, 59].map((pitch) => ({ pitch,
        startTick: 0, durationTick: 2 * ticksPerBeat })),
    });
    const parsed = parseMidi(bytes);
    const source = buildBlindRegionEvidence(parsed, 0, "FC-NEW-TEST" as AnonymousRegionId);
    const html = renderStage02aSourceOnly([source]);
    expect(html).toContain("FC-NEW-TEST");
    expect(html).toContain("Source notes");
    expect(html).not.toMatch(/candidate|score|origin|model-a|shadow|production/i);
    expect(buildBlindExcerptMidi(source, 120).length).toBeGreaterThan(0);
  });
});
