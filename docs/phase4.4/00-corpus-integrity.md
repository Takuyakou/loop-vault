# Phase 4.4 Corpus Integrity

## 結果

| Corpus | Files | Scenarios | Events | SHA | byteLength | clean/stress | Valid |
|---|---:|---:|---:|---:|---:|---:|---|
| general | 60 | 30 | 496 | 60/60 | 60/60 | 30 | true |
| melody contamination | 32 | 16 | 256 | 32/32 | 32/32 | 16 | true |

## Gold注釈

- general: Source-faithful / Aggregate / Dojo Gold、Track role、distractor注釈を確認
- dedicated: Gold voicing、Gold track role、Gold per-note role、excluded distractor、
  Bass / Upper / Top / Bottomを全イベントで確認
- splitを跨ぐscenario: 0
- 専用corpusのdev / validation / holdout MIDI数: 20 / 6 / 6
- MIDI本体は`.local-evaluation`に置き、Gitへ追加しない
