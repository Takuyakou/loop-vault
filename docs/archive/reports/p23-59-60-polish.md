# P23-59・P23-60 レポート (2026-11-20)

`feat/p23-59-60-polish`(local master `19f7b104` から)。**master には入れていない**(リードが写真を見本と並べて見てから入れる)。push していない。

- **P23-59**: `9fb8127a`
- **P23-60**: `cc90a53d`

---

## P23-59 知らせ・メモ・Vault の入口

### 1 節:知らせ(トースト)と「解析中」の札

- 実装:`src/styles/components.css` の一番外側に、指示の 2 組の CSS。`src/views/CaptureView.tsx` の解析中の札の `className` の先頭 `fixed bottom-6 right-6 z-50` を `lv-analysis-progress z-50` に。
- **指示の CSS からの 1 点だけ変えた所(下の「自分で決めた所」も参照)**:横の真ん中の基準を「`main` の真ん中」ではなく「**中身の欄(エディタ列 `.lv-cw-body`)の真ん中**」にした。指示の CSS のまま(`main` の真ん中)だと、**1440×900 で知らせ(幅 360px)の右端が保存の欄の左端に 26px 入り、「別の版として保存」に重なる**(下の表)。指示の確かめの文が「`main` か今の中身の枠」と書いているので、中身の枠を採った。エディタ列の幅は中身で決まり CSS では計算できないため、`--lv-content-center` を測って置く小さな仕組み(`src/components/notifications/contentCenter.ts`、`NotificationProvider` から開始)を足した。値が無い時は CSS が `main` の真ん中に戻る。DOM の変化のたびに測り直すが、**値が変わった時だけ**根の style を書く(毎フレーム書くと、Chord Dojo のような細かく描き替える画面でレイアウトの無駄な再計算が続き、`p18-01-stage2` の 2 件が競合で落ちたため。直した後に 10 回続けて PASS)。
- 値(知らせの箱の横の真ん中と、中身の欄の真ん中):

| 窓 | 中身の欄の真ん中 | 知らせの真ん中 | ずれ | 保存のボタンとの交わり |
|---|---|---|---|---|
| `1280×720` | 605.5 | 606 | **0.5px** | **0**(「上書き保存」x 971–1239 /「別の版として保存」x 971–1197 に対し、知らせ x 427–785) |
| `1440×900` | 615 | 615 | **0px** | **0**(保存の欄 x 990–1298 に対し、知らせ x 437–791) |

- 札(解析中)の値(1280×720):真ん中のずれ **0.5px**、下からの位置 **76px**(保存の欄がある画面なので指示の 76px)、名前の入力欄・保存のボタン・上の操作の行との交わり **0**、札が出ている間の知らせの積みの下端は札の上端より上(**224px** ≥ 札の高さ 108 + 76)。
- Vault の一覧(保存の欄が無い画面)の知らせ:右端 **16px**・下 **16px**(今のまま)、真ん中は中身の欄の真ん中から 328px ずれている(=右下のまま)。
- 写真:
  - ![s1-toast-1280](p23-59-assets/s1-toast-1280.png)
  - ![s1-analysis-1280](p23-59-assets/s1-analysis-1280.png)
  - ![s1-capture-result-1440](p23-59-assets/s1-capture-result-1440.png)
  - ![s1-vault-toast-1280](p23-59-assets/s1-vault-toast-1280.png)

### 2 節:空のメモを「＋ メモ」に畳む

- 実装:`src/views/ProgressionWorkspacePage.tsx` に `memoOpen` を足し、空(`memo.free` も `memo.codes` も無い)ときは「＋ メモ」(`data-testid="progression-memo-add"`)を出す。押すと今の入力欄が同じ場所に開き `autoFocus`。空のまま `blur` すると「＋ メモ」に戻る。
- 既存のテストの書き方の直し(確かめる中身は変えていない):`e2e/p23-15-progression-header.spec.ts`・`e2e/p23-30-states-dialogs.spec.ts`・`e2e/progression-workspace.spec.ts` の、空のメモの欄に `getByLabel("メモ")` で書いている 3 か所に「あれば `progression-memo-add` を押す」1 行を足した。
- ピアノロールの高さ(1280×720、メモが空・タグ 6 個、`.lv-cw-roll` の見えている高さ):

| | 値 |
|---|---|
| P23-58 の時(報告の値) | **163px**(cards 76px, gap 8px, legend 17px) |
| P23-59 の後 | **197px**(+34px、2 段目に収まり 3 段目が無くなる) |

