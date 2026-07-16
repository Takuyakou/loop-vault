import { describe, expect, it } from "vitest";
import { normalizeNotes } from "./normalize";
import { inferTrackRoleProfiles } from "./trackRoles";
import type { MidiSongData } from "./types";

describe("track role profiles", () => {
  it("separates bass root evidence from harmony quality evidence", () => {
    const data: MidiSongData = {
      notes: [
        { pitch: 36, startTick: 0, durationTick: 480, velocity: 1, trackIndex: 0 },
        { pitch: 60, startTick: 0, durationTick: 960, velocity: 0.8, trackIndex: 1 },
        { pitch: 64, startTick: 0, durationTick: 960, velocity: 0.8, trackIndex: 1 },
        { pitch: 67, startTick: 0, durationTick: 960, velocity: 0.8, trackIndex: 1 },
      ], ticksPerBeat: 480, totalBars: 1,
      tracks: [{ index: 0, name: "Bass" }, { index: 1, name: "Rhodes" }], controlChanges: [],
    };
    const profiles = inferTrackRoleProfiles(data, normalizeNotes(data));
    expect(profiles.get(0)?.role).toBe("bass");
    expect(profiles.get(0)!.rootWeight).toBeGreaterThan(profiles.get(0)!.qualityWeight);
    expect(profiles.get(1)?.role).toBe("chord");
  });
});
