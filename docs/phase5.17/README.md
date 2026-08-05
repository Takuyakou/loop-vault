<!-- phase-id: 5.17 -->

# Phase 5.17 — Record & Compare

Single entry point for P5.17. Read the root [`AGENTS.md`](../../AGENTS.md) first,
then this README, then the required reading order below. Git is the source of
truth; when this file and Git disagree, trust Git and record the difference in a
stage report.

> Goal: let a bassist record their own playing in Bass Practice and A/B it
> against the Target, then self-review as before. No scoring, no analysis, no
> pitch/rhythm detection. Recording is ephemeral by default; only an explicit
> **Keep Take** persists locally, separate from the Vault.

## Status

- **Status:** in-progress
- **Active stage:** P5.17-05 — Release Gates / Acceptance
- **Completed stages:** P5.17-00 … P5.17-04 (workflow/audit, capture, session integration, persistence, product hardening)
- **Next action:** Run the full automated gate set, generate the direct executable + NSIS + MSI, write the Product Acceptance report, and stop at `READY FOR HARDWARE ACCEPTANCE`. **Critical hardware item:** implement and verify the WebView2 microphone-permission handler on the target Windows machine — see [`reports/P5.17-04-product-hardening.md`](reports/P5.17-04-product-hardening.md).
- **Final determination (not yet reached):** `READY FOR HARDWARE ACCEPTANCE — Record & Compare`

Do not merge to master and do not push — a human authorizes the merge after
MOTU M4 hardware acceptance.

## Required Reading Order

1. Root [`AGENTS.md`](../../AGENTS.md) — common safety rules
2. This README
3. [`work-instructions.md`](work-instructions.md) — full P5.17 spec and per-stage work
4. [`execution-state.json`](execution-state.json) — machine-readable resume state
5. [`audit/00-repository-audit.md`](audit/00-repository-audit.md) — what exists today and where recording plugs in
6. [`contracts/01-ux-contract.md`](contracts/01-ux-contract.md) — Record Setup → Count-in → Play/Record → Listen Back → Review
7. [`contracts/02-storage-contract.md`](contracts/02-storage-contract.md) — ephemeral default, Keep Take, binary store, quota, metadata
8. [`contracts/03-privacy-contract.md`](contracts/03-privacy-contract.md) — local-only, no analysis, protected surfaces
9. [`contracts/04-state-machine-contract.md`](contracts/04-state-machine-contract.md) — recorder states, forbidden transitions, resource lifecycle
10. [`contracts/05-test-plan.md`](contracts/05-test-plan.md) — unit/component, deterministic fakes, Playwright, Tauri, resource gate
11. [`reports/README.md`](reports/README.md) then [`reports/P5.17-00-audit.md`](reports/P5.17-00-audit.md) — stage reports and baseline
12. Originating brief (bootstrap only): [`Phase-5.17-Claude-Code-Instructions.md`](Phase-5.17-Claude-Code-Instructions.md)

For the source modules to read before implementing (Bass Practice domain,
session, storage, Tauri config, Playwright), see the audit.

## Stages

Each stage is an independent commit. A stage may be marked completed only after
its required gates are recorded as `pass` with a commit hash. Do not advance to
an unassigned stage, the next phase, a merge, or a push.

### P5.17-00 — Workflow / Audit / Contract / Baseline

Apply the phase workflow, fix contracts and assumptions, record the baseline. No
production feature. **Done.**

### P5.17-01 — Capture Foundation

Capability adapter, device repository, permission state, codec negotiation,
input-channel routing, mono capture, input meter, clip warning, recorder state
machine, resource cleanup, fake implementation. UI limited to a diagnostic
harness. **Done** — see [`reports/P5.17-01-capture-foundation.md`](reports/P5.17-01-capture-foundation.md).

### P5.17-02 — Session Flow Integration

Integrate into Degree / Rhythm / Bassline Echo: count-in, Play/Record, Listen
Back, Target/My Take, Retake, Skip recording, Review continuation, mode/tab/route
lifecycle. **Done** — see [`reports/P5.17-02-session-integration.md`](reports/P5.17-02-session-integration.md).

### P5.17-03 — Persistence / History

Ephemeral default, Keep Take, binary storage, metadata, quota, History playback,
delete, corruption resilience, orphan cleanup, migration, privacy UI. **Done** —
see [`reports/P5.17-03-persistence-history.md`](reports/P5.17-03-persistence-history.md).

### P5.17-04 — Product Hardening

Production-default flag, permission-denied / no-device / disconnect /
unsupported-codec / storage-denial / quota-exceeded / route-leave / repeated
retake, accessibility, viewport, resource-leak, build identity, Tauri smoke.
**Done (app-side)** — see [`reports/P5.17-04-product-hardening.md`](reports/P5.17-04-product-hardening.md).
The WebView2 microphone-permission handler is routed to P5.17-05 hardware.

### P5.17-05 — Release Gates / Acceptance

All automated gates, direct executable, setup, Product Acceptance report. Stop at
`READY FOR HARDWARE ACCEPTANCE — Record & Compare`. Do not merge; wait for human
hardware confirmation.

## Independent feature flag

`enableBassPracticeRecordCompare` — independent of the three existing Echo mode
flags. Final production default `true`, with an explicit local `false` immediate
rollback. Production-default E2E must not inject the flag as `true`.
