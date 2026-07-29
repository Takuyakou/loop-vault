# Phase 5.1 Privacy And Schema Audit

## Vault Compatibility

| Check | Baseline | Final | Result |
|---|---|---|---|
| `src/domain/schema.ts` SHA-256 | `7770a544139f57579a5079e423ddc0b9d4c93e881d284f9e25bc18be9caf3137` | same | PASS |
| `fileVersion` | 1 | 1 | PASS |
| Default analyzer | `phase4-v1` | `phase4-v1` | PASS |
| Vault schema field addition | none | none | PASS |
| Saved progression rewrite | none | none | PASS |

`AnalysisSession`、MIDI bytes、display name、Piano Roll state、prepared inputはruntime-onlyである。
`AnalyzeMidiOptions.preparedData`、`analysisInput`、`analysisFingerprint`は解析呼び出しの境界だけで使い、
Vault dataまたはexport schemaへ追加していない。

## Role Correction Log

保存先はAppData相対pathの`loopvault/role-corrections.jsonl`で、Vault外に分離している。
strict zod schemaは次の集計値だけを許可する。

- source position (`master | added`)
- auto/assigned role、confidence
- dominant GM program number
- channel、note count、pitch range
- average duration/polyphony
- preset、manual change、included、exact duplicate
- analyze executed、timestamp

禁止情報はschemaに存在しない。

- raw MIDI / bytes
- absolute path
- runtime file name
- track name本文
- song/Idea title
- memo
- MIDI note列

ログは解析成功後だけ追記し、既存の解析フィードバック設定でopt-outできる。
設定画面からexportとdeleteが可能で、書込失敗はVault保存や解析結果を壊さない。

## Repository Audit

- tracked `.mid` / `.midi`: 0
- tracked `.local-evaluation/*`: 0
- 実MIDI評価結果: `.local-evaluation/phase5.1`のみ
- tracked評価JSON: 決定論的に生成したfixtureの集計のみ
- tracked文書内の個人MIDI absolute path: 0
- tracked文書内の実file name: 0

## Existing Systems

次の永続化・製品経路は変更していない。

- Vault atomic save / backup
- import / export
- SavedProgressionBlock schema
- Live MIDI
- Chord Dojo
- Voicing Memory
- practice progress
- PlaybackControllerの既存公開契約

## Result

Privacy、Vault schema、file version、Analyzer defaultの全GateはPASSした。
