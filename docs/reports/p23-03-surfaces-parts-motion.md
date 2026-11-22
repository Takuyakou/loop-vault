# P23-03 面の作り・共通の部品・動きの決まり・確認の窓・最初の案内の報告

- ブランチ:`feat/p23-03-surfaces-parts-motion`(master `eaab614a` から。`098e57b7`(P23-02)を含むことを確かめてから作った)
- 作業した日:2026-11-11
- この指示書では FULL を回していない(利用者の決定)。代わりに §11 の確かめを回した(§11)。

## ブランチとコミット

| コミット | 節 |
|---|---|
| `b6b21f8c` p23-03-01: tokens for surfaces and parts | §1 |
| `ac73f150` p23-03-02: surfaces, floating panels and the focus ring | §2 |
| `0452d4d2` p23-03-03: unified shapes for buttons, fields and notices; Switch, Kbd, PlayingMark | §3 |
| `a4236484` p23-03-04: two motion speeds and a fade when the view changes | §4 |
| `9670bd3f` p23-03-05: confirm dialog — main action last, discard in red | §5 |
| `9e9c1d73` p23-03-06: first-capture guide with the three steps | §6 |
| `064a07b6` p23-03-07: leftover words and the toast width | §7 |
| `66483bb5` p23-03-08: gallery and tests for the new parts | §8 |
| `bd456da7` p23-03-08b: the Bass fields take the shared field colours (decided by the user) | 途中で聞いた件(下の「08b の経緯」) |
| `d4a57ef6` p23-03-08c: the axe checks wait for the view fade to finish | §9 の前の全部の回で見つけた件(下の「08c」) |
| `9d44ad92` p23-03-09: refresh the visual baselines | §9 |
| (この報告のコミット) | §11 |

## 08b の経緯(Bass の欄の色とテストの期待)

1. **何が起きたか**:§8 まで作ったあと、基準の写真を更新する前に Playwright を全部回した(`npm run test:e2e`、995 PASS・2 FAIL)。そのうち 1 つが `e2e/phase13-1-bass-ui.spec.ts`「P13.1 §6 visible Bass input/select colors use the shared surface tokens」だった。このテストは「Bass Practice の画面の中の入力の欄・選ぶ欄が、全部、共通の欄の色と同じ」ことを、`var(--lv-bg-subtle)`・`var(--lv-border-strong)` の色と比べて確かめている。
   - §3-2 で共通の欄(`.lv-field-control`・`.lv-select select`)の色を `--lv-well`・`--lv-line` に変えたので、共通の部品を使う Bass の欄は新しい色になった。
   - 一方、Bass 専用の `.bass-input`(`src/features/bass-practice/ui/bassPractice.css:89`〜`90`)は古い `--lv-bg-subtle`・`--lv-border-strong` のままだった。
   - テストの期待を新しい色に直してみたが、今度は `.bass-input` の欄で落ちた(期待 `rgb(12, 20, 30)`、実際 `rgb(13, 21, 34)`)。つまり **Bass の画面の中で 2 種類の色の欄が混ざった**状態で、テストはどちらの色を期待にしても落ちる。
2. **なぜ止まったか**:指示書は「画面ごとの CSS(`bassPractice.css` など)は触らない」と言っている。テストの期待をゆるめる(混ざっていてよいとする)のは、README のテストの決まり C(弱める)に当たる。README の「途中で止まって聞くとき」(C をしないと通らない/別の決まりと矛盾する)に当たるので、試しに直したテストを元に戻してから、利用者に聞いた。
3. **利用者に聞いたこと**:次の 3 つから選んでもらった。
   - 「bass-input も新しい色に(推奨)」:`bassPractice.css:89`・`90` の `.bass-input` の**色だけ**(線・面・乗せたときの線)を共通の欄と同じ `--lv-line`・`--lv-well`・`--lv-accent` にし、テストの期待を新しい共通の色に直す(B)。高さ・角・余白は変えない。報告に指示書の例外として書く。
   - 「テストの期待だけ直して混在を残す」
   - 「ここで止めてレビューに回す」