- 主な流れ:空の進行 →「＋ メモ」がある・入力欄が無い → 押すと入力欄が出て**フォーカスが入る** → Tab で外すと「＋ メモ」に戻る → 書いて保存 → 開き直すと入力欄が出ている。

### 3 節:Vault の右の欄の練習の入口

- **まず測った**:1280×720・タグ 6 個の進行(I–V–vi–IV、120 BPM)を選んだ時の右の欄(`.lv-vault-preview-body`)の `scrollHeight - clientHeight` は **67px**(383 / 316)→ はみ出していたので、指示どおり窓の高さ 800px 以下だけ 1 段 3 列にした。
- 実装:`src/views/VaultView.tsx` の 3 つのボタンを「練習で使う」の見出しと横 3 列の入れ物で囲み、動詞(`で弾く` など)を `span.lv-vault-go-verb` に。`src/styles/vault.css` に指示の CSS。
- 値:

| 窓 | 3 つのボタン | 右の欄のはみ出し |
|---|---|---|
| `1280×720`(前) | 40px・40px・42px の縦 3 段(上端 550/598/646、幅 268) | **67px** |
| `1280×720`(後) | **52px が 3 つ、同じ上端 636・横 85px ずつ並ぶ** | **0px**(383 / 383) |
| `1440×900`(前) | 40px が 3 つ縦(上端 617/665/713、左 1092、幅 308) | 0px |
| `1440×900`(後) | **同じ**(上端 617/665/713、左 1092、幅 308、高さ 40px) | 0px |

- 読み上げの名前は両方の大きさで `getByRole("button", { name: /Voicing Loop で弾く/ })` で見つかる(動詞は見た目だけ隠す)。B3 の `vault-go-bass` と Voicing Loop・Chord Dojo へ進む今のテストもそのまま通った。
- 基準の写真:`vault-chromium-desktop-win32.png` だけが **6189 画素(1%)** 変わり、差は右の欄の練習の入口(と、その分だけ下がった「MIDI を DAW へドラッグ」「開いて編集/コードをコピー」)だけ。追記の 16:35 が認めた 1 枚なので更新した。`progression-detail-default-chromium-desktop-win32.png` は**差が出なかった**(この基準の進行にはメモが入っているため)。
  - 前: ![vault-before](p23-59-assets/vault-before.png)
  - 後: ![vault-after](p23-59-assets/vault-after.png)
  - 差: ![vault-diff](p23-59-assets/vault-diff.png)
- 写真:
  - ![s3-vault-1280](p23-59-assets/s3-vault-1280.png)
  - ![s3-vault-1440](p23-59-assets/s3-vault-1440.png)

### P23-59 のテスト

- 新規 `e2e/p23-59-polish.spec.ts`(5 テスト)。
- 回した組(すべて PASS、`--workers=2`、56 件):`p23-59-polish`・`visual`・`p23-15-progression-header`・`p23-30-states-dialogs`・`progression-workspace`・`p23-10-vault-list`・`p23-58-motion`・`p23-02-toast`・`p23-16-correction-workspace`・`p23-48-dojo-audio-and-vl-color`。

---

## P23-60 Chord Dojo の練習の画面を、ガイド練習の作りに揃える

- リードの差分 `P23-60.patch` は **`--3way` でぶつからずに当たった**(`ChordDojoView.tsx` の import 1 行、`VoicingDrillPracticeView.tsx` の `kind=""`、新規 `practiceTone.css` 296 行)。手で合わせた所は無い。
- **基準の写真は 1 枚も変わらなかった**(`visual.spec.ts` の 6 テスト PASS。Chord Dojo の `practice.png` も差なし)。
- 写真(見本と同じ窓の大きさ。左が見本 `handoff/mocks/p23-60/after-*`、右が実際):

**1440×900**

| 画面 | 見本(左) | 実際(右) |
|---|---|---|
| 定番の一覧 | ![](p23-60-assets/mock/after-standard-list-1440.png) | ![](p23-60-assets/after-standard-list-1440.png) |
| 定番の練習 | ![](p23-60-assets/mock/after-standard-play-1440.png) | ![](p23-60-assets/after-standard-play-1440.png) |
| 合った時(緑の光) | ![](p23-60-assets/mock/after-standard-right-1440.png) | ![](p23-60-assets/after-standard-right-1440.png) |
| 違った時(赤の光) | ![](p23-60-assets/mock/after-standard-wrong-1440.png) | ![](p23-60-assets/after-standard-wrong-1440.png) |
| ドリルの一覧 | ![](p23-60-assets/mock/after-drill-list-1440.png) | ![](p23-60-assets/after-drill-list-1440.png) |
| ドリルの練習 | ![](p23-60-assets/mock/after-drill-play-1440.png) | ![](p23-60-assets/after-drill-play-1440.png) |
| Jazz の練習 | ![](p23-60-assets/mock/after-jazz-play-1440.png) | ![](p23-60-assets/after-jazz-play-1440.png) |
| 2-5-1 Master | ![](p23-60-assets/mock/after-master-1440.png) | ![](p23-60-assets/after-master-1440.png) |

