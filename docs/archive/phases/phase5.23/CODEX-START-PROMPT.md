# P5.23 Start Prompt

Phase 5.23 — Timeline Candidate Legibility を開始してください。

最初に root AGENTS.md → CLAUDE.md → docs/phase5.23/README.md → execution-state.json → work-instructions.md → proposal/contracts を全文確認し、Git realityを照合してください。

今回は `P5.23-00 — Audit / Baseline / Grouping Contract Lock` のみ実行してください。

禁止:
- production UI実装
- P5.23-01以降
- candidate generation変更
- candidate scoring変更
- boundary変更
- candidate count変更
- candidate diversification
- coverage-aware reranking
- section detector
- 90% coverage gate
- IoUだけでthreshold決定
- unrestricted transitive grouping
- private MIDI commit
- reset/stash/discard
- git add -A / git add .
- merge/push
- P5.23.1/P5.24

Stage00で固定:
- current candidate topology
- nested/shifted/chain cases
- pairwise overlap metrics
- grouping simulation
- threshold
- anchor rule
- representative rule
- selected variant rule
- initial selection
- snap
- harmonic activity derivation/normalization
- visual baseline inventory

PASS後にaudit/report/state/commit/clean statusを更新して停止してください。