4. **どう決まったか**:利用者は「**bass-input も新しい色に(推奨)**」を選んだ。そのとおりに直した(`bd456da7`)。
   - `src/features/bass-practice/ui/bassPractice.css:89`:`border:1px solid var(--lv-border-strong)` → `var(--lv-line)`、`background:var(--lv-bg-subtle)` → `var(--lv-well)`(高さ・`border-radius:var(--lv-radius-sm)`・余白・字はそのまま)。
   - 同 `:90`(乗せたとき):`border-color:color-mix(in srgb,var(--lv-accent) 58%,var(--lv-border-strong))` → `var(--lv-accent)`(共通の欄の §3-2 と同じ)。
   - `e2e/phase13-1-bass-ui.spec.ts:169`:比べる色を `var(--lv-well)`・`1px solid var(--lv-line)` に(B。確かめる中身「Bass の欄は全部、共通の欄と同じ色」は同じ)。
   - `npm run test:ui -- e2e/phase13-1-bass-ui.spec.ts`:12/12 PASS。
   - **指示書の例外**:「画面ごとの CSS の箱の枠線は触らない(§7 の 1 か所を除く)」に対し、`bassPractice.css` の `.bass-input` の色を変えた。利用者の決定による。

## 08c(Bass とは別に、§9 の前の回で見つけた件)

- 基準の写真の更新(`npm run test:e2e:update-baselines`、全部の e2e を回す)で、`e2e/accessibility.spec.ts`「HomeとCapture空状態」が落ちた。axe の `color-contrast`(取り込む画面の小さい字。前景 `#6e7d95`・背景 `#0d1421`、比 4.41)。
- 原因の見立て:**M8(画面を切り替えたときの 0.18 秒の薄い所からの表示)**の途中で axe が測っていた。直前の全部の回(同じコードで `npm run test:e2e`)ではこのテストは通っていたので、時間の当たり方で揺れる(推測:中身の透明度が 1 になる前に測ると、字の色が背景に混ざって薄く測られる)。
- 直し(`d4a57ef6`):`e2e/accessibility.spec.ts` の `expectNoSeriousViolations` の頭で、`#main-content` の動き(フェード)が終わるのを待ってから axe を回す(A に近い:確かめる中身・決まりはそのまま。測る時を落ち着いた画面にしただけ)。
  - 最初は「ページ全部の動きの終わりを待つ」形にしたが、終わらない動きがあって 30 秒で切れた(「解析前と解析結果」)。`#main-content` の動きだけを待つ形に直した。
  - `npm run test:ui -- e2e/accessibility.spec.ts`:3/3 PASS。

## 表 M1〜M10

| # | 直したファイル | 確かめたテスト |
|---|---|---|
| M1 主のボタンが右端 | `src/components/ConfirmDialog.tsx` | `src/components/Modal.test.tsx`「puts the second choice before the main action, so the main action is last (P23-03 M1)」/§10 の確かめ 3 |
| M2 保存せずに捨てる側は赤 | `ConfirmDialog.tsx`(`secondaryTone`)・`src/App.tsx`・`src/views/ProgressionWorkspacePage.tsx`・`src/components/shell/CloseDialogHost.tsx` | `Modal.test.tsx`「draws the second choice red only when secondaryTone is danger (P23-03 M2)」/§10 の確かめ 3 |
| M3 進行のページから移る窓の題・説明・「戻る」 | `src/App.tsx`・`src/i18n.ts:543`〜`544` | §10 の確かめ 3(題「変更を保存しますか？」)。この文で探していたテストは無かった |
| M4 「コード譜のテキストを貼り付け」 | `src/components/FirstCaptureGuide.tsx` | `src/components/FirstCaptureGuide.test.tsx`、`src/views/HomeView.test.tsx`・`src/views/VaultView.test.tsx`(B) |
| M5 取り込みの流れ 3 つ | `FirstCaptureGuide.tsx`・`src/styles/settings.css` | `FirstCaptureGuide.test.tsx`「shows the title, the two ways in and the three steps in order」 |
| M6 枠の色を水色 | `src/styles.css` | e2e 全部の回(`e2e/p22-02-vl-picker.spec.ts` は前から `rgb(139, 215, 255)` を期待していて通る)/`focus-ring` の写真 |
| M7 押している間 0.97 倍 | `src/styles/components.css` | 単体の確かめは無い(CSS の値だけ)。e2e 全部の回で落ちなかった |
| M8 0.18 秒で出る | `src/ui/motion.ts`・`src/App.tsx` | `src/ui/motion.test.ts`「fadeInView (P23-03)」3 件/§10 の確かめ 4 |
| M9 「アイデア」→「曲」 | `src/components/correction-workspace/SectionSaveDialog.tsx`・`src/components/SizeRecoveryNotice.tsx`・`src/domain/chordDojo/collect.ts` | `e2e/correction-workspace-save.spec.ts:172`・`src/components/SizeRecoveryNotice.test.tsx:34`(B) |
| M10 お知らせの幅 360px | `src/styles/components.css` | `e2e/p23-02-toast.spec.ts`「the undo toast after deleting a progression stays on one line (P23-03 M10)」 |

