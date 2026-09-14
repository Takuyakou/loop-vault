# P5.32 Run Remaining Prompt

Continue Phase 5.32 from the exact execution state.

Run the next authorized stage only, unless this prompt is explicitly used to run
all remaining stages. If running all remaining stages, continue sequentially
only while every hard gate passes.

At every stage boundary:

- verify Git and prior-stage report;
- run focused gates;
- update report/execution state;
- explicit-path stage only;
- review staged diff;
- commit;
- confirm clean tracked status.

Hard stops:

- resolved voicing would need mutation to support fingering;
- a “correctness” / scoring path is introduced;
- candidate search becomes unbounded;
- personal fingering persistence needs an unauthorized breaking migration;
- P5.30/P5.31 timing/audio regressions;
- Source MIDI/Custom exact pitches change.

Never merge/push/tag/release or begin P5.33.
