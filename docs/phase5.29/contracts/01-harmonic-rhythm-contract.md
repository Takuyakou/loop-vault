<!-- phase-id: 5.29 -->

# P5.29 Harmonic Rhythm Contract

## Timing authority

Saved event bar, beat and durationBeats are the authority. The existing detached
snapshot converts them to continuous startBeat/durationBeats on the P5.27 grid.
No consumer replaces a one- or two-beat duration with four beats.

The canonical fixture has starts 0,4,6,8,12, durations 4,2,2,4,4, and length
16 beats. Mixed one/two/four-chord bars retain exact one/two/four-beat durations.

## One clock

Tone Transport remains the only musical clock. Existing domain projection
drives Current, Next, beat-in-chord, position and Loop count. Existing playback
schedules event starts from the same snapshot. No new timeout, interval or
independent UI clock is introduced.

The beat display resets to 1/2 for each two-beat event and 1/1 for a one-beat
event. Event advancement occurs exactly at the next saved onset. Last-to-first
wrap increments Loop count without repeating count-in.

## Handoff and selections

Text parse -> Draft -> store save -> repository reload -> Vault handoff must
retain timing, BPM and Key. Existing saved Vault events are used unchanged.
All five voicing selections retain identical timing. Source/Custom exact pitches
and octaves remain detached and never silently fall back.

Pause/Resume retains musical position. BPM changes alter beat duration, not event
durations or starts. Restart resets to the beginning and reapplies configured
count-in. Existing runtime request invalidation is unchanged.

## Presentation

Only the progression strip may gain compact practice-bar, onset and duration
metadata derived directly during render from snapshot events. Existing visual
tokens, wrapping, keyboard flow and reduced-motion behavior remain unchanged.
No animation or new state is justified for a high-frequency clock surface.

## Acceptance

Cover one/two/four-chord bars, mixed durations, canonical fixture, exact boundaries,
Loop, Pause/Resume, Restart, BPM, Text persistence, Vault handoff, all voicing modes,
reference playback and P5.27/P5.28 regression. Use synthetic musical fixtures only.
