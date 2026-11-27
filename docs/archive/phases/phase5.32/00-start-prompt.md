# P5.32 Start Prompt

Implement **P5.32-00 only**.

Read:

1. root `AGENTS.md`
2. root Claude instructions if present
3. `docs/phase5.32/README.md`
4. `docs/phase5.32/P5.32-execution-state.json`
5. `docs/phase5.32/P5.32-work-instructions.md`
6. all `docs/phase5.32/contracts/*.md`
7. `docs/phase5.32/references/FINGERING-GUIDE-EXTRACT.md`
8. `docs/phase5.32/references/piano-chord-fingering-guide.html`
9. current integrated P5.31/P5.30/P5.29/P5.27 reports from Git

## Stage00 only

Audit and lock:

- exact Git base and completed P5.31 reality;
- current resolved-voicing API for all five Voicing Loop sources;
- exact Current/Next/keyboard component boundaries;
- current mode semantics and which modes permit right/left hand selection;
- current Lesson Rule Table and Left-hand-only semantics;
- P5.31 slash-bass policy if integrated;
- P5.31 `%`, `_`, `=` timeline semantics if integrated;
- existing Practice persistence extension points;
- whether a user fingering preference can be stored as an optional/defaulted
  Practice field without changing Vault schema/fileVersion;
- current accessibility/320px/200%/reduced-motion tests;
- current P5.30 slim-card/playhead/reference-audio regression suites.

Create the Stage00 report and executable baseline fixtures/tests.

Do not implement production fingering UI or ranking yet.

## Persistence hard gate

Preferred:

- optional/defaulted Practice data collection;
- no Vault mutation;
- no raw MIDI/source path;
- exact-voicing signature + hand + finger array only.

If the established persistence contract cannot safely support this without a
breaking Practice migration/fileVersion change, STOP the persistence sub-track
and report it. Do not lie with a Save button that is session-only.

The automatic display/ranking track may proceed independently if safe.

## Git safety

- preserve unrelated changes;
- no reset/stash/discard;
- no `git add -A`;
- no `git add .`;
- explicit paths only;
- do not restore `docs/CURRENT_STATE.md`;
- no merge/push/tag/release.

After Stage00 report/state/commit/clean status: STOP.