**1280×720**

| 画面 | 見本(左) | 実際(右) |
|---|---|---|
| 定番の一覧 | ![](p23-60-assets/mock/after-standard-list-1280.png) | ![](p23-60-assets/after-standard-list-1280.png) |
| 定番の練習 | ![](p23-60-assets/mock/after-standard-play-1280.png) | ![](p23-60-assets/after-standard-play-1280.png) |
| 合った時(緑の光) | ![](p23-60-assets/mock/after-standard-right-1280.png) | ![](p23-60-assets/after-standard-right-1280.png) |
| 違った時(赤の光) | ![](p23-60-assets/mock/after-standard-wrong-1280.png) | ![](p23-60-assets/after-standard-wrong-1280.png) |
| ドリルの一覧 | ![](p23-60-assets/mock/after-drill-list-1280.png) | ![](p23-60-assets/after-drill-list-1280.png) |
| ドリルの練習 | ![](p23-60-assets/mock/after-drill-play-1280.png) | ![](p23-60-assets/after-drill-play-1280.png) |
| Jazz の練習 | ![](p23-60-assets/mock/after-jazz-play-1280.png) | ![](p23-60-assets/after-jazz-play-1280.png) |
| 2-5-1 Master | ![](p23-60-assets/mock/after-master-1280.png) | ![](p23-60-assets/after-master-1280.png) |

- 見本と違う所(**データ・字の中身の違いを除く**):見本は ii–V–I(Dm7・G7・Cmaj7)・「1週目・1/3」、実際は I–V–vi–IV(C・G・Am7・Fmaj7)・「1週目・1/4」。ほかに、見本では押している鍵盤が水色、実際は離した後なので水色が無い(どちらもデータ・操作の違い)。**色・線・字の大きさ・ボタンの形・帯の高さの違いは見当たらなかった。**
- 見本に寄せるための直しはしていない。

### P23-60 で替えたテストの値・直した所

| テスト / ファイル | 何を | 前 | 後 | 理由 |
|---|---|---|---|---|
| `e2e/p23-24-master-top.spec.ts:55` | 練習の切り替え(3 つのラジオ)の枠の高さ | **28px** | **32px** | 指示 0 節の 2「高さ 32px の枠の中に…」の値。位置・帯の高さのテスト(`42px`)はそのまま通った |
| `e2e/p12-1-dojo-ui.spec.ts:97` | 2-5-1 Master の大きいコード名の字の大きさ(1280×720・1366×768) | **40px** | **32px** | 指示 0 節の 7b「窓の高さ 800px 以下は 40 → 32px」。行の高さ(60px)と札・鍵盤の位置の確かめはそのまま通った |
| `src/views/chord-dojo/practiceTone.css`(差分の 1 行) | 札の `small` の決まりを `small:not(.master251-completed)` に絞った | 差分のまま(`small` すべて) | ✓ の印だけ除く | 差分のままだと、弾き終えた札の ✓ の印まで機能の色(SD 黄・D 赤・T 青)と 11px になり、`p12-2-master.spec.ts` の 4 件(✓ は緑 `#5fd39a`・14px)が落ちた。指示 7 が色を付けると言っているのは**度数**で、✓ の印は指示 10・11 の「合ったら緑」のままにした |

### P23-60 のテスト

- 新規 `e2e/p23-60-dojo-tone.spec.ts`(2 テスト、1440×900 と 1280×720 の写真)。
- 回した組(`--workers=2`、315 件):`p22-*`(7)・`p12-5-original`・`p23-24-master-top`・`p19-voicing-drill`・`jazz-progressions`・`p18-02-jazz-recall`・`txt-jazz`・`p12-chord-dojo`・`p12-master251*`(6)・`visual`。
  - 1 回目は 3 件落ちた。うち 2 件(`jazz-progressions` の「thing of it is cut 001/009」と `p12-chord-dojo` の「automatic … correct retry keeps same key」)は**変えていないテスト**で、単独で **3 回続けて PASS**(3/3)。原因は待ち方の競合(--workers=2)と見て、報告に残して続けた。
  - 残り 1 件は上の `p23-24-master-top` の高さの期待値(28 → 32)で、直した後に **7/7 PASS**。
