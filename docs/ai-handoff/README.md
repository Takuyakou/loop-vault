# Loop Vault — AI Handoff Index

When to read:
Start here when orienting in the repository.

Do not preload:
This is an index. Jump to the one document your current task needs.

## First read

- [`HANDOFF.md`](HANDOFF.md) — current situation, product mission, protected contracts.

## Architecture work

- [`ARCHITECTURE-MAP.md`](ARCHITECTURE-MAP.md) — where each system lives, what it does, its tests.
- [`DECISIONS.md`](DECISIONS.md) — recorded architecture decisions and their status.

## Analyzer / MIDI Import

- [`KNOWN-FAILURES.md`](KNOWN-FAILURES.md) — current known failures (anonymous IDs) and the next isolation experiments.
- `docs/current-midi-detection-spec.md` — historical detection spec. Verify against current code before trusting it; the default analyzer has since changed.

## Voicing / practice

- [`ARCHITECTURE-MAP.md`](ARCHITECTURE-MAP.md) — Voicing Rules engine, Source Bassline, Text Progression Entry, Progression Voicing Practice.
- [`GLOSSARY.md`](GLOSSARY.md) — the voicing / practice vocabulary.

## Tests

- [`TEST-STRATEGY.md`](TEST-STRATEGY.md) — test layers and how private MIDI is kept out of commits.

## Music / domain terminology

- [`GLOSSARY.md`](GLOSSARY.md) — Loop Vault-specific terms and their Confirmed / Proposed status.

## Cold-start validation

- [`COLD-START-CHECK.md`](COLD-START-CHECK.md) — how a fresh agent is validated. Stage 0 does not run this itself.

## Canonical safety rules

- Root `AGENTS.md` — single source of truth for Git safety, privacy, and read order.

Historical implementation detail lives under the docs/phase packages. Read only the phase package relevant to your task; never preload all phase docs.
