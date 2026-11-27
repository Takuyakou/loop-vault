# P5.30 Start Prompt

Execute **P5.30-00 only**.

Read and obey repository `AGENTS.md`, `CLAUDE.md` if present, then `docs/phase5.30/README.md`, execution state, work instructions, and the Stage00-related contracts/references.

Hard rules:

- Confirm the worktree is clean before touching files.
- Confirm current HEAD contains P5.29 verified implementation commit `55f8c59ee1a3ed5be24ed4b1b61f997f7275fda5` in ancestry. Do not make it so automatically; if false, stop and report.
- Audit before coding. Stage00 must not implement product behavior.
- Do not reset, stash, discard, or overwrite user changes.
- Never use `git add -A` or `git add .`; stage explicit paths only.
- Never revive `docs/CURRENT_STATE.md`.
- Do not commit private MIDI/audio, `.local-evaluation`, generated installers/binaries, or personal absolute paths.
- Do not merge or push.
- At the end, update the Stage00 report and execution state, commit the allowed docs, verify `git status --short` is empty, report commit hash, then STOP.
