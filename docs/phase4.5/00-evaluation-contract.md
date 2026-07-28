# Phase 4.5 Evaluation Contract

この契約はD1〜D5の実測前に固定する。

## 目的

`phase4-v1`のrank 1を変えず、rank 2〜3の表示枠だけを再配分する価値があるか
診断する。D1〜D5とDecision Lockがallocationを支持した場合だけshadow実装する。

## 評価単位

正誤は`src/domain/chordIdentity.ts`のcanonical identityで判定する。

- raw label
- canonical identity
- root pitch class
- bass pitch class
- triad / quality family
- seventh
- extensions / alterations
- slash / inversion

canonical-equivalentは誤りに数えない。ambiguousとannotation contract issueは
通常誤りから分離する。

## Candidate Funnel

1. F0 raw generation
2. F1 canonical dedup
3. F2 eligibility
4. F3 same-root pool
5. F4 same-root rank
6. F5 global rank
7. F6 allocated Top-3

最初にGold identityが失われたstageをPrimary原因とする。

## Rank 1不変契約

baselineとshadowの全eventで次が完全一致しなければ即時FAIL。

- raw label
- canonical identity
- root
- bass
- raw score
- UI confidence
- candidate source

shadowはrank 2〜3だけを返し、Analyzer、Timeline、Primary scorerを呼び替えない。

## Split規律

- Devだけで診断、threshold固定、shadow、LOSOを行う。
- 既知Validation / Holdoutはburnedのため実行しない。
- Dev PASSでも製品昇格しない。新しい未使用評価dataが必要。
- threshold、slot配分、family選択をDev結果確定後に変更しない。

## 不変条件

- `defaultAnalyzerMode = "phase4-v1"`
- `fileVersion = 1`
- Vault schema不変
- Timeline、voicing、boundary、aggregate、fallback不変
- MIDI、`.local-evaluation`、個人ファイルをGitへ追加しない
