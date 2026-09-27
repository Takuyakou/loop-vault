# CLAUDE.md — Claude Code entry point

This file orients Claude Code (and the Claude Agent SDK) in this repository. It
is a pointer, not a second rulebook: the canonical safety rules live in
[`AGENTS.md`](AGENTS.md) and the phase process lives in
[`docs/phase-workflow/README.md`](docs/phase-workflow/README.md).

## Roles at a glance

- **`AGENTS.md`** — the single, tool-agnostic source of truth for safety rules
  (git hygiene, merge/push policy, privacy, worktrees, stop conditions). Applies
  to every agent, every phase. Read it first.
- **`CLAUDE.md`** (this file) — Claude Code specifics: how to resume a phase and
  a few repo commands. It never overrides `AGENTS.md`.

## Resuming a phase

1. Read `AGENTS.md`.
2. Read the target phase's single entry point, `docs/phaseX.Y/README.md`.
3. Follow that README's required reading order.
4. Audit branch, worktree, HEAD, PR, and `git status --short`.
5. Reconcile `execution-state.json` against Git; when they disagree, trust Git
   and record the difference in a report.
6. Resume from the first incomplete stage or gate.
7. Do not advance to an unassigned stage, the next phase, a merge, or a push.

The short prompt to paste at the start of a session lives in
[`docs/phase-workflow/CODEX-START-PROMPT.md`](docs/phase-workflow/CODEX-START-PROMPT.md).

## Repo commands

- `npm run validate:phase-docs` — validate the phase-workflow template and every
  phase package under `docs/`.
- `npm test` — Vitest (includes the phase-docs validator tests).
- `npm run lint` — ESLint + Tailwind class lint.
- `npm run build` — TypeScript typecheck + Vite production build.

## Project shape (orientation only)

Loop Vault is a Tauri v2 + React + TypeScript + Vite desktop app. Rust lives in
`src-tauri/`, the web app in `src/`, evaluation and tooling scripts in
`scripts/`, and phase documentation in `docs/`.

For a cross-phase orientation, start at `docs/ai-handoff/README.md` (then
`docs/ai-handoff/HANDOFF.md`); the phase process itself lives in
`docs/phase-workflow/README.md`.

## Phase 8.9 autonomous stage runs

Phase 8.9 stages are delivered as one zip per stage and run end to end without
asking the human for approval. The rules live in
[`docs/phase8.9/contracts/P8.9-autonomous-run.md`](docs/phase8.9/contracts/P8.9-autonomous-run.md);
`AGENTS.md` still wins on any conflict.

- Permissions: `.claude/settings.json` (shared, committed) and
  `.claude/settings.local.json` (machine-local denies, never committed).
- `.local-evaluation/`: only `test-logs/` and `gate-cache/` may be read — with
  the Read tool or with shell commands such as `cat`, `grep`, `find`. Never
  open anything else under it.
- Tests: follow `docs/test-dx/README.md` — `npm run test:fast|feature|ui` while
  working, one fresh `npm run test:full` for the merge candidate.
- Generated screenshots go to `p89-generated/` (ignored, never committed).
- Stage reports are written in Japanese under `docs/phase8.9/reports/`.
- Stop at the merge candidate. Never push, tag, or release.
