# Phase 4.5 Split Audit

## Corpus

対象はローカルの`test/loop-vault-voicing-gold-corpus-v1`。
MIDI本体はGit管理しない。

| Split | MIDI | Events | Scenarios |
|---|---:|---:|---:|
| Dev | 40 | 320 | 20 |
| Validation | 10 | 96 | 5 |
| Holdout | 10 | 80 | 5 |

## 過去利用

- Phase 4.3のlabel候補監査はDevだけを実行した
  (`scripts/audit-phase43-labels.ts`,
  `docs/phase4.3/01-label-alternative-audit.md`)。
- Phase 4.3のvoicing評価ではValidation / Holdoutを実行し、Gold chord labelを
  voicing抽出の固定入力として使用した
  (`docs/phase4.3/05-voicing-ablation-validation.json`,
  `docs/phase4.3/05-voicing-ablation-holdout.json`)。
- Phase 4.3のHoldoutは最終報告へ公開済み
  (`docs/phase4.3/09-final-report.md`)。
- 過去にcandidate allocation、root confidence calibration、
  rank 2〜3のthreshold選択は実施していない。

## 判定

Validation / Holdoutはlabel allocationの調整には使われていないが、Gold labelを
含むsplit自体は既に開かれている。保守的に**burned**と扱い、未使用splitとして
昇格根拠へ再利用しない。

Phase 4.5では次だけを許可する。

- Dev: D1〜D5、Decision Lock、shadow実装、Dev / LOSO診断
- Validation: 実行しない
- Holdout: 実行しない

製品昇格には、新規label Gold Corpusまたは実行前に固定された未使用splitが必要。
