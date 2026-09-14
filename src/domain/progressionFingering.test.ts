import { describe, expect, it } from "vitest";
import {
  generateFingeringCandidates,
  physicalVoicingSignature,
  rankCyclicFingerings,
  type ProgressionFingeringEvent,
} from "./progressionFingering";
const chord=(root:number,quality:"maj"|"min",label:string)=>({root,quality,tensions:[] as const,label});
describe("progression fingering candidates",()=>{
 it("matches guide triad and generic priors",()=>{ const root=generateFingeringCandidates({hand:"right",midiPitches:[60,64,67],chord:chord(0,"maj","C")}); const second=generateFingeringCandidates({hand:"left",midiPitches:[55,60,64],chord:chord(0,"maj","C/G")}); expect(root.status==="supported"?root.candidates[0]!.fingers:[]).toEqual([1,3,5]); expect(second.status==="supported"?second.candidates[0]!.fingers:[]).toEqual([5,2,1]); });
 it("bounds candidate counts and rejects more than five",()=>{ expect([1,2,3,4,5].map(n=>{const r=generateFingeringCandidates({hand:"right",midiPitches:Array.from({length:n},(_,i)=>60+i)}); return r.status==="supported"?r.candidates.length:0;})).toEqual([5,10,10,5,1]); expect(generateFingeringCandidates({hand:"right",midiPitches:[60,61,62,63,64,65]})).toEqual({status:"unavailable",reason:"too-many-keys"}); });
 it("normalizes without mutating and is deterministic",()=>{const p=[67,60,64,60]; const a=generateFingeringCandidates({hand:"left",midiPitches:p}); const b=generateFingeringCandidates({hand:"left",midiPitches:p}); expect(a).toEqual(b); expect(p).toEqual([67,60,64,60]); expect(physicalVoicingSignature("left",p)).toBe("L:60,64,67");});
});

describe("cyclic progression fingering ranking", () => {
  const events = (pitches: readonly (readonly number[])[]): ProgressionFingeringEvent[] =>
    pitches.map((midiPitches, index) => ({ id: `event-${index}`, hand: "right", midiPitches }));

  it("matches the guide's Dm9 - G13 - Cmaj9 fingering", () => {
    const result = rankCyclicFingerings(events([
      [53, 57, 60, 64],
      [53, 57, 59, 64],
      [52, 55, 59, 62],
    ]));
    expect(result.map((entry) => entry.status === "supported" ? entry.fingers : [])).toEqual([
      [1, 2, 3, 5],
      [1, 2, 3, 5],
      [1, 2, 3, 5],
    ]);
  });

  it("preserves the eight-chord guide pitches and prior", () => {
    const pitches = [
      [55, 59, 60, 64], [54, 59, 60, 64], [54, 57, 59, 62], [52, 55, 59, 62],
      [52, 54, 57, 60], [51, 55, 57, 59], [50, 54, 55, 59], [50, 52, 56, 60],
    ];
    const result = rankCyclicFingerings(events(pitches));
    expect(result.map((entry) => entry.status === "supported" ? entry.pitches : [])).toEqual(pitches);
    expect(result.map((entry) => entry.status === "supported" ? entry.fingers : [])).toEqual(
      Array.from({ length: 8 }, () => [1, 2, 3, 5]),
    );
  });

  it("is deterministic and invariant to rotating the loop boundary", () => {
    const source = events([[60, 64, 67], [60, 65, 69], [59, 62, 67]]);
    const original = rankCyclicFingerings(source);
    const rotated = rankCyclicFingerings([source[1]!, source[2]!, source[0]!]);
    const byId = (result: typeof original) => Object.fromEntries(result.map((entry) => [
      entry.id,
      entry.status === "supported" ? entry.fingers : [],
    ]));
    expect(byId(rotated)).toEqual(byId(original));
    expect(rankCyclicFingerings(source)).toEqual(original);
  });

  it("handles one event, repeated voicings, finger substitution, and black-key thumbs", () => {
    expect(rankCyclicFingerings(events([[60, 64, 67]]))[0]).toMatchObject({
      status: "supported",
      fingers: [1, 3, 5],
    });
    expect(rankCyclicFingerings(events([[60, 64], [60, 64]]))).toEqual([
      expect.objectContaining({ fingers: [1, 5] }),
      expect.objectContaining({ fingers: [1, 5] }),
    ]);

    const substitution = rankCyclicFingerings(events([[60, 64], [60, 67, 71]]));
    expect(substitution.every((entry) => entry.status === "supported")).toBe(true);
    const blackThumb = generateFingeringCandidates({ hand: "right", midiPitches: [61, 65, 68] });
    expect(blackThumb.status === "supported" && blackThumb.candidates.some((candidate) => candidate.fingers[0] === 1)).toBe(true);
  });

  it("keeps the input immutable and remains bounded for 128 events", () => {
    const source = Array.from({ length: 128 }, (_, index) => [48 + index % 12, 52 + index % 12, 55 + index % 12]);
    const before = source.map((pitches) => [...pitches]);
    const startedAt = performance.now();
    const result = rankCyclicFingerings(events(source));
    expect(result).toHaveLength(128);
    expect(source).toEqual(before);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("fails individual unsupported events closed", () => {
    const result = rankCyclicFingerings(events([[60, 64], [], [60, 61, 62, 63, 64, 65]]));
    expect(result.map((entry) => entry.status)).toEqual(["supported", "unavailable", "unavailable"]);
  });
});
