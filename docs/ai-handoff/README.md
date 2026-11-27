# Loop Vault — AI Handoff Index

When to read:
Start here when picking the repository up, then read HANDOFF.md.

Do not preload:
This is an index. Jump to the one document your current task needs.

## First read

- [`HANDOFF.md`](HANDOFF.md) — current situation (v3.2.0), the mission, the
  protected contracts and known limits.
- [`docs/README.md`](../README.md) — the entry point for all documentation.
- [`features.md`](../current/features.md), [`architecture.md`](../current/architecture.md),
  [`data-contracts.md`](../current/data-contracts.md),
  [`development.md`](../current/development.md),
  [`voicing-rules.md`](../current/voicing-rules.md) — the live current pages.

## Architecture work

- [`HANDOFF.md`](HANDOFF.md) — the short architecture summary and folder roles.
- [`ARCHITECTURE-MAP.md`](ARCHITECTURE-MAP.md) — where each system lives, what it does, its tests.
- [`DECISIONS.md`](DECISIONS.md) — recorded architecture decisions and their status.

## Analyzer / MIDI Import

- [`KNOWN-FAILURES.md`](KNOWN-FAILURES.md) — current known failures (anonymous IDs) and the next isolation experiments.
- The historical detection spec is in `docs/archive/legacy-root/current-midi-detection-spec.md`.
  Verify it against the current code before trusting it; the default analyzer has since changed.

## Voicing / practice

- [`HANDOFF.md`](HANDOFF.md) — the Voicing Loop, text intake and play-along summary.
- [`GLOSSARY.md`](GLOSSARY.md) — the voicing / practice vocabulary.
- [`voicing-rules.md`](../current/voicing-rules.md) — the generated voicing rules.

## Tests

- [`TEST-STRATEGY.md`](TEST-STRATEGY.md) — test layers and how private MIDI is kept out of commits.
- [`development.md`](../current/development.md) — the commands and the gates.

## Music / domain terminology

- [`GLOSSARY.md`](GLOSSARY.md) — Loop Vault-specific terms and their Confirmed / Proposed status.

## Cold-start validation

- [`COLD-START-CHECK.md`](COLD-START-CHECK.md) — how a fresh agent is validated. Stage 0 does not run this itself.

## Canonical safety rules

- Root `AGENTS.md` — single source of truth for Git safety, privacy, read order,
  and the repository/docs rules.

Historical implementation detail lives under `docs/archive/` (phase packages,
reports, artifacts). Read only the package relevant to your task; never preload
all of it. Accepted design documents for each version live in `docs/designs/`.
