# VL-02 — Transport v2 and seek clock

Status: COMPLETE. Base: `012ced7` on `feat/voicing-loop-v2`.

## Implementation

The promoted Voicing Loop path uses `ProgressionVoicingTransportV2` behind the local `lv-voicing-loop-v2` rollback switch (`off` selects the prior transport). It registers three fixed repeat callbacks and queues only the next 1.5 seconds of chord/rest attacks with a 128-item cap. Source events are not cloned for loop iterations. Its epoch invalidates queued attacks and draw callbacks when seeking, pausing, stopping, or reconnecting. Instrument creation finishes before the v2 transport starts. The old transport implementation remains available for rollback.

Seek maps a selected source event onset to a logical progression beat. Seeking while running releases the old sound and attacks the target once; seeking while paused keeps silence until resume. Seeking in count-in restarts the count-in at the selected target. Explicit seek can move backwards; ordinary transport sync remains monotonic. Stop resets the target to the first event. Reference sound, audition, and queued audio are invalidated on seek; the existing WebAudio-only output path has no external MIDI Note Off/CC64/CC123 capability to invoke.

## Gate

Focused transport, clock, and view tests 99/99; app TypeScript PASS. The interactive card/ruler/overview controls are connected in VL-03.
