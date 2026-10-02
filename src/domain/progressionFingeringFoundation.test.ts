import { describe, expect, it } from "vitest";
import { generateFingeringCandidates, rankCyclicFingerings, type FingeringCostModel, type ProgressionFingeringEvent } from "./progressionFingering";
import { computeNextMoves, fixedFingerSlots } from "../voicingPractice/nextMove";
const events = (notes: number[][]): ProgressionFingeringEvent[] => notes.map((midiPitches, i) => ({ id: String(i), hand: "right", midiPitches, startSeconds: i, durationSeconds: 1 }));
const continuity: FingeringCostModel = { local: () => 0, transition: (a, i, b, j) => Math.abs(a.candidates[i]!.fingers[0]! - b.candidates[j]!.fingers[0]!) };
describe("P11-13a ranker foundation", () => {
  it("fixes Saved inside the solver, connects adjacent Auto and restores after reset", () => {
    const input = events([[60], [62], [64]]);
    const before = rankCyclicFingerings(input, { costModel: continuity });
    const saved = generateFingeringCandidates(input[1]!);
    if (saved.status !== "supported") throw Error("fixture");
    const anchor = saved.candidates.find(c => c.fingers.join() !== (before[1]!.status === "supported" ? before[1]!.fingers.join() : ""))!;
    const anchors = new Map([["1", { signature: saved.signature, fingers: anchor.fingers }]]);
    const anchored = rankCyclicFingerings(input, { costModel: continuity, anchors });
    expect(anchored[1]).toMatchObject({ fingers: anchor.fingers });
    expect(anchored[0]).not.toEqual(before[0]); expect(anchored[2]).not.toEqual(before[2]);
    expect(rankCyclicFingerings(input, { costModel: continuity })).toEqual(before);
    expect(rankCyclicFingerings(input, { costModel: continuity, anchors: new Map([["1", { signature: "wrong", fingers: anchor.fingers }]]) })).toEqual(before);
  });
  it("isolates unresolved segments; empty hands retain available time", () => {
    const input = events([[60], [64], [60,61,62,63,64,65], [67], [71]]);
    const ranked = rankCyclicFingerings(input, { costModel: continuity });
    expect(ranked.slice(0,2)).toEqual(rankCyclicFingerings(input.slice(0,2), { costModel: continuity, cyclic: false }));
    expect(ranked.slice(3)).toEqual(rankCyclicFingerings(input.slice(3), { costModel: continuity, cyclic: false }));
    expect(ranked[2]!.status).toBe("unavailable");
    const times: number[] = [];
    rankCyclicFingerings(events([[60], [], [], [64]]), { costModel: { local: () => 0, transition: (_a,_i,_b,_j,seconds) => { times.push(seconds); return 0; } } });
    expect(new Set(times)).toEqual(new Set([1,3]));
  });
  it("keeps notes and candidates unchanged and resolves ties deterministically", () => {
    const input = events([[60,64], [61,65], [62,66]]); const source = JSON.stringify(input);
    const before = input.map(generateFingeringCandidates);
    const selected = rankCyclicFingerings(input, { costModel: continuity });
    for(let i=0;i<20;i++) expect(rankCyclicFingerings(input, { costModel: continuity })).toEqual(selected);
    expect(input.map(generateFingeringCandidates)).toEqual(before); expect(JSON.stringify(input)).toBe(source);
  });
  it("keeps the known finger in partial Next Move; marks only unknown endpoints", () => {
    const known = { id: "a", status: "supported" as const, signature: "R:60,67", pitches: [60,67], fingers: [1,5] as const };
    const release = computeNextMoves({left:[],right:[60,67]}, {left:[],right:[]}, {right:known});
    expect(release.find(m=>m.from===67)).toMatchObject({finger:5,certainty:"partial"});
    expect(fixedFingerSlots(release).find(slot=>slot.hand==="right"&&slot.finger===5)!.moves[0]!.from).toBe(67);
    const forward = computeNextMoves({left:[],right:[60,67]}, {left:[],right:[62,69]}, {right:known});
    expect(forward.every(m=>m.finger!==undefined && m.toEstimated && !m.fromEstimated)).toBe(true);
    const back = computeNextMoves({left:[],right:[62,69]}, {left:[],right:[60,67]}, {}, {right:known});
    expect(back.find(m=>m.to===67)).toMatchObject({finger:5,fromEstimated:true,toEstimated:false});
    expect(computeNextMoves({left:[],right:[60,67]}, {left:[],right:[60,67]}, {right:known},{right:known}).every(m=>m.certainty==="confirmed")).toBe(true);
    expect(computeNextMoves({left:[],right:[60]}, {left:[],right:[62]}).every(m=>m.certainty==="estimated")).toBe(true);
  });
});