- `p12-1-dojo-ui`・`p12-2-master` は、上の 2 つの直しの後に **72/72 PASS**(`--workers=2`)。

---

## `npm run test:full:all`(3 回。落ちた所を直して回し直した)

| 回 | HEAD | 結果 | 落ちた物 |
|---|---|---|---|
| 1 | `cc90a53d` | **FAIL** | 6 件: `p12-1-dojo-ui` 2 件(コード名 40 → 32px)・`p12-2-master` 4 件(札の ✓ が機能の色になっていた) |
| 2 | `39cf87ea`(上の 2 つを直した後) | **FAIL** | 2 件: `p18-01-stage2` の `dojo-again-recall` 待ち(変えていないテスト) |
| 3 | `d769fcee`(`--lv-content-center` の書き込みを値が変わった時だけにした後) | **FAIL** | 2 件: `p18-01-stage2`(同上)と `p23-23b-ear-result` の 1440×900 の 8 小節(`overflow 336`。変えていないテスト) |

- 3 回目の 2 件は、どちらも**この段で変えていないテスト**で、**単独で 3 回続けて PASS**(3/3。`p23-23b-ear-result` の 8 小節は 3 回とも `1440×900 = 0 / 1366×768 = 0`)。連続の紙の「その段で変えていないテストの 1〜2 件だけが落ち、そのテストを単独で 3 回回して 3 回とも通る時は、報告に書いて続けてよい」に当たるので、**FULL は通ったものとして扱った**(やり直しはしない)。
- 1・2 回目の落ちは、すべてこの段の差分(見た目の値)と、その差分が原因の競合。直した内容は上の表のとおり。静的検査 10 種・Vitest `7108/7110` は 3 回とも PASS。
- `p18-01-stage2` の 3 つのテストは、`--workers=2` の FULL で **10 回に 1 回くらい**落ちる(単独では通る。速い入力の競合と見られる)。この段の前の FULL(07:07・07:52・09:38)では落ちていない。ワーカーが判断する所(待ち方の直し)には手を出さず、ここに記録する。ログは `.local-evaluation/test-logs/2026-11-20T10-26-00-669Z-playwright-full-all-light-.log`。

---

## 自分で決めた所

| 何を | なぜ | 確かめ方 |
|---|---|---|
| 知らせと札の横の基準を `main` の真ん中から「中身の欄(エディタ列)の真ん中」へ変えた(`--lv-content-center` を測る小さな仕組みを追加) | 指示の CSS のまま(`main` の真ん中)だと 1440×900 で知らせの右端が保存の欄に 26px 入り、「別の版として保存」に重なる。指示の確かめの文が「`main` か今の中身の枠」と書いているので中身の枠を採った | `e2e/p23-59-polish.spec.ts` の交わり 0・真ん中のずれ ≤2px(両方の窓で PASS)。値は上の表 |
| Vault の「練習で使う」の見出しの `line-height` を 1 にした | 見出し(11px)は指示の値だが行の高さは書かれていない。既定のままだと 1280×720 で右の欄が **6px** はみ出した(52px のボタン・見出し・間 6px で 61px 節約したが 61 < 67) | 1280×720 で `scrollHeight - clientHeight = 0`(383/383)。1440×900 は 1px も動いていない(上の表) |
| `e2e/p23-24-master-top.spec.ts` の切り替えの高さを 28 → 32px にした | 指示 0 節の 2 の見た目の値。指示 2 節が見た目の値の期待を合わせてよいと書いている | そのテスト 7/7 PASS(帯の 42px の確かめも含む) |
| 差分の `small` の決まりに `:not(.master251-completed)` を足した | そのままだと弾き終えた札の ✓ まで機能の色(赤・黄)と 11px になり、正しく弾けた印が「違った」の色に見える。指示 7 が色を付けるのは度数で、✓ は指示 10・11 の緑のまま | `e2e/p12-2-master.spec.ts` 4 件と `p12-1-dojo-ui` が PASS(72/72) |
| 最初の `test:full:all` は 6 件落ちたので、上の 2 つを直してから回し直した | 6 件はすべて P23-60 の差分による見た目の値(✓ の色・字の大きさ 40 → 32)。どちらも上の表のとおり | 2 回目の `test:full:all` の結果は下 |
| 解析中の札の「下から 76px」をそのまま採った(保存の欄がある画面) | 指示の値のとおり。1280×720 ではショートカットの帯の上に出る | `e2e/p23-59-polish.spec.ts`(下 76px・重なり 0) |
