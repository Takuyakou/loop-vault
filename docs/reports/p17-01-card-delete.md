# P17-01: コードカードを消す操作(報告)

対象: master `444db40d` から `feat/p17-card-delete`。**マージ・push はしていない。**
対象画面: `CorrectionWorkspace` を使う 2 つ(MIDI の取り込みの修正画面 / 進行ページ)。ほかに使う画面は無い。

---

## 1. 変えたもの

### ドメイン

- `src/domain/correction/cardEdits.ts`
  - `deleteCard(model, cardId, mode)` を追加(`extend-previous` / `extend-next`)。
  - 残るカードが、消したカードの時間(`start`・`duration`・`bar`・`beat`)を引き継ぐ。
  - 消した範囲の元の音(`SOURCE`)は残るカードの音になり、すべて `used: false`。高さを直した音は直した高さのまま `used: false`。
  - 境目をまたぐ 1 つの元の音は、残る側は今の状態のまま、消した側だけ `used` を false にして断片に分ける(`recut` と同じ)。断片ごとの高さ(`pitch`・`originalPitch`)は上書きしない。
  - 消したカードに足した音(`MANUAL_ADDED`)は消える。残るカードの足した音は残る。
  - 残るカードの名前は変えない(`auto`/`chosen`/`typed` のどれでも)。読みが変わる場合は `suggest` で知らせるだけ。
  - 連打の数(`attacks`)は残るカードのまま。先頭で「前を伸ばす」→次、最後で「次を伸ばす」→前。1 枚だけは消さない(「最後の1枚は消せません」)。
  - 履歴は 1 つ。文「2.1 のカードを消した」、知らせ「…のカードを消しました(音は使っていない音として残しています。Ctrl+Z で戻せます)」。
- `src/domain/correction/cardEdits.test.ts`
  - §1.1 の断片の決まりを確かめるテスト用ヘルパー `assertFragments`(重なり・すき間・id の一意・`sourceNoteId` と `originalPitch` を失わない)と、P17-01 の単体テスト 13 件。

### UI(2 画面で同じ)

- `src/components/correction-workspace/CorrectionWorkspace.tsx`
  - `Delete`: 音を選んでいなければカードを消す(取り込みは `deleteCard`、進行ページは従来の 4 モードの前伸ばし)。音を選んでいれば今どおり音を外す/消す。`Backspace` は音だけ。
  - カードをクリック・右クリックしたら音の選択を外す(ピアノロールの音の選び方は不変)。
  - 右クリック / `Shift+F10`・メニューキーでカードメニュー(`role="menu"` / `role="menuitem"`)。`↑↓`・`Enter`・`Esc`、画面の端で切れない、外側クリック・スクロール・再生の開始で閉じる。`Esc` はメニューだけ閉じ、範囲の始まりは残す。閉じるとフォーカスはカードへ戻る。
  - 保存する範囲: メニューの「ここから保存する範囲を選ぶ」で開始。開始が決まっている間は、別のカードの右クリックで範囲が決まり(メニューは出さない)、開始のカード自身の右クリックでメニュー(「範囲の選択をやめる」「この小節を保存する範囲にする」)。`Shift`+右クリックはその小節だけ(メニューなし)。`Shift+F10` はメニューを開く。
  - 消した後、残ったカードを選ぶ。
- `src/components/correction-workspace/CorrectionInspector.tsx`
  - **「カードを消す ▾」を「選んだカード」の名前の行の右へ**(案3)。色(`--lv-danger` の文字と枠)・小さな説明・`Del` の印はそのまま。カードの操作の欄からは外した。
  - カードの操作のボタンは**横に並べて折り返す**(1 列にしない)。
  - 取り込みにも 2 モードを表示。進行ページは 4 モード。
- `src/components/correction-workspace/CardContextMenu.tsx`(新規): メニュー本体。
- `src/styles/correction-workspace.css`: メニュー、危険色、名前の行のレイアウト。
- 下のショートカット欄と `?` の一覧を更新(「`Delete` カードを消す」「カードの右クリック:メニュー(消す・つなぐ・保存する範囲)」「音を選んでいれば外す/消す。音を選んでいなければカードを消す」)。

### 変えていないもの

解析・保存の形式(schema)・記録、「つなぐ」「分ける」「境目を動かす」「Shift+M」の動き、進行ページの消す 4 つの結果、ほかの画面(Voicing Loop・Chord Dojo など)、`chords.ts` の読み取り、判定器。

---

## 2. テスト

| 種別 | 結果 |
|---|---|
| 単体 `src/domain/correction` | **101/101 PASS**(P17-01 の追加 13 件を含む) |
| 関連単体(CaptureView / progressionWorkspace / correction-workspace) | **64/64 PASS** |
| e2e 新規 `e2e/card-delete.spec.ts` | **10/10 PASS** |
| e2e 既存(取り込み・保存・進行ページ)| **60/60 PASS** |
| 画面写真 `e2e/p17-01-screens.spec.ts` | PASS(6 枚) |
| 型 / Lint | PASS |
| `npm run test:full` | **FAIL — Playwright 1 件**。Vitest **6233/6235 PASS**(2 skip は既存)、他の全ゲート PASS。失敗は `e2e/p16-ear-practice.spec.ts:205` の `browserContext.newPage` 30 秒タイムアウト(P17-01 と無関係)。単独実行は**ブランチ 15/15・master `444db40d` 15/15 PASS**。ログ `.local-evaluation/test-logs/2026-10-25T06-24-04-709Z-playwright-full.log` |

