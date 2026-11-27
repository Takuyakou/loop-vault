# Phase 4.7 Evaluation Contract

## Decision Lock

- Canonical Bass Semantics: Contract A
- Part A: automatic bass attachmentでplain identityを保持し、slash companionを加算する
- Part B: bass evidence scoring、plain/slash score分離、rank 1変更。Phase 4.7では禁止
- altered dominant、root、quality、tension、boundary、aggregate、fallback、voicingは対象外

## Candidate contract

1. `baselineCandidateSet`は変更後candidate setの部分集合である。
2. 既存candidateのlabel、canonical identity、score、confidence、provenance、source、
   relative orderを変更しない。
3. companionはautomatic bass attachment由来のslash candidateからのみ作る。
4. companionはcanonical round-tripとnote-instance provenanceを持つ。
5. canonical duplicateを作らない。
6. 同点では既存Product candidate、既存順位、生成順、canonical identityの順で決定する。

## Gates

- rank 1 raw/canonical/root/bass/score/confidence/source: 320/320不変
- Product Analyzer hash: 不変
- baseline Top-3正解: event単位で100%保持
- new canonical/root miss: 0
- Inertness: 100%
- average added candidate: 0.25/event以下
- maximum added candidate: 2/event以下
- duplicate: 0
- provenance: 100%
- runtime overhead: 5%以下
- determinism: 100%

## Applicability minimum

- Dev: 24 events
- Validation: 12 events
- Holdout: 12 events

Corpus Integrity時点で不足していたsplitは`Corpus Applicability Inconclusive`とし、
後続splitを開かない。同じCorpusへ結果確認後にイベントを追加しない。

## Split discipline

- 既存40 MIDI / 320 eventはdiagnostic/regression専用。
- 新Corpus `loop-vault-bass-companion-identity-gold-v1`を固定する。
- Dev PASS後にValidationを一度だけ開く。
- Validation PASS後にHoldoutを一度だけ開く。
- Validation / Holdout後のtie-break、budget、family、score変更は禁止。

## Rollback

Product接続前は評価用Shadowとdocsを削除すればよい。接続する場合はschema外の
feature flagを設け、OFFで現行candidate pipelineへ完全復帰させる。Vault migrationと
data rewriteは行わない。

