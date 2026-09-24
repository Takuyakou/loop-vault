# VL-04 — 128 PracticeGroup long-form bound

Status: COMPLETE. Base: `40a9afe` on `feat/voicing-loop-v2`.

The Voicing Loop detached snapshot cap is 128 four-beat PracticeGroups (512 quarter-note beats). The existing independent limits on source beats, source duration, and event count stay in place. The source meter remains the original constant 1/4 through 12/4 meter; a PracticeGroup is a display/count-in grouping and never a rewritten source bar. Source event starts and durations remain absolute beat facts.

Synthetic tests accept 512 beats and reject 516 as `resource-budget`, cover each supported numerator from 1 through 12, and start a 128-event/128-group V2 session with only three fixed registered callbacks and bounded pending work. Stop clears all schedules and instruments. The synthetic checks do not exercise private MIDI.

Gate: focused snapshot 24/24, transport 32/32, app TypeScript PASS.