### 追加した単体テスト(§5 の抜け)

- §5-13 断片ごとの高さ: 2 枚にまたがる 1 つの元の音の後ろの断片だけ高さを直し、(a) 後ろを消す (b) 前を消す (c) つなぐ (d) つないだものを分ける、のそれぞれで、**時間で**確かめる。前のカードの範囲(front.start〜back.start)にある断片は前の断片の `pitch`・`originalPitch`、後ろのカードの範囲(back.start〜back.start+back.duration)にある断片は後ろの断片の `pitch`・`originalPitch` と同じであること。
- §5-9 保存: 消した後に `buildSaveCandidate` で保存すると、消したカードが無く、残るカードの保存される音・ボイシングに `used:false` が入らない。
- §5-10 鳴る音: 消した後、`cardAuditionNotes`(B)と `songPlaybackNotes`(曲)に `used:false` が入らない。
- §5-11 続けて編集: 境目をまたぐ音と、そのカードだけの音を持つカードを作り、消す → 分ける → つなぐ → 境目を動かす → 元に戻す 4 回 → やり直す 4 回 → 保存。各時点で、消した範囲の断片が `used:false` のままであることを確かめる。
- §5-12 境目をまたぐ 3 種類: 前から伸びた音・次へ伸びる音・両方へ伸びる音を用意し、「前を伸ばす」「次を伸ばす」の両方で、残る側の `used` は変わらず、消した側だけ `used:false` になることを確かめる。
- `assertFragments` に「`sourceNoteId` を失わない」「`originalPitch` は元の高さのまま」を追加。

### 追加した e2e

- 音を選んだままカード B を右クリック → メニューの「カードを消す」で B が消え、選んでいたカード A の音(使っている音)は変わらない。
- 進行ページ: メニューからの消す 4 つそれぞれが、右の欄の「カードを消す ▾」と同じ結果になる(カードの並びを比べる)。

### 直した e2e(手順だけ。期待は変えない)

右クリック→右クリックで範囲を決めていた箇所を、右クリック→メニューの「ここから保存する範囲を選ぶ」→右クリック に変更した。

- `e2e/correction-workspace.spec.ts`: 「right-click a card, then another…」「addendum 1: the decided save range stays framed…」「P10.3 a decided range is a chip…」の 3 テスト(計 4 か所)
- `e2e/correction-workspace-save.spec.ts`: 「a range: the range save…」の 1 か所
- `e2e/progression-workspace.spec.ts`: 3 か所

**1 つだけ期待を変えた**: `Shift+F10` は §3.2 のとおり「範囲の始まり」ではなく「メニューを開く」になったため、その e2e は `data-range-from` ではなくメニューの表示/非表示を確かめる形にした。

---

## 3. 画面写真(`docs/reports/p17-01/`)

- 取り込み: 右クリックのメニュー — `capture-menu-1440x900.png`
- 取り込み: 消した直後(前のカードが 8 拍に伸び、消した範囲の音が破線) — `capture-after-delete-1440x900.png`
- 取り込み: 右の欄 1280×720(要確認の欄が出ているカード。名前の行の右に「カードを消す ▾」) — `capture-panel-1280x720.png`
- 取り込み: 右の欄 1660×1035(操作ボタンは横に並べて折り返し) — `capture-panel-1660x1035.png`
- 進行ページ: 右クリックのメニュー — `progression-menu-1280x720.png`
- 進行ページ: 右の欄 1280×720 — `progression-panel-1280x720.png`

---

## 4. 1280×720 の件(解決)

前回の未達(スクロールしないと「カードを消す」が見えない)は、**案3**(名前の行の右へ移動)で解決した。

- 1280×720 と 1440×900 で、「要確認」の欄が出ているカードを選んでも、**スクロールせずに「カードを消す ▾」が見える**。
- e2e は `scrollIntoViewIfNeeded` を使わず、`toBeInViewport({ratio:1})` で確かめている。
- 写真: `capture-panel-1280x720.png` / `capture-panel-1660x1035.png`。

---

## 5. FULL の Playwright 失敗(フレーク)

- 失敗: `e2e/p16-ear-practice.spec.ts:205` の「P16-02: MIDI が無いときは…」。`browserContext.newPage: Test timeout of 30000ms exceeded`(アプリの assertion ではなく、ブラウザのコンテキスト作成のタイムアウト)。
- 単独実行(ブランチ): **15/15 PASS**。
- 単独実行(master `444db40d`、master の worktree): **15/15 PASS**。
- P16 の耳の練習は P17-01 の変更ファイル(`correction-workspace` / `cardEdits` / `styles` / e2e)を使わない。フルスイートの負荷によるフレークと判断する。指示どおり、テストの緩和・skip・retry はしていない。

---

## 6. 停止

ここで止まる。実機で、取り込みのカード削除(音が破線で残る・Ctrl+Z)、進行ページの 4 モード、右クリックメニューを確かめてください。
