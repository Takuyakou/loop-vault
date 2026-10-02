import type { MidiPreviewNote } from "../../audio/chordPreview";
import { textMetronomeNotes } from "../textMetronomeNotes";
import type { ChordTimelineItem } from "../types";
import type { CorrectionModel } from "./correctionModel";
import { cardAuditionNotes } from "./saveCandidate";

const EPSILON = 1e-6;
/** The old timeline player's loudness (0.7) and its 90% / 0.4s note lengths, so the song sounds as before. */
const VELOCITY = 89;

/**
 * P10.2 §2: the workspace's song as notes — every card plays its 「B カードの音」
 * (`cardAuditionNotes`, what saving writes) over its span. From `fromBeat` to the end,
 * shifted so `fromBeat` is beat 0; a card sounding at `fromBeat` is clipped to start there.
 * §6: with `metronome`, a click on every beat of the song, counted in the song's bars.
 */
export function songPlaybackNotes(
  model: CorrectionModel,
  timeline: readonly ChordTimelineItem[],
  fromBeat: number,
  bpm: number,
  metronome = false,
): MidiPreviewNote[] {
  const notes: MidiPreviewNote[] = [];
  let endBeat = fromBeat;
  for (const card of model.cards) {
    const end = card.start + card.duration;
    if (end <= fromBeat + EPSILON) continue;
    const start = Math.max(card.start, fromBeat);
    const durationBeats = Math.max(0.4 * bpm / 60, (end - start) * 0.9);
    endBeat = Math.max(endBeat, end);
    for (const pitch of cardAuditionNotes(model, card, timeline)) {
      notes.push({ pitch, startBeat: start - fromBeat, durationBeats, velocity: VELOCITY });
    }
  }
  if (metronome) notes.push(...songClicks(fromBeat, endBeat, model.context.meter));
  return notes;
}

/** Clicks on the song's beats from `fromBeat` (bar heads by the song's bars, not the cut). */
export function songClicks(fromBeat: number, endBeat: number, meter: number): MidiPreviewNote[] {
  return textMetronomeNotes(Math.ceil(endBeat - EPSILON), meter)
    .filter((click) => click.startBeat >= fromBeat - EPSILON)
    .map((click) => ({ ...click, startBeat: click.startBeat - fromBeat }));
}
