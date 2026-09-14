# P5.31 Start Prompt

Implement **only P5.31-00**.

Read in this order:

1. repository root `AGENTS.md`
2. repository/root Claude instructions if present
3. `docs/phase5.31/README.md`
4. `docs/phase5.31/execution-state.json` (live state; prefixed intake file is historical)
5. `docs/phase5.31/P5.31-work-instructions.md`
6. all `docs/phase5.31/contracts/*.md`
7. `docs/phase5.31/references/RECHORD-NOTATION-RESEARCH.md`
8. the current integrated P5.30 phase docs/reports from Git

## P5.31-00 only

Audit and lock:

- exact Git base and P5.30 ancestry/state;
- current Text Progression parser/tokenizer and its real capacity/bounds;
- current chord parser/canonicalizer and supported aliases;
- current `CaptureDraft` timing/gap representability;
- Vault save/reload handling of gaps and cross-bar durations;
- current Voicing Loop snapshot/clock handling of:
  - repeated same chord with a new attack,
  - gap/rest,
  - chord duration extended across a bar line;
- current Lesson Rule Table and Left-hand generator;
- exact reason `Am11/B` and `Am9/C` are unsupported;
- whether lesson evidence actually authorizes a slash-bass policy.

Create/complete the Stage00 audit report and executable fixtures/tests needed to
prove the baseline. Do not implement Stage01 production behavior yet.

## Hard gate

Before Stage01 can be authorized, Stage00 must determine that the requested
ReChord compatibility can be represented without corrupting existing timing or
inventing musical rules.

If `_` rest or `=` hold cannot survive Text → Draft → Vault → reload → Voicing
Loop without a schema migration, STOP and report the exact blocker.

If Left-hand slash-chord behavior is not justified by the existing lesson
materials/rule table, STOP that track as `NEEDS HUMAN RULE APPROVAL`; do not
silently strip the slash bass or fall back to another voicing family.

## Git safety

- preserve all unrelated user changes;
- no reset/stash/discard;
- no `git add -A`;
- no `git add .`;
- explicit-path staging only;
- do not recreate `docs/CURRENT_STATE.md`;
- no merge/push/tag/release;
- test/build output must not remain tracked.

After Stage00 report/state/commit/clean-status, stop.