## 節ごとに変えたこと(要点)

- §1:`src/styles/tokens.css` に変数 16 個(`--lv-radius-panel` ほか)。今ある変数の値は変えていない。
- §2:`.lv-app-column` に背景の光、`.lv-surface`・`.lv-surface-primary`、`Modal` の枠と影、`.lv-tooltip`・`.lv-popover`、`:focus-visible` の色。
- §3:ボタン 6 種の角、3 種の線の色と乗せたときの色、主のボタン(色・光・太さ・乗せたとき・押せないとき)、消すボタンの線と字、押している間、切り替え・選ぶ欄・入力の欄、注意の帯の角(`lv-status`)、`Switch`・`Kbd`・`PlayingMark` を足した(画面には置いていない。見本の画面だけ)。
- §4:`shell.css` の 5 か所の `120ms` を `var(--lv-motion-fast)` に(待ち時間はそのまま)、`chord-card-result.css` の 1 か所、`fadeInView`。
- §5:確認の窓の並びと色、3 か所の呼ぶ側、`i18n.ts` の 2 行。直さない 9 か所はそのまま。
- §6:最初の案内の作りと CSS。呼ぶ側と props は変えていない。
- §7:「アイデア」5 か所、お知らせの幅。
- §8:見本の画面に「P23-03 の部品」の節(`p89-gallery-p23-03`)と、確認の窓の見本に `secondaryLabel`。

## テストの直し

- A(探し方の直し):`e2e/accessibility.spec.ts`(08c。測る前にフェードの終わりを待つ)。
- B(新しい動きへの置き換え):

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `src/views/HomeView.test.tsx:57`(最初の案内の「テキストから取り込む」を押す) | 「コード譜のテキストを貼り付け」を押す(押したあとはそのまま) | M4 |
| `src/views/VaultView.test.tsx:151`(同じ) | 同じ | M4 |
| `e2e/correction-workspace-save.spec.ts:172`(「新しいアイデア（題名：long-64）」が選ばれている) | 「新しい曲（題名：long-64）」 | M9 |
| `src/components/SizeRecoveryNotice.test.tsx:34`(「アイデア／進行を削除」) | 「曲／進行を削除」 | M9 |
| `e2e/phase13-1-bass-ui.spec.ts:169`(Bass の欄が `--lv-bg-subtle`・`--lv-border-strong` と同じ色) | `--lv-well`・`--lv-line` と同じ色 | §3-2・08b(利用者の決定) |

- 足したテスト:`Modal.test.tsx` 2 件/`FirstCaptureGuide.test.tsx` 2 件/`controls.test.tsx` 3 件(Switch・Kbd・PlayingMark)/`motion.test.ts` 3 件/`e2e/p23-02-toast.spec.ts` 1 件。
- ボタンを順番(何番目)で探していて落ちたテスト:無し。

## §0・§10 の写真

- 前:`p89-generated/p23-03/before/`(1440×900・1280×720:`home`・`home-empty`・`vault`・`vault-empty`・`settings`・`capture`・`gallery`・`confirm-leave-progression`・`confirm-settings-delete`・`toast-undo`。20 枚)。
- 後:`p89-generated/p23-03/after/`(上の 10 種類 + `gallery-p23-03`・`focus-ring`、`home`・`settings`・`home-empty` の 768×640。27 枚)と、確かめの数字(`check-1-overflow.json`・`check-2-button-heights.json`・`check-3-dialog.json`・`check-4-fade.json`・`check-4-fade-reduced.json`)。
- 撮り方:一時的な e2e のファイルを置いて `npm run test:ui` で撮り、撮ったあとに消した。部品の見本の画面は、`VITE_P89_GALLERY=1` を付けてビルドした回で `?gallery` を開いた(設定は変えていない)。
- **撮れなかった物**:`confirm-close-progression`(窓を閉じようとして出る窓)。この窓(`CloseDialogHost`)は、Tauri の窓を閉じる知らせ(`registerTauriCloseGuard`)からだけ出る。ブラウザのテストの画面には窓を閉じる知らせが無く、出せなかった(撮るためにコードは変えていない)。並びと色は、同じ部品・同じ `secondaryTone` を使う進行のページの窓(`confirm-leave-progression`)と単体テストで確かめた。

