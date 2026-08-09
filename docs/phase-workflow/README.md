# Phase workflow

How every phase in Loop Vault is documented, resumed, and validated. Bootstrap
this once; afterwards a phase resumes from three small canonical inputs instead
of a long instruction dump.

## Canonical three-layer structure

1. **Root [`AGENTS.md`](../../AGENTS.md)** — common, phase-independent safety
   rules. The single source of truth for safety.
2. **`docs/phaseX.Y[.Z]/README.md`** — the single entry point for one phase. An
   agent reads this first (after `AGENTS.md`) and follows its required reading
   order.
3. **The rest of `docs/phaseX.Y[.Z]/`** — the phase's details:

   ```text
   docs/phaseX.Y[.Z]/
   ├─ README.md              single entry point (status, reading order, stages)
   ├─ work-instructions.md   full spec
   ├─ execution-state.json   machine-readable resume state
   ├─ audit/                 pre-implementation audits
   ├─ contracts/             UX / storage / privacy / state-machine contracts
   ├─ reports/               stage and final reports
   └─ evidence/              committable, non-personal, non-generated evidence only
   ```

`docs/CURRENT_STATE.md` is retired and must not be revived.

## Starting a new phase

1. Copy [`phase-template/`](phase-template/) to `docs/phaseX.Y[.Z]/`.
2. Replace the phase id (`0.0` / `P0.0`) throughout with the real one. Two- and three-part phase ids (for example `5.17` and `5.18.1`) are supported.
3. Fill in `work-instructions.md`, the README stage list, and
   `execution-state.json`.
4. Run `npm run validate:phase-docs` until it passes.

## Resuming a phase

See the paste-in prompt: [`CODEX-START-PROMPT.md`](CODEX-START-PROMPT.md).
In short: read `AGENTS.md`, read `docs/phaseX.Y[.Z]/README.md`, follow its required
reading order, reconcile `execution-state.json` against Git (Git wins), and
resume from the first incomplete stage or gate. Do not advance to an unassigned
stage, the next phase, a merge, or a push.

## execution-state.json

Validated against [`execution-state.schema.json`](execution-state.schema.json).
Minimum fields (see the schema for the full contract): `schemaVersion`,
`phaseId`, `status`, `activeStage`, `completedStages`, `blocked`,
`blockerReason`, `baseCommit`, `lastVerifiedCommit`, `currentBranch`,
`requiredGates`, `gateResults`, `nextAction`, `updatedAt`.

`updatedAt` is advisory and never outranks Git. A stage may enter
`completedStages` only once its `requiredGates` are recorded as `pass` in
`gateResults` and a commit hash exists.

## Validator

`npm run validate:phase-docs` runs `scripts/phase-docs/validate.mjs`, which
discovers every phase package (any directory under `docs/` containing an
`execution-state.json` — including the template) and checks:

| Check | Meaning |
| --- | --- |
| `missing-file` | required file absent (README, work-instructions, execution-state, reports/README) |
| `phase-id-mismatch` | README marker, `execution-state.json`, and `phaseX.Y` or `phaseX.Y.Z` dir name disagree, or the README marker is missing |
| `broken-link` | a relative link in the README points at a missing file (covers the required reading order targets) |
| `required-reading-order` | the Required Reading Order section has no links |
| `missing-heading` | a required README or work-instructions heading is absent |
| `schema` | `execution-state.json` is not valid JSON or violates the schema |
| `active-completed-conflict` | `activeStage` also appears in `completedStages` |
| `duplicate-stage` | a stage id is duplicated (README stage headings or `completedStages`) |
| `completed-gate-not-passed` | a completed stage has a required gate that is not recorded as `pass` |
| `blocked-reason-mismatch` | `blocked`, `blockerReason`, and `status` disagree |
| `personal-path` | a Windows personal absolute path (`C:\Users\<name>\...`) appears in the docs |
| `local-evaluation-artifact` | a file lives under, or a link points into, `.local-evaluation` |
| `raw-audio-commit` | an audio/MIDI binary lives in the docs, or a line instructs committing raw audio/MIDI/recordings |
| `current-state-reference` | the retired `docs/CURRENT_STATE.md` exists or is linked |
| `unauthorized-merge-push` | a phase doc instructs an automatic merge/push to `master`/`main` (prohibition lines are allowed) |

The scan for `unauthorized-merge-push` and `raw-audio-commit` runs only inside
phase packages, and a line that carries a prohibition marker (e.g. "しない",
"never", "do not") is treated as a rule statement, not a directive.

## Validator tests

`scripts/phase-docs/validate.test.mjs` (run by `npm test`) exercises the
validator with a known-good fixture and one deliberately-broken fixture per
check, asserting that each violation is caught and that the good fixture is
clean. Fixtures live in `scripts/phase-docs/__fixtures__/`.

## Merge policy

A phase's release stage stops for human review. Merging the phase branch to a
clean `master` with `--no-ff` is a human-authorized step, and pushing is a
separate human-initiated step. Neither is ever automatic. See `AGENTS.md`.
