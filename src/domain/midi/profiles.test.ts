import { describe, expect, it } from "vitest";
import { normalizeNotes } from "./normalize";
import { extractOrnamentFeatures } from "./ornaments";
import { buildCumulativePitchFeatures, buildWeightedPitchProfile, profileFromCumulative } from "./profiles";
import { inferTrackRoleProfiles } from "./trackRoles";

describe("cumulative pitch features", () => {
  it("matches naive weighted aggregation at candidate boundaries", () => {
    const data = { notes: [
      { pitch: 48, startTick: 0, durationTick: 960, velocity: 0.8, trackIndex: 0 },
      { pitch: 64, startTick: 0, durationTick: 480, velocity: 0.8, trackIndex: 1 },
      { pitch: 67, startTick: 480, durationTick: 480, velocity: 0.8, trackIndex: 1 },
    ], ticksPerBeat: 480, totalBars: 1, tracks: [{ index: 0, name: "Bass" }, { index: 1, name: "Keys" }], controlChanges: [] };
    const notes = normalizeNotes(data);
    const roles = inferTrackRoleProfiles(data, notes);
    const ornaments = extractOrnamentFeatures(notes);
    const cumulative = buildCumulativePitchFeatures(notes, [0, 1, 2], roles, ornaments, 4);
    const fromPrefix = profileFromCumulative(cumulative, 0, 2);
    const naive = buildWeightedPitchProfile(notes, { startBeat: 0, endBeat: 2 }, roles, ornaments, 4);
    expect(fromPrefix.qualityPcs).toEqual(naive.qualityPcs);
    expect(fromPrefix.rootPcs).toEqual(naive.rootPcs);
  });
});
