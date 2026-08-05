<!-- phase-id: 0.0 -->

# Phase 0.0 — Template (copy me)

> This is the phase-template single entry point. Copy the whole
> `phase-template/` directory to `docs/phaseX.Y/`, then find-and-replace the
> phase id (`0.0` / `P0.0`) with the real one. Every file below is required by
> `npm run validate:phase-docs`.

Read the root `AGENTS.md` first, then this README, then follow the required
reading order below. Git is always the source of truth; if this file and Git
disagree, trust Git and record the difference in a stage report.

## Status

- **Status:** planned
- **Active stage:** P0.0-00
- **Completed stages:** none
- **Next action:** copy this template into `docs/phaseX.Y/` and run the repository audit

Keep this section, [`execution-state.json`](execution-state.json), and the
active stage report in sync at the end of every stage.

## Required Reading Order

1. Root `AGENTS.md` — common safety rules (not linked here; it lives at repo root)
2. [`work-instructions.md`](work-instructions.md) — full spec for this phase
3. [`execution-state.json`](execution-state.json) — machine-readable resume state
4. [`reports/README.md`](reports/README.md) — where stage and final reports go

Add phase-specific reading (contracts, prior acceptance reports, source
modules) to this list as you create it. Only link files that actually exist —
the validator checks every relative link.

## Stages

Replace these with the real stages. Each stage is an independent commit and
must record its gates and commit hash before it can be marked completed.

### P0.0-00 — Audit & contracts

Fix assumptions and contracts before writing product code.

### P0.0-01 — Implementation

Build the feature behind its flag.

### P0.0-02 — Release gates

Run the full gate set. Do not merge or push automatically.

## Rules recap

- Do not merge or push to master automatically — a human authorizes that.
- Do not commit recordings, MIDI, `.local-evaluation`, or personal paths.
- Do not revive `docs/CURRENT_STATE.md`.

See the root `AGENTS.md` for the full, canonical rule set.
