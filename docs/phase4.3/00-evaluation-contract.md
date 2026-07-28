# Phase 4.3 評価契約

本契約は結果を見る前に固定する。devで評価実装を作り、failure taxonomy固定後に
validationを一度、全契約固定後にholdoutを一度だけ実行する。

## Label Track

主要指標:

- `top3Canonical`
- `top3Root`
- `correctCandidateMeanRank`
- `MRR`
- `correctionCost`
- `manualInputRequiredRate`

診断指標:

- `canonicalExact@1`
- `root@1`
- `quality@1`
- `seventh@1`
- `tension@1`
- `representableRate`
- `rootDiversityAt3`
- `canonicalDiversityAt3`
- `alternativeDuplicateIdentityCount`

候補順位はPrimaryを1位、表示alternativesを2位以降とする。canonical identityは
`src/domain/chordIdentity.ts` の正規化規則で比較する。正解がTop-3に無い場合は
manual input requiredとする。correction costは
`src/domain/midi/correctionCost.ts` の操作コストを用いる。

## Voicing Track

次の3 Gold Policyを混ぜずに別々に報告する。

1. `sourceFaithfulMidi`: Vaultへ保存する元MIDI忠実配置
2. `aggregateHarmonyMidi`: 区間の和声構成音集合
3. `dojoIntegratedMidi`: 練習用にBassを統合した派生配置

必須指標:

- Note set: exact、precision、recall、F1、extra、missing
- Register: bass/top accuracy、lowest/highest absolute error、register exact、
  octave error
- Representation: type accuracy、simultaneous exact、aggregate F1、
  simultaneous miss、aggregated-as-simultaneous
- Contamination: distractor、melody、passing tone、sustain carry、
  voice duplicate leakage
- Product: source usable、generated fallback、requires review、
  stale-after-edit accuracy

## Ablation

| 条件 | Boundary | Role | 用途 |
|---|---|---|---|
| A | Gold | Gold | note selection本体 |
| B | Gold | Product | role推定損失 |
| C | Product | Gold | boundary損失 |
| D | Product | Product | end-to-end |

Gold roleは評価ハーネスのVoice annotationにだけ使い、製品解析へ注入しない。
Product boundaryは`phase4-v1`のfull timelineからGold eventとのbeat IoU最大区間を
決定的に選ぶ。voicing評価ではラベル誤差を混ぜないため、抽出時のChordSymbolは
Gold labelを使う。

## Split規律

- dev: 実装、baseline、failure taxonomy作成
- validation: taxonomy固定後に一度だけ再現確認
- holdout: 指標、閾値、分類、製品方針固定後に一度だけ最終実行
- holdout確認後にGold、閾値、分類を変更しない

## 非目的

- detector scoring、template、root、quality、tensionの変更
- Stage F shadow evidenceのPrimary接続
- Source-faithfulとDojo-integratedの合算
- 合成Goldだけを根拠にした製品抽出器の改善
