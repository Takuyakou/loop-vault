# Stage 0 — AI Handoff Infrastructure: Report

When to read:
Read when reviewing what Stage 0 built, or when deciding whether to accept it.

Do not preload:
This is the Stage 0 closeout record, not a working handoff document.

## Final status

PASS — HANDOFF INFRASTRUCTURE READY FOR COLD-START VALIDATION

## Git reality

- PRE_STAGE0_HEAD: `0e27c10e590c57b4dc40e0c375f3c87a15489ba7`
- Original branch: `feat/p5182-vault-source-discoverability`
- Stage 0 branch: `feat/stage0-ai-handoff` (created from PRE_STAGE0_HEAD)
- Working tree at start: 0 tracked modifications; 161 untracked entries (no tracked diff).

## Initial dirty / untracked baseline

- No tracked files were modified before Stage 0.
- 161 pre-existing untracked entries exist, all unrelated to Stage 0:
  - worktree-like directories from other agents (e.g. `life-launcher-*`, `p526*`, `p140*`, `task-p533-transport`);
  - `.codex-*` staging directories;
  - many `p140-*.patch` / `p526-*.patch` files;
  - untracked `docs/phase5.19` … `docs/phase5.27` phase packages.
- None of these were staged, modified, or deleted by Stage 0.

## Changed files (Stage 0)

- `AGENTS.md` — added source-of-truth hierarchy, required read order, AI handoff pointer (94 lines; unchanged safety rules preserved).
- `CLAUDE.md` — added an AI handoff pointer (non-destructive).
- `package.json` — added `validate:ai-handoff` script.
- `docs/ai-handoff/` — new: README, HANDOFF, ARCHITECTURE-MAP, DECISIONS, KNOWN-FAILURES, TEST-STRATEGY, GLOSSARY, COLD-START-CHECK.
- `scripts/ai-handoff/` — new: `lib.mjs`, `validate.mjs`, `validate.test.mjs`.
- This report.

## Instruction audit

Read the existing instruction layer first:

1. root `AGENTS.md` — present; canonical safety rules.
2. root `CLAUDE.md` — present; pointer to AGENTS + phase workflow.
3. product functional spec — `docs/loop-vault-spec.md`, `docs/spec.md`.
4. active phase README — `docs/phase5.18.2/README.md` (completed, master merge authorized).
5. execution-state — `docs/phase5.18.2/execution-state.json` (all gates pass).
6. accepted reports/contracts — phase 5.18.2 package.
7. phase docs validator — `scripts/phase-docs/`.
8. security/path/privacy scanner — same validator + `scripts/check-staged-files.mjs`.
9. private MIDI protection — `.gitignore` + `scripts/check-staged-files.mjs`.
10. test infrastructure — Vitest (`vite.config.ts`), Playwright (`playwright.config.ts`), Rust `#[cfg(test)]`.

## AGENTS changes

- Kept all existing Git-safety, merge/push, privacy, worktree, and stop-condition rules unchanged.
- Added the conceptual source-of-truth order and the required read order.
- Added the `docs/ai-handoff/` orientation pointer.
- Size: 94 lines (<= 150 target). No safety/quality contract was removed.

## CLAUDE audit

Classification of `CLAUDE.md`:

- A (duplicates AGENTS): none meaningful.
- B (Claude-specific): "Resuming a phase" and "Repo commands".
- C (repository-wide, move candidate): none that outrank AGENTS.
- D (stale): none found.

Action: added an AI handoff pointer; no content was deleted or collapsed.

## Created handoff structure

All 8 required files present and passing the handoff validator.

## Architecture facts discovered (CONFIRMED)

- Default analyzer is `phase4-v1` (`src/domain/midi/analysis.ts`), rolled back from `phase4.1-v1`.
- Analyzer modes present: `legacy`, `hybrid-v1`, `legacy-boundary-rerank`, `voice-aware-rerank-v1`, `phase4-v1`, `phase4.1-v1`, `phase4.1.2-v1`, `phase4.1.2-core-v1`, `phase4.1.2-g2-v1`, `phase4.1.2-core-g2-v1`.
- Voice Roles: `Voice` / `VoiceRole` / `VoiceRoleInference` in `src/domain/midi/types.ts`; inference in `src/domain/midi/voices.ts`.
- Voicing Memory: `ChordVoicingMemory` (sourceVoicing + practiceVoicingOverride) in `src/domain/types.ts`; source-voicing extraction in `src/domain/voicing/`.
- P5.26.1 source-voicing claims audited against code: `src/domain/voicing/sourceVoicing.ts` keeps source pitches exact; preview and save share one path. (See CONFLICTS for the related historical doc.)
- Vault schema is `fileVersion: 1`; unchanged.
- Bass Practice (incl. Record & Compare) lives in `src/features/bass-practice/` + `src-tauri/src/practice_storage.rs`.
- Live MIDI is a separate detector (`src/domain/liveMidi/`, `src/liveMidi/`, `src-tauri/src/live_midi/`).

