# P5.25 Start Prompt

Phase 5.25 — Source Bassline Practice Window Expansion を開始してください。

最初に AGENTS.md → CLAUDE.md → docs/phase5.25/README.md → execution-state.json → work-instructions.md → contracts を全文確認し、Git realityを照合してください。

今回は `P5.25-00 — Audit / Baseline / Contract Lock` のみ実行。

禁止:
- production変更
- Stage01開始
- 単純なmaxBars=8変更
- snapshot schema変更
- Vault schema/fileVersion変更
- Record max duration変更
- Level1/2 simplification変更
- Transfer semantics変更
- private MIDI commit
- reset/stash/discard
- git add -A / git add .
- merge/push/P5.26

Stage00で固定:
- 2-bar limit origin
- allowed 1/2/4/8
- default 2
- persisted setting compatibility
- crop semantics
- crop-before-projection
- short-source fallback
- Record duration behavior
- History compatibility
- UI selector
- regression tests

snapshot保存自体が2小節に制限されているならSTOPして報告。
PASS後にaudit/report/state/commit/clean statusを更新して停止。