## §9 基準の写真

- 前:`p89-generated/p23-03/baselines/before/`、後:`…/after/`、差:`…/diff/`(変わった画素をマゼンタで塗った物)。8 枚とも全部更新した(Playwright の決まりでは差が小さい 7 枚は「通る」扱いだったが、指示どおり全部を新しくするため `node scripts/run-playwright-visual-tests.mjs e2e/visual.spec.ts --update-snapshots=all` で撮り直した)。
- **8 枚全部**について、前・後・差を見た。変わった所(画素の数):

| 写真 | 変わった画素 | 変わった所 |
|---|---|---|
| `home` | 19540 | 最初の案内(点線・丸い絵・題・説明・ボタン 2 つ・流れ 3 つが増えて箱が下に伸びた)、上の帯の「ピアノ/エレピ」の切り替えとメトロノームのボタンの角と線 |
| `capture-empty` | 5961 | 箱(`Surface primary`)の線、主のボタン「MIDIを選択」、上の帯の切り替えとメトロノーム |
| `capture-source-selection` | 4717 | 主のボタン(「再生」「解析する ▶」)、ふつうのボタン(「MIDIを追加」「詳しい設定」)、上の帯 |
| `settings` | 655 | 選ぶ欄(入力チャンネル)、上の帯 |
| `capture-analysis-results`・`practice`・`progression-detail-default`・`vault` | 各 393 | 上の帯の切り替えとメトロノームのボタンの角と線だけ |

- どれも指示書の 4 つ(ボタン・選ぶ欄・切り替えの角と線、主のボタンの色と光/`Surface` の線と影/背景の光/最初の案内・確認の窓・お知らせ・注意の帯)に当たる。**字の場所が動く・箱の大きさが変わる・はみ出す変化は無かった**(最初の案内の箱が伸びたのは M5 の「流れ」の行が増えたため)。背景の薄い光は、差の目安(色の差の合計 24)より小さく、差の写真には出なかった。

## §10 の確かめ

| # | 確かめ | 結果 |
|---|---|---|
| 1 | 5 つのサイズで、ホーム・Vault・設定・取り込む・Voicing Loop・Chord Dojo・Bass Practice に横のはみ出しが無い | ○(35 の組み合わせ全部で、文書と `#main-content` の `scrollWidth - clientWidth` が 1 以下。`check-1-overflow.json`) |
| 2 | ボタンの高さが今と同じ | ○(1440×900 で測った高さ:取り込む 36、設定 36・40、Bass 40、Voicing Loop 32・36、ホーム 28・30・38・40(ホームの 28・30・38 はホームの CSS の物で今回触っていない)。前と後の基準の写真の差で、ボタンの縁の場所が 1px も動いていないことを見た) |
| 3 | 確認の窓:主のボタンが右端。Esc・外側で閉じる。開いたときのカーソルは「戻る」 | ○(進行のページから移る窓:並び「戻る(`ghost`)・保存せずに移る(`danger`)・保存して移る(`primary`)」、カーソル「戻る」、Esc で閉じる、外側で閉じる。`check-3-dialog.json`) |
| 4 | 画面を切り替えると 0.18 秒で出る。動きを減らす設定では動かない | ○(`#main-content` の動きの長さ 180。`reducedMotion: "reduce"` では `animate` が 1 回も呼ばれない。`check-4-fade*.json`) |
| 5 | お知らせの文が 1 行 | ○(1440×900・1280×720 で「保存したコード進行を削除しました」+「元に戻す」が 1 行。`e2e/p23-02-toast.spec.ts` の足したテスト、`toast-undo` の写真) |
| 6 | 背景の薄い光が、字の読みやすさをじゃましていない | ○(`home-1440x900`・`settings-1440x900` を見た。光は右上と左下の端だけで、どの字の後ろでもごく薄い。axe の字の濃さの確かめもホーム・取り込む・設定などで通っている) |

## §11 最後の確かめ

| 順 | 何を | いつ・コミット | 結果 |
|---|---|---|---|
| 1 | `npm run lint` | 2026-11-11、`9d44ad92` | PASS |
| 2 | `npm run build` | 同 | PASS(型の確かめを含む) |
| 3 | `npm test`(Vitest 全部) | 同 | **6401 PASS・6 FAIL・2 skip**(下) |
| 4・5 | `npm run test:ui -- <この指示書で変えたファイル全部>` | 同 | **PASS — 997/999**(2 は前からの条件つき skip)、615.7 秒。変えたファイルに共通の物があるため、`scripts/test-dx/run.mjs` が「shared or unknown source owner」として e2e を全部選んだ(5 の名前を挙げた 7 本もこの中に入っている。heavy の組も入っていた) |