## PROPOSED directions

- Source Truth → Harmony Interpretation → Practice Rendering (long-term separation; only a seed exists today).
- Voicing "rule engine v2" (P5.33) — research only, not in committed runtime.
- Harmonic Core as a named subsystem — not present in committed code (on an unmerged branch).

## USER-REPORTED facts

- LF-MIDI-001: clean structured chord MIDI may be degraded by analyzer interpretation. Observations are user-reported (1/4 meter, ~65 quarter-note beats, ~65 cells, empty cells, onset jitter, label mismatch). Cause undetermined.

## CONFLICTS

- CONFLICT-001 — Historical spec vs current code: `docs/current-midi-detection-spec.md` describes `legacy-v1` as the default analyzer; current code (`src/domain/midi/analysis.ts`) defaults to `phase4-v1`. Current Git/code wins; the spec is historical on this point.
- CONFLICT-002 — Phase-docs validator is red on the working tree: 142 issues, all in pre-existing untracked `docs/phase5.19` … `docs/phase5.27` packages (non-conforming `execution-state.json` shape). These are not tracked on this branch and were not touched by Stage 0. Tracked phase packages (5.17, 5.18, 5.18.1, 5.18.2, template) are clean. Recommended follow-up: reconcile or remove those untracked packages outside Stage 0.

## Historical-only claims

- `docs/current-midi-detection-spec.md` default-analyzer statement (see CONFLICT-001).
- Phase reports under `docs/phase*/` describe past stages; only code/tests are current truth.

## Validator implementation

- `scripts/ai-handoff/lib.mjs` + `scripts/ai-handoff/validate.mjs` + `scripts/ai-handoff/validate.test.mjs`.
- Uses Node built-ins + Vitest only (no new runtime stack). Reuses the privacy regex vocabulary of `scripts/phase-docs/lib.mjs`.
- Checks: 8 required files; `CURRENT_STATE.md` absent; HANDOFF verified SHA present; line limits (HANDOFF 250, ARCHITECTURE-MAP 350); HARD path existence (`src/`, `scripts/`, `docs/ai-handoff/`); SOFT historical docs/phase paths warn; personal absolute paths; raw audio/MIDI commit directives; tracked `.local-evaluation` / private MIDI outside `test/fixtures/`.
- Verified-SHA semantics per spec: missing → FAIL; existing + ancestor → PASS; existing + non-ancestor → WARN.

## Validator tests

18 tests pass (`npx vitest run scripts/ai-handoff/validate.test.mjs`), covering every check in the spec's required test list (missing file, forbidden CURRENT_STATE, invalid HARD path, broken historical path → warn, invalid SHA → fail, non-ancestor SHA → warn, valid structure → pass, personal path, private media, allowed synthetic fixture).

## Privacy / path / security scan

- Handoff validator: PASS (no personal paths, no raw audio/MIDI commit directives, no tracked `.local-evaluation`, no private MIDI).
- `git diff --check`: PASS.
- Pre-commit hook (`scripts/check-staged-files.mjs`) will re-verify staged files at commit time.

## Full product suite (informational, not a Stage 0 gate)

Stage 0 changes no product code, so the full product suite is not a required gate (§53). Running `npm test` on this working tree is not meaningful: `vite.config.ts` excludes only `e2e/**`, `node_modules/**`, `dist/**`, so Vitest sweeps up test files inside the pre-existing untracked directories (`.codex-staging/*`, `task-p533-transport/*`, `life-launcher-*/*`, and their nested `node_modules`). This produces 13 failures, all inside those untracked directories (plus the `scripts/phase-docs/validate.test.mjs` "committed docs are clean" assertion, which fails for the same reason as CONFLICT-002). None of these failures involve Stage 0 files; the Stage 0 validator test passes in isolation (18/18). A clean checkout (tracked files only) is unaffected.

## Cold-start prompt readiness

- `docs/ai-handoff/COLD-START-CHECK.md` contains the exact prompt and pass/fail criteria.

## Cold-start test NOT RUN in this session

- Stage 0 does not self-run the cold-start, and does not grade its own result. It remains external / human acceptance.

## Unresolved questions

- No `execution-state.json` was created for Stage 0: it is a standalone infrastructure stage, not a numbered `phaseX.Y` package (creating one would make `docs/ai-handoff/` subject to the phase-package validator). The freshness header + Git serve as the machine-readable state. Confirm this interpretation is acceptable.

## Recommended next stage

MIDI Import Failure Isolation — compare, for LF-MIDI-001: A. original 1/4; B. meter-only 4/4; C. meter-independent harmonic segmentation; D. C + onset-clustering tolerance. Not run in Stage 0.

## Final Git status

See the commit created by Stage 0 for the exact tree. Only Stage 0 paths are staged; pre-existing untracked files and directories remain untouched.

STOP — awaiting external cold-start validation.
