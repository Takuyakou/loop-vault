# Loop Vault P4.1.2-H 最終報告 — Non-destructive Candidate Catalog

- 作成日: 2026-07-26
- 対象: H0（契約分離）→ H1（Catalogドメイン）→ H2（動的Recommendation）→ H3（Catalog UI）→ H4（検証・holdout-v3・昇格判断）
- **最終的な製品既定: `defaultAnalyzerMode = "phase4-v1"`（変更なし）**
- **Candidate Catalog v1 の段階昇格: 行わない**（Catalog Hard Gate 13/14 通過、1件 FAIL のため）

---

## 1. H3 で作った UI 構成

レーンの決定は React を介さない純関数（`src/domain/midi/catalogView.ts`）に置いた。

### 候補が少ないとき — `unified`

Catalog の Pattern 数が上限以下で、そのすべてが推薦されている場合、見出しは1つだけ。

```text
候補 2件
```

「おすすめ 2件」と「すべて 2件」を並べない。同じカードが2度出るのは不具合に見える。

### 候補が多いとき — `laned`

```text
おすすめ            動的件数（0件ならレーンごと出さない）
ほかの進行候補       残り件数   おすすめのN件を除く
ワンコード／ヴァンプ  件数
その他の断片         件数       初期折りたたみ
判定保留            件数       初期折りたたみ
```

- 推薦が0件のときは**「おすすめ」レーン自体を出さない**。空の見出しは「この曲は解析に失敗した」と読める。
- 推薦された Pattern は kind レーンから**除外**する。両方に出すと同じ Pattern が2枚のカードになる。除外した件数は見出しに出すので数は読者の中で合う。
- `catalogPageSize = 25` と `recommendationDisplayCap = 10` は**別の定数**。前者は一度にDOMへ積む枚数、後者は推薦の上限。混同すると 1777 件の Catalog が 10 件に化ける。

---

## 2. 推薦件数の分布 — 10件固定ではない

| 入力 | 小節 | Catalog Pattern | 推薦件数 | 停止理由 |
|---|---|---|---|---|
| Chapter 3 seed（112fcbff…） | 4 | 3 | **1** | all-eligible-used |
| S01_clean（clean 8-bar） | 8 | 11 | **1** | — |
| Chapter 3 seed（12ファイル中11件） | 5 | 7〜8 | **2** | all-eligible-used |
| Chapter 3 seed（960d8388…） | 9 | 28 | **2** | all-eligible-used |
| S11_clean（進行1 + vamp1） | 16 | 54 | **1** | — |
| S12_clean（同一Pattern×4） | 32 | 22 | **3** | — |
| L06_clean（vamp中心の曲） | 96 | 47 | **1** | — |
| **L06_stress（vamp/uncertainのみ）** | 96 | 46 | **0** | **no-eligible-pattern** |
| holdout-v3 全16ファイル | 96〜160 | 218〜1052 | 10 | display-cap |
| Endless | 154 | 1777 | 10 | display-cap |
| SURAN remix | 100 | 1352 | 10 | display-cap |

**0件・1件・2件・3件・10件がすべて実際に出ている。** 10件になるのは eligible が上限を超えたときだけで、上限は目標ではない。

---

## 3. paddingCount

**観測したすべてのファイルで 0。**

- holdout-v3 16ファイル: min 0 / mean 0 / max 0
- Critical Guard 観測7ファイル: 7/7 で 0
- Chapter 3 seed 12ファイル: 12/12 で 0

`paddingCount` は「推薦件数を埋めるためだけに入れた候補」の数で、実装上つねに 0 になる。0 を*推論*せず*報告*しているのは、水増しする回帰が入ったときに数字として見えるようにするため。

---

## 4. Catalog に保持した Pattern 数

