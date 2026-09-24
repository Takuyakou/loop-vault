# Loop Vault Phase 7 — Evaluation Contract

## A. Tier 1 — Voicing Fidelity

### Gold unit
`target note instances / note-number set per voicing segment` を正とする。
必要に応じてbass role等を別metadataとして持つ。

### Primary metrics
- exact note-number set match per voicing segment
- duration-weighted exact segment ratio
- note precision / recall / F1 with MIDI note numbers
- octave/register error count
- missing note count
- extra note count
- playback-endpoint exactness

### Boundary-aware metrics
- voicing-boundary precision / recall / F1
- over-segmentation
- under-segmentation
- duration-weighted boundary error
- correction actions for split/merge

### Rules
- octave/register matters
- source voicingに音を勝手に追加しない
- same voicing arpeggioはGold definitionに従い集約可能
- different stable voicing statesを1つへunionしない

---

## B. Tier 2 — Harmonic Interpretation

### Metrics
- pitch-class + bass playback-equivalent match
- candidate recall@K
- root / bass / quality / factor accuracy where defined
- Top-1 / Top-3 / N-best
- canonicalExact (diagnostic)
- representability
- renderer-only mismatch

### Equivalence
同一発音内容を持つ複数ラベルをplayback-equivalent正解集合として許可できる。
ただしsemantic identityの違いはdiagnosticへ保持。

---

## C. Role metrics

- melody role precision/recall
- harmony role precision/recall
- melody leak into harmony
- harmony false-removal
- melody-as-tension count/rate
- bass role accuracy
- uncertain role rate

Gold roleをnormal inferenceへ渡さない。

---

## D. Passing chord / ornament metrics

category別:
- single-voice passing note false split
- ornament false split
- passing chord miss
- passing chord merge-away
- 1-beat chord preservation
- half-beat chord preservation
- voicing-only boundary preservation

Duration threshold単独ルールは禁止。

---

## E. Correction Cost

Report as vector; single scalarだけに潰さない。

- note_add
- note_remove
- octave_fix
- split_add
- split_remove
- role_fix
- harmonic_identity_fix
- naming_only_fix

User-facing primary correction costでは naming_only を分離表示する。

---

## F. Pipeline checkpoint tests

Gold -> extraction -> stored representation -> reload -> playback plan

各edgeでhash/normalized representationを比較可能にする。

失敗を最低限:
- EXTRACTION_LOSS
- SEGMENTATION_LOSS
- ROLE_LOSS
- PERSISTENCE_LOSS
- PLAYBACK_LOSS
- CANDIDATE_MISS
- RANKING_MISS
- DECODER_MISS
- RENDERING_ONLY
へ分類する。

---

## G. Statistical comparison

可能な範囲でpiece-level paired comparisonを使う。
平均値だけでなくper-category / per-piece分布を記録。

final decisionでmagic thresholdを後付けしない。

---

## H. Determinism / runtime

- repeated identical input -> identical structured output
- 3 / 5 / 10 minute synthetic or public-safe MIDI workload
- CPU time
- peak memory
- candidate/segment count bound

---

## I. Sealed holdout integrity

Final Holdoutを見て調整しない。
詳細を見たらValidationへ降格。
