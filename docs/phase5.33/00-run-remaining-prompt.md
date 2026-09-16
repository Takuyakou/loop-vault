# P5.33 Run Remaining Prompt

Continue Phase 5.33 from the exact tracked execution state.

If every hard gate remains green, run the next authorized stage. If this prompt
is explicitly used to run all remaining stages, continue sequentially through
P5.33-05, stopping immediately at any blocker.

Before every stage:

- read current execution state and prior report;
- verify Git;
- preserve unrelated user work;
- run the focused gates for that stage;
- update docs/state;
- explicit-path stage only;
- inspect staged diff;
- commit;
- confirm clean tracked status.

Never:

- blindly import all 33 research records into production;
- mutate Source MIDI/Custom exact notes;
- silently enrich Literal chords;
- label app-invented notes as teacher-provided Melody;
- merge/push/tag/release;
- begin P5.34.