| ファイル | Catalog | progression | vamp | fragment | uncertain |
|---|---|---|---|---|---|
| **Endless** | **1777** | 1167 | 2 | 113 | 495 |
| SURAN remix | 1352 | 1102 | 0 | 134 | 116 |
| H5_stress（アルペジオ） | 1052 | 823 | 0 | 21 | 208 |
| H3_clean（非2冪区間） | 974 | 928 | 0 | 46 | 0 |
| H1_clean（vamp+進行） | 889 | 824 | 16 | 49 | 0 |
| L06_stress | 46 | 0 | 0 | 0 | 46 |
| Chapter 3 seed | 3〜28 | 1〜16 | 0 | 2〜12 | 0 |

Catalog が候補を落とす条件は**ひとつだけ**: その Pattern の**すべての** occurrence が品質フロアを下回ること（代表 occurrence ではなく最良のもので判定する）。分類が `uncertain` でも、fragment でも、vamp でも Catalog には残る。

---

## 5. 到達率

| 指標 | holdout-v3 16ファイル |
|---|---|
| `validPatternReachability`（Catalogの全Patternへ到達できるか） | **100%（16/16ファイル）** |
| `pagedPatternReachability`（ページ送りで末尾まで届くか） | **100%（16/16ファイル）** |
| `occurrenceReachability`（各Patternの全Occurrenceへ到達できるか） | **100%（16/16ファイル）** |
| `previewReachability` / `saveReachability` | **100%（16/16ファイル）** |
| `visiblePatternDuplicateCount`（同一Patternが複数カードになる数） | **0（16/16ファイル）** |
| `exactDuplicateCount` | **0（16/16ファイル）** |

Endless の 1777 Pattern は、以前なら10枠に切り詰められて 1767 件が消えていた。いまは全件が Catalog に残り、レーンとページ送りで全件に届く。

---

## 6. 1777 Pattern 時の UI 性能

| 指標 | 値 |
|---|---|
| Endless（1777 Pattern）の解析全体 | **266.9 ms** |
| `buildCatalogView` 構築（holdout-v3） | min 0.07 / mean 0.16 / **max 0.54 ms** |
| 初回描画カード数 | **25枚**（`catalogPageSize`、Catalog規模に依存しない） |
| 最大レーンを末尾まで開くのに必要なページ数 | 43 |
| 解析 runtime（holdout-v3 16ファイル） | min 88.7 / mean 143.1 / **max 190.8 ms**（上限 3000 ms） |

**保持件数と描画件数を切り離したので、性能のために候補を捨てる必要がなくなった。** 1777 件を保持していても DOM に一度に載るのは 25 枚。

---

## 7. clean 8-bar（1つの進行だけの曲）

`S01_clean`（8小節、トライアドのループ1つ）

| 項目 | 結果 |
|---|---|
| Catalog Pattern | 11（進行4 + 断片7） |
| **推薦件数** | **1** |
| paddingCount | 0 |
| 同一Pattern重複カード | 0 |

1つの進行しかない曲が「10件の候補」として提示されることはない。H2 以前は部分窓から作った3件が出ていたが、span項の追加と `isRepetitionOf` / `isRotationOf` の抑止で 1 件になった。

---

## 8. vamp-only（推薦に適した進行が0件の曲）

`L06_stress`（96小節、vamp中心の曲を抽出劣化させたもの）

| 項目 | 結果 |
|---|---|
| Catalog Pattern | 46（すべて `uncertain`） |
| eligible Pattern | **0** |
| **おすすめレーン** | **表示しない** |
| 残るレーン | `判定保留` 46件（初期折りたたみ、全件到達可能） |

「おすすめの進行」という見出しの下に何も無い、という表示にはならない。候補は消えていない。

---

## 9. Endless（報告された不具合そのもの）

| 項目 | 修正前の報告 | 現在 |
|---|---|---|
| 上位3件 | Em11/A の**2小節vampが3枠を占有** | **すべて progression（16小節 / 17小節 / 20小節）** |
| 同一Pattern重複カード | 3 | **0** |
| Em11/A vamp | 上位を占有 | Catalog の `ワンコード／ヴァンプ` レーンに残る |
| Catalog Pattern | （概念なし、10件に切り捨て） | **1777件すべて保持、到達率100%** |
| 解析時間 | — | 266.9 ms |

