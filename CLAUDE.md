# CLAUDE.md — Claude Code entry point

This file orients Claude Code (and the Claude Agent SDK) in this repository. It
is a pointer, not a second rulebook: the canonical safety rules live in
[`AGENTS.md`](AGENTS.md), and the single entry point for the repository's
documentation is [`docs/README.md`](docs/README.md).

## Roles at a glance

- **`AGENTS.md`** — the single, tool-agnostic source of truth for safety rules
  (git hygiene, merge/push policy, privacy, worktrees, repository/docs rules,
  stop conditions). Applies to every agent. Read it first.
- **`docs/README.md`** — the documentation index; `docs/current/` holds the live
  five pages, `docs/designs/` the accepted design documents, `docs/contracts/`
  the frozen data tests and the app read, and `docs/archive/` the past records.
- **`CLAUDE.md`** (this file) — Claude Code specifics: how to start work and a
  few repo commands. It never overrides `AGENTS.md`.

## Starting work

1. Read `AGENTS.md`.
2. Read [`docs/README.md`](docs/README.md), then only the `docs/current/` pages
   your task touches.
3. Read the accepted design document for the version you are touching
   (`docs/designs/`) and only the task-relevant files under `docs/contracts/`.
4. Audit branch, worktree, HEAD, PR, and `git status --short`.
5. Inspect the actual code and tests before editing.
6. Do not advance to unassigned work, the next version, or a push. Merge into
   local master only after the lead's review passes (AGENTS.md, "Merge / push").

The documentation is written in Japanese except where a page says otherwise.

## Repo commands

- `npm run validate:docs-layout` — check the docs/root layout, every `docs/...`
  path in the code, the relative imports under `scripts/`, and the personal /
  publish-word rules. Add `--release` for the full release check.
- `npm run validate:phase-docs` — validate the historical phase packages.
- `npm run validate:ai-handoff` — validate `docs/ai-handoff/`.
- `npm test` — Vitest.
- `npm run lint` — ESLint + Tailwind class lint.
- `npm run build` — TypeScript typecheck + Vite production build.

The test levels and the full gate list are in
[`docs/current/development.md`](docs/current/development.md).

## Project shape (orientation only)

Loop Vault is a Tauri v2 + React + TypeScript + Vite desktop app. Rust lives in
`src-tauri/`, the web app in `src/`, the test runner and validators in
`scripts/`, and the documentation in `docs/`. Evaluation and audit tooling that
no command uses any more lives in `scripts/archive/`.

For a cross-version orientation, start at [`docs/README.md`](docs/README.md),
then [`docs/ai-handoff/README.md`](docs/ai-handoff/README.md) and
[`docs/ai-handoff/HANDOFF.md`](docs/ai-handoff/HANDOFF.md).

## Historical phase contract (archive)

The phase-workflow template and the per-phase packages are historical now; they
live under `docs/archive/phase-workflow/` and `docs/archive/phases/`. The Phase
8.9 autonomous stage rules are historical too; that contract is at
[`docs/archive/phases/phase8.9/contracts/P8.9-autonomous-run.md`](docs/archive/phases/phase8.9/contracts/P8.9-autonomous-run.md),
and `AGENTS.md` still wins on any conflict.

- `.local-evaluation/`: only `test-logs/` and `gate-cache/` may be read — with
  the Read tool or with shell commands such as `cat`, `grep`, `find`. Never
  open anything else under it.
- Generated screenshots go to `p89-generated/` (ignored, never committed).
- Stage and release reports are written in Japanese; the release records live in
  `docs/release/v3.x.0/`.
