import { describe, expect, it } from "vitest";
import { voiceChordForPreview } from "../../src/domain/chordVoicing";
import { parseChordLabel } from "../../src/domain/chords";
import { tier2AuthoredGold } from "./tier2AuthoredGold";
import { scoreTier2, scoreTier2Ranking, validateTier2Gold } from "./tier2Scorer";
const [equivalent, rootless, omission, altered, extension, slash] = tier2AuthoredGold;
const rendered = (label: string) => {
  const symbol = parseChordLabel(label);
  if (!symbol) throw new Error(`Unrenderable fixture ${label}`);
  return { origin: "CANDIDATE_RENDERER" as const, midi: voiceChordForPreview(symbol).notes };
};
describe("P9.4 independent Tier 2 scorer", () => {
  it("validates authored labels and rejects missing independent role metadata", () => {
    expect(tier2AuthoredGold.map(validateTier2Gold)).toEqual([[], [], [], [], [], []]);
    expect(validateTier2Gold({ ...equivalent!, definingPitchClasses: [3] })).toContain("role-not-audible");
  });
  it("separates canonical, alternate and notation-only identities", () => {
    const gold = equivalent!;
    expect(scoreTier2(gold, { label: "C6", identity: gold.harmonic.identities[0] }).disposition).toBe("CANONICAL");
    expect(scoreTier2(gold, { label: "Am7/C", identity: gold.harmonic.identities[1] }).disposition).toBe("ACCEPTED_ALTERNATE");
    expect(scoreTier2(gold, { label: "C(add6)", identity: gold.harmonic.identities[0] }).disposition).toBe("NOTATION_ONLY");
  });
  it("never counts source Gold notes as candidate playback when renderer is absent", () => {
    const row = scoreTier2(rootless!, { identity: rootless!.harmonic.identities[0] });
    expect(row.playbackEquivalent).toBeNull();
    expect(row.definingToneLoss).toBeNull();
    expect(row.playbackAvailable).toBe(false);
  });
  it("keeps audible equivalence separate from semantic agreement", () => {
    const gold = equivalent!;
    const wrong = { root: 0, quality: "maj", bass: 0, factors: [] };
    const row = scoreTier2(gold, { identity: wrong, playback: rendered("C6") });
    expect(row.playbackEquivalent).toBe(true);
    expect(row.acceptedIdentity).toBe(false);
    expect(row.disposition).toBe("SAME_SOUND_DIFFERENT_MEANING");
  });
  it("distinguishes defining-tone loss, optional omission, and renderer mismatch", () => {
    expect(scoreTier2(altered!, { identity: altered!.harmonic.identities[0],
      playback: { origin: "CANDIDATE_RENDERER", midi: [48, 52, 58, 61] } }).disposition).toBe("DEFINING_TONE_LOSS");
    expect(scoreTier2(extension!, { identity: extension!.harmonic.identities[0],
      playback: { origin: "CANDIDATE_RENDERER", midi: [48, 52, 58, 69] } }).disposition).toBe("OPTIONAL_TONE_OMISSION");
    expect(scoreTier2(rootless!, { identity: rootless!.harmonic.identities[0],
      playback: { origin: "CANDIDATE_RENDERER", midi: [48, 52, 58, 62] } }).disposition).toBe("RENDERER_MISMATCH");
  });
  it("scores slash bass and pitch-class plus bass independently", () => {
    const row = scoreTier2(slash!, { identity: slash!.harmonic.identities[0],
      playback: { origin: "CANDIDATE_RENDERER", midi: [48, 52, 55, 59] } });
    expect(row.samePitchClasses).toBe(true);
    expect(row.bassAgreement).toBe(false);
    expect(row.playbackEquivalent).toBe(false);
  });
  it("reports unsupported vocabulary, unknown and ambiguity explicitly", () => {
    expect(scoreTier2({ ...omission!, vocabularyStatus: "UNSUPPORTED" },
      { identity: omission!.harmonic.identities[0] }).disposition).toBe("UNSUPPORTED_VOCABULARY");
    expect(scoreTier2(omission!, { unknown: true }).disposition).toBe("UNKNOWN_INCORRECT");
    expect(scoreTier2({ ...omission!, identityStatus: "AMBIGUOUS" }, { unknown: true }).disposition).toBe("AMBIGUOUS_UNKNOWN");
  });
  it("tracks full, bounded, Top3 and Top1 independently", () => {
    const gold = equivalent!;
    const bad = { identity: { root: 0, quality: "maj", bass: 0, factors: [] } };
    const good = { identity: gold.harmonic.identities[1] };
    const row = scoreTier2Ranking(gold, [bad, bad, bad, good], 3);
    expect(row).toMatchObject({ fullAcceptedRecall: true, boundedAcceptedRecall: false,
      top3Accepted: false, top1Accepted: false, top1PlaybackAvailable: false });
  });
});
