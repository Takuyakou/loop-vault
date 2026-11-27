# Loop Vault P4.1.2-H1 — Candidate Catalog Domain

- 作成日: 2026-07-26
- 既定Analyzer: `phase4-v1`（変更なし）
- 追加は非破壊。既存の `blockCandidates` / `candidatePatterns` の内容は不変

---

## 1. 何を追加したか

```ts
buildCandidateCatalog(input): CandidateCatalog
```

`analysis.candidateCatalog` として非永続で出力する。**選定より前に構築し、選定は一切これに触らない。**

```text
Raw Window生成 → CandidateOccurrence → exact identity統合 → Pattern grouping
  → quality floor → Candidate Catalog
                       └─ Recommendation（Catalogへの順位付き参照）
```

`blockCandidates` は従来どおり順位付きの短縮リストで、**その短縮リストが指す先の在庫がCatalog**である。順位が低い進行も消えない。

---

## 2. 削除するのは1条件だけ

**全Occurrenceがquality floor未満のPatternのみ**を除外する。

- dominance heuristicによる削除: なし（G1で0件と実測済み）
- 長さによる削除: なし
- 「推薦されなかった」による削除: なし

代表Occurrenceではなく**最良Occurrence**でfloorを判定する。代表だけで判定すると、最良の出現がたまたま検出の弱い位置にあるPatternを落としてしまう。

exact identity統合は指示どおり **start/end・canonical event sequence・duration pattern・patternId・absolute chord sequence・occurrence identity がすべて同じ場合のみ**。同じPatternでも別位置ならOccurrenceとして保持する。

---

## 3. `uncertain` を4番目の分類として追加

`progression` / `vamp` / `fragment` / **`uncertain`**。

`uncertain` は品質の第4段階ではない。**分類がTimelineの詳細に依存しており、本Phaseがそこに触っていないことの表明**である。

判定条件（どちらかに該当）:

1. 代表Occurrenceのイベントの**半数以上**が `missing-quality-defining-tone` / `ambiguous-quality` を持つ
2. 1小節あたりのコードイベントが **3を超える**（人が書き下ろす進行ではなく、アルペジオが窓ごとに別コードへ割れた形）

閾値を「3超」にしたのは、1小節3コードは普通の音楽だからである。

**Stage F前のため、分類を不可逆な削除条件に使わない。** `uncertain` はCatalogに残り、主推薦からのみ外れる。

### 実測での効き方

| ファイル | patterns | prog | vamp | frag | **uncertain** |
|---|---:|---:|---:|---:|---:|
| `15.Endless,endless.` | 1777 | 1167 | 2 | 113 | **495** |
| L06_vamp-only_stress | 46 | 0 | 0 | 0 | **46** |
| S01_clean-triad-loop_clean | 11 | 4 | 0 | 7 | 0 |

**L06_stress の46 Patternすべてが `uncertain` になった。** これはワンコードvampだけの96小節にアルペジオstressをかけたファイルで、G0で「全カードが `progression` に分類される」と報告した個体である。単一コードが窓ごとに割れているだけなのに進行だと言い切っていたものが、いまは「判定保留」と言う。**Stage F の対象であることを、削除ではなく分類で表明できている。**

---

## 4. Diagnostics

```ts
rawWindowCount / occurrenceCount / patternCount / exactDuplicateCount
unreachablePatternCount / unreachableOccurrenceCount
progressionCount / vampCount / fragmentCount / uncertainCount
belowQualityFloorPatternCount
```

`unreachable*` は構造上0になる（保持したPatternはすべて `patterns` にあり、全OccurrenceはPatternに乗る）。**将来この不変条件を壊す変更が入ったときに黙って通らないよう**、0を報告し続ける。

実測 runtime: Endless 1777 Pattern で **294 ms**（上限3000 ms）。

---

## 5. 追加したテスト（13件）

`src/domain/midi/candidateCatalog.test.ts`

```text
keeps one pattern with four occurrences rather than four patterns
keeps the four-bar motif and the eight-bar phrase that contains it
does not merge spans that share a chord order but not a duration pattern
groups a transposed repeat while each occurrence keeps its own chords
records every generator that proposed a window without duplicating the candidate
keeps patterns the recommender would never choose
removes a pattern only when every occurrence is below the floor
keeps a pattern whose best occurrence clears the floor even when others do not
reports no unreachable pattern or occurrence
orders the catalog by position rather than by score
produces the same catalog on a rerun
keeps a thousand patterns reachable and builds them inside the runtime budget
marks a shape it cannot classify as uncertain instead of guessing
```

### 5.1 自分のfixtureのバグを2件直した

最初の1000 Patternテストは **11 Pattern しか作れていなかった**。3つの音程をすべて `index` の倍数から導いたため、Pattern identity が移調不変であることにより11通りしか生じなかった。3つを独立に振るよう直した。

`uncertain` のテストは4小節に12イベント（1小節3コード）で、閾値「3超」を満たしていなかった。16イベント（1小節4コード）へ直した。**閾値のほうを緩めなかった**のは、1小節3コードが普通の音楽だからである。

---

## 6. 触っていない層

Timeline / `qualityEvidence` / canonical identity / `blockQuality` / `attachSourceVoicing` / 保存schema（`fileVersion = 1`）/ `defaultAnalyzerMode` / G2二段階Selectorの既定化。

`analysis.candidateCatalog` は**追加**であり、既存フィールドの内容も型も変えていない。UIはまだこれを読んでいない（H3で接続する）。