`endless-em11a` Critical Guard **PASS**。

---

## 10. SURAN remix

| 項目 | 結果 |
|---|---|
| 小節 | 100 |
| Catalog Pattern | 1352（進行1102 / vamp 0 / 断片134 / 判定保留116） |
| 推薦件数 | 10（`display-cap`） |
| 同一Pattern重複カード | 0 |
| paddingCount | 0 |
| 解析時間 | 180.4 ms |

---

## 11. Chapter 3 seed

12ファイルを確認（全100ファイル中）。

| 小節 | Catalog | eligible | 推薦件数 | 停止理由 |
|---|---|---|---|---|
| 4 | 3 | 1 | **1** | all-eligible-used |
| 5 | 7〜8 | 3 | **2** | all-eligible-used |
| 9 | 28 | 16 | **2** | all-eligible-used |

短い種のファイルでは推薦が **1〜2件**で止まる。停止理由が `all-eligible-used` であり `display-cap` ではないので、**上限に当たったのではなく素材が尽きた**ことが記録から判別できる。paddingCount は 12/12 で 0。

---

## 12. Chord Drip（コード検出の非回帰）

| 比較 | 結果 |
|---|---|
| `phase4-v1` vs `phase4.1.2-v1` の `fullTimeline`（bar / beat / durationBeats / chord.label） | **100/100 完全一致** |

H0〜H4 でコード検出には1バイトも触れていない。`04-timeline-non-regression.json` に記録。

保存側も無変更: `src/domain/schema.ts` と `src/domain/repository.ts` は master から差分なし、`fileVersion` は 1 のまま。既存の `data.json` はそのまま読める。

---

## 13. holdout-v3

チューニングに一度も使っていない **8シナリオ × clean/stress = 16 MIDI**。H0〜H3 の契約・閾値・実装をすべて凍結してから生成し、**一度だけ**実行した。

| ID | 題材 | 小節 | BPM |
|---|---|---|---|
| H1 | 繰り返しvamp + 4つの異なる進行 | 128 | 94 |
| H2 | 4/8/16小節の入れ子 | 128 | 102 |
| H3 | 2の冪でない区間（13/19/21/16/17/22小節） | 108 | 86 |
| H4 | ルートレス + ウォーキングベース | 96 | 138 |
| H5 | アルペジオからの抽出 | 112 | 116 |
| H6 | 人間的なずれと重なり | 112 | 78 |
| H7 | 移調された繰り返し（4つの調） | 104 | 106 |
| H8 | 長い中間セクション | 160 | 90 |

Long-form v1.1 とは別の調・別の区間長・別の配置で作った。MIDI 本体は Git に入れず、指紋のみ `04-holdout-v3-corpus.json` にコミット（同じリポジトリから再生成してバイト単位で照合できる）。

**結果を見てから Gold、Gate、Pattern identity、Recommendationルール、score、分類のいずれも変更していない。**

---

## 14. Gate 一覧と最終結果

### 14.1 Catalog Hard Gate（凍結、緩和なし）— **13/14 通過、1件 FAIL**

| Gate | 閾値 | 結果 |
|---|---|---|
| valid-pattern-reachability | 100% | **PASS** 16/16 |
| paged-pattern-reachability | 100% | **PASS** 16/16 |
| occurrence-reachability | 100% | **PASS** 16/16 |
| visible-pattern-duplicate-count | 0 | **PASS** 16/16 |
| visible-slot-waste-count | 0 | **PASS** 16/16 |
| exact-duplicate-count | 0 | **PASS** 16/16 |
| **must-show-catalog-recall** | **100%** | **FAIL 14/16**（H3_clean, H3_stress） |
| preview-reachability | 100% | **PASS** 16/16 |
| save-reachability | 100% | **PASS** 16/16 |
| deterministic | 3回同一 | **PASS** 16/16 |
| analysis-runtime | ≤ 3000 ms | **PASS**（最大 190.8 ms） |
| no-padding | 0 | **PASS** 16/16 |
| chord-corpus-non-regression | 100/100 | **PASS** |
| file-version / save-schema | 無変更 | **PASS** |

