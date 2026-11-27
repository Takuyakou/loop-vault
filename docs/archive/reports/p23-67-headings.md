# P23-67 見出しの整理(Bass Practice のホームと Chord Dojo のホーム)

ブランチ: `fix/p23-67-headings`(local master `7b4a1b23` から)

## 何を変えたか

消したのは次の 2 つだけです。

| 画面 | 消したもの |
| --- | --- |
| Bass Practice のホーム | 見出し「聴いてまねる」(と、それだけが入っていた空の `.lv-bh-top` / `.lv-bh-heading` の箱) |
| Chord Dojo のホーム | 見出し「よく使う練習 押すと開きます」 |

次の 2 つは残しています(最初の作業で誤って消したため、元に戻しました)。

| 画面 | 残したもの |
| --- | --- |
| Bass Practice のホーム | 「弾いて確かめる」(MIDI のカードの上の行)と `.lv-bh-group` の CSS |
| Chord Dojo のホーム | 「順番に学ぶ 見本を見て弾き、Lv1 から段を進めます」 |

そのほかの変更:

- Jazz Progressions の説明文(`JAZZ_PROGRESSIONS_NOTE`)を「ジャズのオシャレなコード進行」にしました。画面の末尾にあった「左手・右手の音と指番号のとおりに弾きます」は消しました。
- Bass のホームは、見出しの行が無くなったので、グリッドを「続きから」の行 + カードの行の 2 行にしました。
- Dojo のホームは、右の列の上の余白(`padding-top:24px`)を外しました。右の列の上端は、4 枚のカードの上端と揃います。
- `jazzProgressions.json` の `note` と、そのテスト(`jazzProgressions.test.ts:41`)は変えていません。画面には出ない開発用のメモのためです。

## テストの変更

「消した 2 つが 0 件」と「残した 2 つがある」を確かめる形に合わせました。

- 単体: `BassPracticeHome.test.tsx`(`H3b`: `.lv-bh-top` / `.lv-bh-heading` が無い、`.lv-bh-group` が「弾いて確かめる」だけ)。
- e2e: `p23-25-bass-practice` / `p23-27-dojo-home` / `p23-36-bass-home` / `p23-43-resume-width-and-hover` / `p23-47-fix-4-ui` / `p23-58-motion` / `p23-65-home-loop` / `jazz-progressions`。
- Dojo の「カードの下の隙間がカード間と同じ」という確かめは外し、「右の列の上端がカードの上端と揃う」に替えました。「順番に学ぶ」が戻ったので、隙間が同じではなくなったためです。

## 写真

- 確認用: `docs/reports/p23-67-assets/` に 6 枚(Bass のホーム・Dojo のホームの 1440×900 と 1920×1080、Dojo の一覧の Jazz、Jazz 練習)。
- README の `docs/images/v3-chord-dojo.png` と `v3-bass-practice.png` を撮り直しました。
- 基準写真は 1 枚だけ更新しました(利用者の操作)。
  - `e2e/visual.spec.ts-snapshots/practice-chromium-desktop-win32.png`(Chord Dojo のホーム、1280×720)。
  - 違いは「よく使う練習 押すと開きます」の行が無くなったことだけです。目視で確認しました。
  - 変更された基準写真はこの 1 枚だけです。

## 確認

- `tsc --noEmit`、`npm run typecheck:e2e`: 通過。
- 単体(bass-practice/ui、chord-dojo、domain/chordDojo): 2206 本通過、2 本スキップ。
- 関連の e2e(上の 8 本 + `visual.spec.ts`): 基準写真の更新後に通過。
- `npm run test:fast`: コミットのあと 1 回実行します(結果は `done` に書きます)。

## メモ

- `npm run test:e2e:update-baselines -- <spec>` は、いまの Playwright では `--update-snapshots` の直後を「更新の種類」と読むため失敗します。次のように書きます。
  `node scripts/run-playwright-visual-tests.mjs <spec> --project=chromium-desktop --grep "<名前>" --update-snapshots=changed`
