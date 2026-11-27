import { describe,expect,it } from "vitest";
import { audibleSignature,evaluateHarmonicCandidate,harmonicGoldExamples,harmonicTruthVersion,validateHarmonicGold } from "./harmonicTruth";

describe("P7 Tier 2 independent harmonic truth",()=>{
  it("validates authored rootless, omission, altered, slash, and equivalent-label cases",()=>{
    expect(harmonicGoldExamples.every((entry)=>entry.version===harmonicTruthVersion&&validateHarmonicGold(entry).length===0)).toBe(true);
  });
  it("separates playback equivalence, semantic identity, and naming-only change",()=>{
    const gold=harmonicGoldExamples[0]!;
    const alternate=evaluateHarmonicCandidate(gold,{label:"Am7/C",identity:gold.identities[1],playedMidi:[48,52,55,57]});
    expect(alternate).toMatchObject({playbackEquivalent:true,identityAccepted:true,canonicalExact:false,namingOnly:false});
    expect(evaluateHarmonicCandidate(gold,{label:"C(add6)",identity:gold.identities[0],playedMidi:[48,52,55,57]}))
      .toMatchObject({playbackEquivalent:true,identityAccepted:true,canonicalExact:false,namingOnly:true});
    const otherIdentity=evaluateHarmonicCandidate(gold,{label:"unknown",identity:{root:0,quality:"maj",bass:0,factors:[]},playedMidi:[48,52,55,57]});
    expect(otherIdentity).toMatchObject({playbackEquivalent:true,identityAccepted:false,semanticMismatch:true,namingOnly:false});
  });
  it("keeps renderer-only mismatch separate from identity and octave/register errors",()=>{
    const gold=harmonicGoldExamples[1]!;
    expect(evaluateHarmonicCandidate(gold,{label:"C9",identity:gold.identities[0],playedMidi:[48,52,58,62]}))
      .toMatchObject({identityAccepted:true,playbackEquivalent:false,rendererOnlyMismatch:true});
    expect(audibleSignature([48,60,64])).toEqual(audibleSignature([36,52,60]));
  });
});