#### FAIL の原因

H3 の6区間のうち **19小節（sec2）と 22小節（sec6）** にちょうど一致する窓が候補プールに存在しない。

```
Catalog内に存在する窓長: 2, 3, 4, 8, 12, 13, 16, 17, 20, 21, 23, 24, 25, 29, 30
検出された区間:          [1,30] [31,51] [52,55] [56,67] [68,71] [72,84] [85,88] [89,108]
```

Stage E の `derived-length` 生成器は、**セグメンタが検出した**区間長とその連結長だけを候補長に使う。H3 ではセグメンタの境界が実際の区間からずれており、19 と 22 が一度も候補長に入らない。窓が作られないので Catalog に入りようがない。

**Catalog の欠落ではない。** 生成された候補は1件も落ちていない（`unreachablePatternCount` 0、到達率 100%）。Long-form v1.1 では同じ Gate が 24/24 PASS だったが、それはチューニングセットに19・22小節の must-show 区間が無かったからで、holdout がその穴を見つけた。**チューニングセットが覆っていなかった領域を holdout が暴いた**という、holdout 本来の働き方である。

Gate の文言（"Every must-show block the generator produced"）を「窓生成器が作ったもの」と読み替えれば PASS にできるが、**結果を見てから解釈を変えれば凍結の意味が消える**ので、厳しい読みで FAIL と記録した。

### 14.2 Critical Guard 6件 — **全通過**

| Guard | 結果 |
|---|---|
| clean-8bar-single-progression-no-padding | **PASS**（推薦1件、padding 0） |
| two-distinct-progressions-exactly-two | **PASS**（順位側は S11、件数側は `catalogView.test.ts`） |
| zero-eligible-hides-recommendation | **PASS**（L06_stress でおすすめ欄非表示、46件は残る） |
| one-pattern-four-occurrences | **PASS**（S12 で8 occurrence を1カードに保持） |
| endless-em11a | **PASS**（重複0、上位3件すべて progression） |
| no-low-quality-padding | **PASS**（7/7 ファイルで paddingCount 0） |

### 14.3 Recommendation Quality Target（測定のみ、昇格条件ではない）

| 指標 | holdout-v3 mean | 回帰下限 | 判定 |
|---|---|---|---|
| progressionPrecisionAt3 | **1.0** | ≥ 0.95 | OK |
| twoBarFragmentsInTop3 | **0** | ≤ 0 | OK |
| patternDiversity | **1.0** | — | OK |
| paddingCount | **0** | = 0 | OK |
| temporalDiversity | 0.55 | — | — |
| mustShowRecommendedRecall | 0.104 | 下限なし | 低い |
| **cleanStressAgreement** | **0.357** | ≥ 0.65 | **未達** |

数百の progression から10件を選ぶ以上、gold の6区間が上位10件に入る保証はなく、stress 版で順位が入れ替わるのも当然である。**これは順位品質の問題であり、H の設計はまさにそれを Catalog の昇格条件から外している** — 順位から漏れても候補は Catalog に残り、レーンから到達できる。

`cleanStressAgreement` が回帰下限に未達なので、**Recommendation v1 を唯一の提示手段にはしない**。Catalog レーンと併置する H3 の形を維持する。

---

## 15. 最終的な製品既定

