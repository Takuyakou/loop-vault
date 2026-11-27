# P4.3-07 Representation-only Vocabulary Extension

## 判断

**未実施**

P4.3-01で事前固定した着手条件を満たさない。

- dev 320 Gold eventsのrepresentableRate: 100%
- parser unsupported: 0
- serializer unsupported: 0
- 監査対象unsupported family: 全て0
- round-trip不能な非ゼロfamily: 無し

したがって、対象family、頻度、改善Gateを結果確認前に固定できない。
この状態でparser / serializer / editorを変更すると、測定された問題の修正ではなく
不要な語彙拡張になるため着手しない。

## 変更しなかったもの

- parser / serializer
- `ChordQuality` / `Tension`
- Manual Editor
- detector template
- root / quality / tension score
- Candidate ranking
- `defaultAnalyzerMode`
- Vault schema / `fileVersion`

## Top-3 missとの関係

devの`top3Canonical`は70.63%だが、missしたGold labelも全て表現可能だった。
P4.3-07のrepresentation-only変更ではこの問題を解消できない。
検出・順位改善はStage F固定とPhase 4.3の非目的により実施しない。

根拠:

- `docs/phase4.3/01-label-alternative-audit.json`
- `docs/phase4.3/01-vocabulary-priority-lock.json`