- 4 は、最初に前の方で(10 分で切れる形で)回して時間切れ(終了コード 124、結果の行が出る前)になったので、何も変えずに後ろで同じものを回し直した(結果は上の表)。時間切れは結果が出なかっただけで、落ちたテストは無い。
- 3 の 6 件は、どれも「Test timed out in 5000ms」(重い計算のテストが 5 秒で切れた):`scripts/p7/modularTournament.test.ts:11`・`scripts/p7/sealedFinal.test.ts:5`・`scripts/p539/shadowCandidateRanking.test.ts:180`・`src/domain/earPractice/earPractice.test.ts:240`・`src/domain/earPractice/spellingChange.test.ts:53`・`src/domain/master251/fixedProfileUi.test.tsx:35`。
  - 関係がないと考える理由:この指示書はこれらのテストが見るコード(解析の評価・耳で弾くの問題の作り・Master の運指の表)を変えていない(Master の画面は共通のボタンの CSS だけが変わる)。どれも答えの違いではなく時間切れ。同じ Vitest 全部は、このブランチの途中の確かめ(`npm run test:fast`、`66483bb5` の時点)では 6407 PASS で、この 6 件も通っていた。§11 の決まりにより、回し直していない。
- §9 の前に回した Playwright の全部の回(参考):
  - `npm run test:e2e`(`66483bb5`):995 PASS・2 FAIL(`e2e/phase13-1-bass-ui.spec.ts` §6 → 08b、`e2e/visual.spec.ts` Home → §9)。
  - `npm run test:e2e:update-baselines`(`bd456da7`):995 PASS・2 FAIL(`e2e/accessibility.spec.ts`「HomeとCapture空状態」→ 08c、`e2e/dojo-display-judge.spec.ts:235`「MIDI reconnect during tempo clears the old input Target and a new round accepts all answers」)。
    - `dojo-display-judge.spec.ts:92` の `toContainText('14/14 合いました')` が「13/14 合いました」だった。heavy の組のテストで、ふだんの FULL ではワーカー 2 で別に回す物を、このときは全部まとめて回していた。MIDI のテンポの時間に合わせるテストで、この指示書は Chord Dojo の判定・時間に触れていない(同じコードの直前の回 `npm run test:e2e` では通っていた)。関係がないと考え、回し直していない。

## `git grep -n "アイデア" -- src e2e`

- **0 件**(終了コード 1)。

## 指示書どおりにできなかった所

1. **確認の窓の印の大きさ**(§5-1):指示書は `size={18}`。このリポジトリの決まり(`scripts/lint-source-contracts.mjs:45`。Lucide のアイコンは 16px か 20px だけ)に合わず `npm run test:fast` の Source contracts が落ちたので、**16** にした(題の字 17px に近いほう)。決まりのスクリプトは変えていない。
2. **`bassPractice.css` を触った**(08b):利用者の決定による。
3. **`confirm-close-progression` の写真**:ブラウザでは出せない(§10 の「撮れなかった物」)。
4. **見本の画面の写真**:ふだんのテストのビルドには部品の見本の画面が入らないため、写真を撮る回だけ `VITE_P89_GALLERY=1` を付けた。

## 気づいたこと(直していない)

- 消すボタン(`.lv-button-danger`)の乗せたとき(`:hover`)は今のまま `color: #fff`・`background: var(--lv-danger-soft)` で、ふだんの字の色(`#ffb3ba`)から白に変わる。
- 確認の窓の「取り消し」が `ghost`(塗りなし)になり、窓の中では文字だけに見える(`confirm-leave-progression`・`confirm-settings-delete` の写真)。指示どおり。
- `@layer base` の `button, input, select, textarea { border-radius: var(--lv-radius-sm); }` は指示どおりそのままなので、共通の部品を使わない欄やボタンは 8px の角のまま(例:Bass の `.bass-input` は色だけ新しく、角は 8px)。
- ホームの「続きから」の小さいコードの札にキーボードで移ると、水色の枠が札の外に出る(`focus-ring` の写真)。読める範囲。
- 画面を切り替えたときのフェードの間に axe などで字の濃さを測ると薄く測られる(08c)。ほかにも、切り替えた直後の色や透明度を測るテストを足すときは、フェードの終わりを待つ必要がある。