| 項目 | 状態 |
|---|---|
| **`defaultAnalyzerMode`** | **`phase4-v1`（変更なし）** |
| Candidate Catalog v1 | **段階昇格しない**（`phase4.1.2-v1` 系で opt-in のまま） |
| Recommendation | 単段方式のまま |
| G2（two-pass selection） | opt-in のまま |
| Stage F | **未着手のまま** |
| `phase4.1-v1` | 削除していない |
| Timeline / qualityEvidence / canonical identity | 無変更 |
| 保存スキーマ / `fileVersion` | 無変更 / 1 |

凍結済みの昇格条件は「Catalog Hard Gate 全通過かつ重大回帰なし」。全通過していないため昇格しない。

### 昇格を再判定する条件

1. Stage E の `derived-length` 生成器が、セグメンタの境界がずれた場合でも実在する区間長を候補にできるようにする（Stage F の範囲）。
2. その修正は **Long-form v1.1（dev / validation）だけで**開発・検証する。
3. 修正後に holdout-v3 をもう一度だけ実行する。**2回目の実行である以上、holdout としての価値はその分下がる**ことを明記した上で行う。
4. 14 Gate 全通過なら段階昇格を再提案する。

holdout-v3 のコーパス自体（`04-holdout-v3-corpus.json` の指紋）は変更しない。

---

## 16. rollback 方法

H0〜H4 は**製品の既定を一度も変えていない**（`defaultAnalyzerMode` は終始 `phase4-v1`）。Catalog は `phase4.1.2-v1` 系のモードでのみ構築され、既定の解析経路には入らない。

| 範囲 | 手順 |
|---|---|
| H4 のみ（評価とドキュメント） | PR #195 のマージコミットを revert。スクリプトとドキュメントだけが消える |
| H3（Catalog UI） | PR #194 を revert。`CaptureView` は `candidateLanes()` の fallback 経路に戻る |
| H2（動的Recommendation） | PR #193 を revert |
| H1（Catalogドメイン） | PR #192 を revert |
| H 全体 | #192〜#195 を新しい順に revert |

いずれも保存データの移行を伴わない（`fileVersion` は 1 のまま、スキーマ無変更）。force-push は使っていない。

---

## 17. PR 一覧

| Stage | 内容 | PR |
|---|---|---|
| H0 | Catalog契約と Recommendation 目標の分離（凍結） | https://github.com/Takuyakou/loop-vault/pull/191 |
| H1 | Candidate Catalog ドメイン | https://github.com/Takuyakou/loop-vault/pull/192 |
| H2 | 動的 Recommendation | https://github.com/Takuyakou/loop-vault/pull/193 |
| H3 | Candidate Catalog UI | https://github.com/Takuyakou/loop-vault/pull/194 |
| **H4** | **検証・holdout-v3・昇格判断** | **https://github.com/Takuyakou/loop-vault/pull/195** |

---

## 18. 検証結果

| 項目 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | **1282 passed / 169 files** |
| `npm run build` | PASS |
| `cargo test` | PASS |
| `git diff --check` | clean |
| `npm run check:staged` | clean（private MIDI・生成物なし） |

`npm run tauri build` は未実行。H は製品コードの Rust 側にもビルド設定にも触れていないため、`npm run build` と `cargo test` の通過で代替した。デスクトップ配布物を作る前には別途実行が必要。

---

## 19. 残っている課題

1. **`must-show-catalog-recall` の FAIL** — Stage E の `derived-length` が、セグメンタの境界ずれに耐えない。Stage F で扱う。
2. **`cleanStressAgreement` 0.357** — stress 版で推薦の順位が大きく入れ替わる。Catalog があるので致命ではないが、順位の安定性としては低い。
3. **`mustShowRecommendedRecall` 0.104** — 長い曲では gold 区間が上位10件に入らない。順位問題であり在庫問題ではない。
4. **`meanCorrectionClicks` / `recommendationSaveRate`** — 製品テレメトリが無いため測定できず、目標として記録だけしてある。
5. **`npm run tauri build` 未実行**（上記18参照）。
