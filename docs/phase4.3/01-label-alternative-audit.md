# P4.3-01 Label Alternatives / Reachability Audit

実行コマンド:

```text
npm run eval:p43:labels -- --split dev
```

対象はGold corpusのdev 40 MIDI / 320 events。Analyzerは`phase4-v1`。
validationとholdoutは未実行である。

## 結果

| 指標 | 結果 |
|---|---:|
| representableRate | 100.00% |
| canonicalExact@1 | 60.94% |
| root@1 | 94.69% |
| top3Canonical | 70.63% |
| top3Root | 98.13% |
| correctCandidateMeanRank | 1.137 |
| MRR | 0.658 |
| rootDiversityAt3 | 2.05 |
| canonicalDiversityAt3 | 3.00 |
| alternativeDuplicateIdentityCount | 0 |
| manualInputRequiredRate | 12.50% |
| correctionCost mean / median / p90 | 0.769 / 0 / 3 |

Correction categoryはPrimary 195、alternative 44、structure editor 41、
manual input 40、unrepresentable 0。

## Reachabilityと検出を分離した判断

dev Goldの320 labelsはすべてparser -> serializer -> canonical identityの
round-tripに成功した。したがって今回のTop-3 miss 94 eventsは表現不能ではなく、
現行候補の採点・順位または区間対応によるもの。P4.3でparser語彙を追加しても、
このbaselineのTop-3は改善しない。

Top-3 canonical missの頻出labelは `A7b9` 40、`Em7` 10、`Dm7` 10、
`Am9` 8、`Dm9` 8、`G13` 8、`G7sus4` 6、`Cmaj9` 4。
ただしrootは314/320でTop-3へ到達しているため、主な修正負担はroot探索より
quality / seventh / tensionの選択にある。

## Alternatives多様性

Top-3のcanonical identityは平均3.00で重複0。rootは平均2.05なので、
「3候補が同一identityで埋まる」問題は再現しなかった。一方、約29.38%のeventで
正解canonicalがTop-3に無く、root多様性だけでは低い修正コストを保証しない。

## 語彙優先度

指示書の各unsupported familyはdevで全て0:

- maj13
- dom13sus
- minMaj7
- altered dominant
- parenthesized tensions
- no3 / omit
- multiple tensions
- slash + complex quality
- parser unsupported
- serializer unsupported

よってTrack Cのrepresentation-only vocabulary extensionは**着手しない**。
対象family、頻度、Gateを事前固定できる非ゼロclusterが無いためである。

## 根拠

- 監査CLI: `scripts/audit-phase43-labels.ts`
- 生のevent別結果: `docs/phase4.3/01-label-alternative-audit.json`
- parser / serializer: `src/domain/chords.ts`
- canonical identity: `src/domain/chordIdentity.ts`
- correction cost: `src/domain/midi/correctionCost.ts`
- Analyzer入口: `src/domain/midi/analysis.ts`
