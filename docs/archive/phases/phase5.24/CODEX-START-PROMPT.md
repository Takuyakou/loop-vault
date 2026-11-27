# P5.24 Start Prompt

Phase 5.24 — Harmonic Rhythm & Performance Fragment Consolidation を開始してください。

最初に:
AGENTS.md → CLAUDE.md → docs/phase5.24/README.md → execution-state.json → work-instructions.md → proposal/contracts
を全文確認し、Git realityを照合してください。

今回は `P5.24-00 — Audit / Failure Corpus / Metric Contract / Baseline` のみ実行。

禁止:
- production behavior変更
- Stage01開始
- subset-only merge
- bass PC changeのみをstrong change化
- C→Cmaj7の無条件same/change
- Local harmonic rhythm
- 4/4以外への無断scope拡張
- detected chord identityをHR主入力にする
- historical metric流用
- boundary toleranceの無断新設
- raw MIDI変更
- scoring/vocabulary/candidate-ranking formula変更
- Vault schema/fileVersion変更
- private MIDI commit
- reset/stash/discard
- git add -A / git add .
- merge/push
- P5.25

Stage00でA-K synthetic ground truthを固定。
特に:
C C→Am7 true change
D persistent structural C→Cmaj7
K mixed harmonic rhythm safe fallback

Fragmentation Ratio、Change Precision/Recall、False Merge、Over-segmentation、
boundary tolerance、promotion gateを結果を見る前に固定。

PASS後にaudit/report/state/commit/clean statusを更新して停止。
