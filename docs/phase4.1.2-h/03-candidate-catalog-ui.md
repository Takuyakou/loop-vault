# Loop Vault P4.1.2-H3 — Candidate Catalog UI

- 作成日: 2026-07-26
- 既定Analyzer: `phase4-v1`（変更なし）
- Catalog を持たないモードでは**従来の表示のまま**（fallback 経路を残している）

---

## 1. UI構成

レーンの決定は `src/domain/midi/catalogView.ts` の純関数に置いた。Reactを描画せずにルールを検証できる。

### 少数候補時 — `unified`

Catalog の Pattern 数が cap 以下で、**そのすべてが推薦されている**場合、見出しは1つだけになる。

```text
候補 2件
```

「おすすめ 2件」と「すべて 2件」を並べない。同じカードが2度出るのは不具合に見える。

### 多数候補時 — `laned`

```text
おすすめ            動的件数
ほかの進行候補       残り件数（おすすめのN件を除く）
ワンコード／ヴァンプ  件数
その他の断片         件数（初期折りたたみ）
判定保留            件数（初期折りたたみ）
```

推薦が0件のときは**「おすすめ」レーン自体を出さない**。空の見出しは「この曲は失敗した」と読める。

---

## 2. 受け入れ条件への対応

| 条件 | 実装 |
|---|---|
| clean 8-bar で推薦1件なら1件だけ | `recommendationCount = 1` → おすすめレーンにカード1枚 |
| 同一Pattern・低品質での水増しなし | H2の `restatesRecommended` と quality floor。UI側で件数を足さない |
| 同じ少数集合なら単一一覧へ統合 | `mode: "unified"` |
| vamp-only で「おすすめの進行」と誤表示しない | 推薦0件ならレーンを出さない。vamp は専用レーンへ |
| uncertain を Catalog から削除しない | `判定保留` レーンに全件。初期折りたたみのみ |
| 1777 Pattern を切り捨てない | ページ描画。全件が `reachablePatternIds` に含まれる |
| page size と推薦件数を混同しない | `catalogPageSize = 25` / `displayCap = 10`。**別の定数** |
| DOMへ全カードを同時描画しない | `laneRenderPlan` が1ページ分だけ返す |
| 同一patternId を複数カードにしない | 推薦されたPatternは kind レーンから除外し、除外数を見出しに出す |
| 各Occurrence へ個別到達・試聴・保存 | 既存の `OccurrenceList` をそのまま使用（変更なし） |

### 2.1 「同一patternIdを複数カードにしない」の実装

推薦されたPatternを**kindレーンから外す**。両方に出すと同じPatternが2枚のカードになる。

外した分は見出しに出す。

```text
ほかの進行候補  1102件  おすすめの10件を除く
```

数が読者の中で合う。

---

## 3. 描画とデータを分けた

```ts
laneRenderPlan(lane, { open, limit }) -> { visible, remaining }
```

- 閉じたレーンは**0枚描画し、全件保持する**
- 開いたレーンは `catalogPageSize`（25）ずつ増える
- `remaining` は「まだ頼める件数」であって「捨てた件数」ではない

`catalogPageSize` を `defaultRecommendationDisplayCap` と別の定数にしたのは、**片方が他方を意味してしまう事故**を防ぐためである。cap は素材が支える提案数、page size は一度に組むDOM量で、結び付けると1777 Patternのファイルが黙って10 Patternになる。

---

## 4. アクセシビリティ

- 折りたたみボタンに `aria-expanded` と `aria-controls`
- レーン見出しは `<h4>`
- 件数は色ではなくテキスト
- `data-candidate-lane` / `data-lane-toggle` / `data-lane-show-more` で状態を機械可読に
- Occurrence の位置読み上げは既存の `OccurrenceList` の `aria-label` をそのまま利用

---

## 5. 追加したテスト（12件）

`src/domain/midi/catalogView.test.ts`

```text
merges the two sections when they are the same short list
shows one recommendation and keeps the rest reachable in their lanes
omits the recommendation lane entirely when nothing is eligible
never shows one pattern as two cards
reports the recommended patterns a kind lane is not repeating
keeps every pattern of a large catalog reachable, page size aside
collapses fragments and uncertain candidates without hiding them
reaches every occurrence of every pattern
builds the same view on a rerun
renders a page at a time rather than the whole lane
renders nothing for a closed lane and still holds everything
reaches the end of the lane by asking for more pages
```

最後の3件が「描画は有限、データは全件」を直接固定している。

---

## 6. 触っていない層

Timeline / `qualityEvidence` / canonical identity / `blockQuality` / 保存schema / `defaultAnalyzerMode` / `ProgressionCandidateCard` の中身 / `OccurrenceList`。

Catalog を持たないモード（`phase4-v1` を含む）では `candidateLanes(result.blockCandidates)` の旧経路がそのまま動く。**既定の表示は変わっていない。**
