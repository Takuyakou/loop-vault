import type { P524SyntheticNote } from "./harmonicFragmentFixtures";
import type { P524ShadowNote } from "../../src/domain/midi/harmonicState/shadowEvidence";

export * from "../../src/domain/midi/harmonicState/shadowEvidence";

export function toP524ShadowNotes(
  notes: readonly P524SyntheticNote[],
): readonly P524ShadowNote[] {
  return notes.map(({ id, pitch, startBeat, durationBeats, velocity }) => ({
    id,
    pitch,
    startBeat,
    durationBeats,
    velocity,
  }));
}
