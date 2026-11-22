# テストの揺れ: test-stability-2

- ブランチ: `chore/test-stability-2`(master `e4e1dbeb` から。P20 とボイシングドリル修正入り)
- 検証したコード: `4d14baab`
- マージ・push はしていない。
- **3 回連続 FULL PASS**(各 1 回で通過)
- retry 0(ローカル)・skip 追加・期待を弱める変更はしていない。

## 1. 共通の待ち方

`e2e/helpers/settle.ts`:

- `settlePaint(page)`: `document.fonts.ready`(API があるとき)+ `requestAnimationFrame` 2 回。固定時間は使わない。
- `settleBox(page, locator)`: 2 フレーム連続で `boundingBox`(x/y/width/height)が同じになるまで待つ。
- `settleScroll(page, locator)`: 2 フレーム連続で `scrollLeft/scrollTop` が同じになるまで待つ。
- `settleCount(page, locator)`: 2 フレーム連続で件数が同じになるまで待つ。

## 2. 直した spec と箇所

| spec | 箇所 | 直し |
|---|---|---|
| `e2e/p5-26-1-ui-fixes.spec.ts` | `layout()` の scrollWidth/scrollHeight、320px の最後のカード、矢印キーの選択カード | 測る前に `settlePaint`。`scrollLeft = scrollWidth` の後に `settleScroll`。矢印キーは 120ms 待ちをやめ、選択中カードが枠内に来るまで `expect.poll`(状態待ち)。 |
| `e2e/p5-26-2-overview.spec.ts` | 全体ストリップの `scrollLeft = 0 / scrollWidth` | 設定後に `settleScroll` してから `windowFractions`/`boundingBox` を読む。 |
| `e2e/p12-theme-score.spec.ts` | `theme()` helper | Dojo ホームの表示 + `settlePaint` の後に `dojo-theme` を読む。 |
| `e2e/dojo-list-scroll.spec.ts` | 一覧へ戻った直後のスクロール/フォーカス | 一覧表示後に `settlePaint` してから `scrollTopOf`/activeElement を読む。 |
| `e2e/p12-4-long.spec.ts` | 「次のキー（おまかせ）」のカード件数 | 練習画面の表示後に `settlePaint` してから件数を読む。 |
| `e2e/p12-chord-dojo.spec.ts` | 1366×768 の初期ビューポート、スキップ後のスコア件数 | `assertPracticeViewport`/件数の前に `settlePaint`。 |
| `e2e/vl-13-voicing-loop.spec.ts` | ループ再開の head/fill(今回の FULL で新たに落ちた) | 2 段の `expect.poll` をやめ、**1 つの状態待ち**(head>40 を記録 → head<10 かつ |fill−head|≤1)にした。2 段目が再開直後を外して「on/past」になっていた。 |
| `e2e/p18-practice-frame.spec.ts` | 既に `settle`(fonts.ready + 2 フレーム)あり | 変更なし。 |
| `e2e/phase13-1-bass-ui.spec.ts` | リアルタイム音声の測定 | 既に heavy(workers=2)へ分離済み。変更なし。 |

`p5-26-1` / `p12-theme-score` / `dojo-list-scroll` / `p12-4-long` / `p12-chord-dojo` / `p5-26-2` は、以前の FULL で負荷時に落ちていたものです。

## 3. 落ち方の調査

- **p5-26-1 矢印キー**: `scrollLeft` の変更/矢印キーの直後に、スクロールの反映を待たず `getBoundingClientRect` で「選択中カードが枠内」を 1 回だけ測っていた。負荷時にスムーズスクロールが間に合わず、16 回目で `false`。固定 120ms では足りないため、状態(枠内に入る)を待つ形に変更。
- **vl-13 ループ**: `head>40` を待つ poll が再開直前に終わり、次の `head<10` poll が再開後(18.85)を読んでいた。さらに `fill` を別 poll で見たため、再開直後の同じ瞬間を捉えられず `on/past`。1 つの poll で「40 を超えたことを記録 → 10 未満かつ fill が head の上」を同時に満たすまで待つ形に変更。
- その他は、状態/スクロール/描画の反映待ちが無い箇所を `settle` helper に置き換えた。

## 4. 再現の測定

対象 7 本(`phase13-1-bass-ui`, `p18-practice-frame`, `dojo-list-scroll`, `p12-4-long`, `p12-theme-score`, `p12-chord-dojo`, `p5-26-2-overview`)を FULL と同じ 6 workers で 3 回:

| 回 | 結果 | 件数 | 時間 |
|---|---|---|---|
| 1 | PASS | 141/141 | 172.1s |
| 2 | PASS | 141/141 | 172.7s |
| 3 | PASS | 141/141 | 172.7s |

7 本だけでは 3/3 再現しなかった。FULL 全体の同時実行でだけ落ちるため、CPU の取り合い + 描画/スクロール待ちの不足と判断した。

主パスの並列を下げた測定:

| workers | 結果 | 時間 |
|---|---|---|
| 6(通常) | 直近 FULL は 1 件ずつ違うテストが揺れた | 415.9s(light pass) |
| 4 | `p5-26-1` が 1 件 FAIL | 560.6s(**+144.7s、約 +35%**) |

並列を下げても 1 件落ち、時間も +35% のため、**並列数は 6 のまま**にし、待ち方を直す方を採った。

## 5. trace

`playwright.config.ts` は元から `trace: "retain-on-failure"`(ローカル retries 0)。今回の調査でも失敗時だけ trace が残る設定をそのまま使った。変更はしていない(理由: 失敗した回の trace を見られるようにするため。通常時は記録しない)。

## 6. FULL 3 回連続

| 回 | 結果 | 時間 | Vitest | Playwright | heavy |
|---|---|---|---|---|---|
| 1 | PASS | 929.0s | 6345/6347 | 825/827(既存 skip 2) | 59/59 |
| 2 | PASS | 919.0s | 6345/6347 | 825/827(既存 skip 2) | 59/59 |
| 3 | PASS | 958.0s | 6345/6347 | 825/827(既存 skip 2) | 59/59 |

3 回とも 1 回で通過。落ちた回は数えていない。
