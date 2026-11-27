# Loop Vault Phase 7 — Stage Plan P7-00 → P7-11

各Stageは前Stageの成果を読む。通常の失敗でユーザー承認を求めず、Stage内で修正・再試験して進める。
各Stage終了時に `docs/phase7/...` 相当のtracked reportを作成し、最低限の成果を残す。

---

## P7-00 — Repository / Evidence / Contract Audit

目的:
- 現行Analyzer / Role / Boundary / Candidate / Decoder / Persistence / Playback経路を監査
- Phase 7 production invariantsをfreeze
- available corpora / Gold / private local casesを棚卸し
- existing metricsの意味を確認

必須成果:
- current architecture map
- corpus inventory
- Gold availability matrix
- private/local-only inventory policy
- production protected-path manifest
- baseline commands
- known failure taxonomy

Gate:
- Phase 7研究がproduction挙動を変えず開始できること

---

## P7-01 — Boundary × Role Oracle Ablation

2×2:
- Product Boundary / Product Role
- Gold Boundary / Product Role
- Product Boundary / Gold Role
- Gold Boundary / Gold Role

対象:
- Chord Drip/equivalent clean synthetic
- Harmony Support Gold/equivalent melody-containing corpus

追加:
- role truth availabilityを最初に監査
- melody leak / harmony false-removal / tension contaminationを計測

目的:
BoundaryとRoleのどちらがどの損失へ寄与しているか分離する。

---

## P7-02 — Temporal Ground Truth / Boundary Taxonomy

目的:
- Harmonic Boundary
- Voicing Boundary
- Ornament/Note Event
を独立Goldとして表現できる評価形式を作る。

Synthetic categories:
- one-voice passing note
- neighbor/appoggiatura
- re-strike
- same-voicing arpeggio
- voicing-only shift
- one-beat passing chord
- half-beat passing chord
- true harmonic change
- sustain residual
- bass pedal point

Chords.midはlocal-onlyで同taxonomyへ匿名評価。

---

## P7-03 — Tier 1 End-to-End Fidelity Harness

Gold target note numbersから以下を独立照合:
- extraction
- card/source representation
- persistence/reload
- playback plan/card playback
- whole progression playback if applicable

Copy-Oracleをここで成立させる。

目的:
Analyzer以前/以後の損失を分離する。

---

## P7-04 — Harmonic Truth / Equivalence / Rendering Contract

目的:
Tier 2の正解規約を固定。

扱うもの:
- pitch-content + bass equivalence
- multiple valid chord labels
- rootless interpretation
- omissions / extensions / alterations
- canonical identity vs renderer spelling
- naming-only difference

既存Goldを上書きしない。versioned evaluation contractとして追加。

---

## P7-05 — Failure Decomposition / Correction Cost / Margin

目的:
現行Coreを新評価契約で診断。

計測:
- Tier 1 fidelity
- Tier 2 candidate recall / rank / Top-K
- boundary over/under split
- voicing boundary misses
- role correction cost
- note correction cost
- card-count correction cost
- naming-only cost
- winner margin / near-tie / score decomposition where available

結果:
「何を改善すべきか」をranking一語でまとめない。

---

## P7-06 — Corpus Expansion / Sealed Synthetic Holdout / Baselines

目的:
比較大会の前にデータを固定。

- dev
- validation
- regression
- sealed synthetic holdout
を分離。

ここでCopy-Simple / Copy-ProductBoundaryもfreeze。

注意:
Role truth作成可否の確認はP7-01より前に必要なので、このStageまで延期しない。

---

## P7-07 — Candidate Representation / Vocabulary Experiments

比較候補:
- legacy closed templates
- expanded bounded templates
- factorized/open candidate representation
- frequent-template shortcuts + factorized long-tail

KPI:
- Candidate Recall
- representability
- boundedness
- long-tail coverage
- false candidate explosion
- runtime

Candidate RecallをTop-1より先に評価。

---

## P7-08 — Boundary / Role / Local Scorer Experiments

比較:
- fixed/beat-based boundary
- onset/offset/change-point proposals
- lattice-style boundary proposals
- product role
- soft role evidence
- optional learned prior if feasible
- local scoring alternatives

短いpassing chord protectionを必須testに含める。

---

## P7-09 — Modular Tournament / Decoder / Copy Baseline Comparison

最大24 configurations。

必須:
- Copy-Oracle
- Copy-Simple
- Copy-ProductBoundary
- old Identity × old Decoder
- new Identity × old Decoder
- old Identity × new Decoder C1/C2
- new Identity × new Decoder C1/C2

Role / Identity / Temporal Decoderを交換式に比較。

Greedy elimination禁止。
new Identity × new Decoderは単体結果に関係なく実施。

主な比較軸:
- Tier 1
- Tier 2
- correction cost
- boundary quality
- passing chord
- melody contamination
- Top-K/candidate recall
- runtime
- regression

---

## P7-10 — External Baseline / Live MIDI / Product Architecture Decisions

### BACHI
公式版が実行可能ならbaseline。
不可能なら理由を記録。

### Live MIDI
offline Core v2との共有範囲を決定。

### Vault vocabulary
observed / representable / unsupported / renderer-onlyを整理。

### Architecture shortlist
P7-09結果から2〜3構成へ絞る。
ここでもsealed holdoutは開かない。

---

## P7-11 — Final Sealed Evaluation / Architecture Decision / Phase 8 Handoff

1回のfinal sealed evaluation。
結果後retune禁止。

出力:
- final architecture
- alternatives rejected
- Tier 1 / Tier 2
- Copy baseline comparison
- category metrics
- component interaction findings
- correction cost
- performance
- regression
- holdout limitations
- Live MIDI decision
- Vault vocabulary decision
- Phase 8 implementation order
- rollback/feature seams
- risk register

STOP。
Core v2 production implementationを開始しない。
