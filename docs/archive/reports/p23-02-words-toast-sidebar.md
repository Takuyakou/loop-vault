# P23-02「Idea」を「曲」に・お知らせの形・左メニューの形の報告

- ブランチ:`feat/p23-02-words-toast-sidebar`(master `0abfd0d7` から)
- 作業した日:2026-11-11
- **結果:FULL は 1 回目で落ちた**(heavy の `e2e/phase13-1-bass-ui.spec.ts` の 2 件。前から負荷で揺れると記録されているテストで、この変更とは関係がないと考える。README の決まりにより回し直さず、ここで止める。§9)

## ブランチとコミット

| コミット | 節 |
|---|---|
| `7c655273` p23-02-01: the screens say 曲 instead of Idea | §1 |
| `eaa0ad12` p23-02-02: the toast is smaller, its bar grows, and a favourite stays quiet | §2 |
| `f4d0cf5d` p23-02-03: the sidebar gets practice marks, an accent bar, 集める and the Vault count | §3 |
| `2cbfad6e` p23-02-04: refresh the visual baselines | §4 |
| (この報告のコミット) | §6 |

## 写真の場所

- 前:`p89-generated/p23-02/before/`、後:`p89-generated/p23-02/after/`(どちらも同じ名前で 37 枚)。
- 撮った画面:`home`・`vault-orphans`・`save-menu`・`live-import`・`toast-success`・`toast-error`・`toast-undo` を 5 サイズ(1280×720・1366×768・1440×900・1920×1080・768×640)、`sidebar-collapsed` を 1440×900・1280×720。
- 撮り方:P23-00・P23-01 と同じ(一時的な e2e のファイルを置いて `npm run test:ui` で撮り、撮ったあとに消した。テスト用のデータだけ)。
  - `vault-orphans`:進行を 2 つ保存し、1 つを進行のページから消して、進行のない曲を作った。
  - `toast-success`:Vault で進行をコピーした直後(クリップボードの許可を与えた)。
  - `toast-error`:取り込む画面に MIDI でないファイル(`not-midi.txt`)を落とした直後(「MIDIファイル（.mid / .midi）をドロップしてください。」)。
  - `toast-undo`:進行のページの「この進行を削除…」の直後。
  - `live-import`:`?p12=midi` の合成入力でコードを 4 つ弾き、「メイン画面を表示」で出る窓。保存先を「新しい…」にした所。
- 撮れなかった画面:無し。

## 1. §1 で変えた行

- `src/i18n.ts`:表の 21 行を、表のとおりに変えた(`76`・`126`・`161`・`164`・`165`・`166`・`218`・`226`・`235`・`236`・`248`・`275`・`277`・`278`・`285`・`362`・`363`・`432`・`448`・`536`・`556`)。行番号は表と同じだった。`453` の `status.idea: "Idea"` は変えていない。英語の文は、このファイルに無かった。
  - 変えたあと `git grep -n "Idea" -- src/i18n.ts` に残るのは、キーの名前(`newIdea`・`newIdeaTitle`・`openIdea`・`createIdea`・`appendIdea`・`chooseIdea`・`chooseIdeaFirst`・`openParentIdea`・`parentIdea`)と `453` の行だけ。
- `.tsx`・`.ts`:`src/views/VaultView.tsx:261`・`264`・`271`、`src/store/vaultStore.ts:551` を表のとおりに。
- 表に無かったが直した「Idea」:**無し**。`git grep -n "Idea" -- 'src/**/*.tsx' 'src/**/*.ts' ':!src/**/*.test.*' ':!src/i18n.ts'` を上から見て、残る物はコードの名前(`SongIdea`・`ideaId`・`makeIdea` など)とコメント(`src/components/SaveProgressionPopover.tsx:24` の「新しいIdeaとして保存」・`src/views/vault/progressionFacts.ts:15`)だけ。コメントは指示どおり直していない。
- テスト(B):`e2e/correction-workspace-save.spec.ts:81`・`src/views/VaultView.test.tsx:135`・`src/i18n.test.ts:7`・`:23` を表のとおりに。ほかに落ちたテストは無かった。
- 足したテスト:`src/i18n.test.ts`「no Japanese copy says Idea any more (the stage name aside)」(`appCopy.ja` を全部たどり、関数は `1` で呼ぶ。呼べない物は飛ばす。`status.idea` を除いて 0 個)。

## 2. §2 で変えた行

- `src/styles/components.css`:`.lv-toast-stack` の `width`(340 → 320)/`.lv-toast` の `gap`(11 → 9)・`padding`(`12px 12px 12px 14px` → `9px 8px 9px 12px`)・`box-shadow`(左の `inset` を外す)/`.lv-toast-icon` の `width`・`height`(24 → 20)/`.lv-toast-bar` の `background`(`var(--lv-text-muted)`)・`opacity`(0.45)/`@keyframes lvToastTime`(`scaleX(0)` → `scaleX(1)`)。ほかの決まりは変えていない。
- `src/views/HomeView.tsx`:♥ のお知らせの 1 行を消し、`togglePin` の依存から `notify` を外した(`notify` はほかで使うので `useNotify()` は残した)。
- ホームの ♥ のお知らせを待っていたテスト:**無し**(`git grep "お気に入りに追加しました\|お気に入りから外しました"` は消した 1 行だけだった)。
- 足したテスト:`src/components/notifications/NotificationProvider.test.tsx`「the toast has no tone stripe and its time bar grows」、`e2e/p23-02-toast.spec.ts`(2 件:「the time bar starts empty and the toast has no coloured edge」「a favourite on the Home says nothing in the corner」)。
  - 1 件目のコピーは、行の「コード進行をコピー」のボタンを押した(クリップボードの許可を与えた)。
  - 2 件目は、保存のお知らせが消えるのを待ってから ♥ を押す(保存のお知らせを数えないため)。

## 3. §3 で変えた所

- `src/styles/tokens.css`:`--lv-practice-bass: #a79cff`・`--lv-practice-bass-soft: #2a2550` を `--lv-accent-secondary-soft` の下に。
- `src/components/AppShell.tsx`:`NavItem` に `mark`・`count` を足し、`<Icon size={19} />` を印の `<svg>` との切り替えに。名前のすぐ後ろに数(`aria-hidden="true"`・`data-testid="nav-{nav}-count"`)。呼ぶ側に `count={vaultCount}`・`mark="VL"`・`"CD"`・`"BP"`。「ホーム」と「取り込む」の間に「集める」の見出し。`AppShellProps` に `vaultCount?: number`。
- `src/App.tsx`:`visibleIdeas` の下に `vaultProgressionCount`(進行の数の合計)を作り、`<AppShell vaultCount={vaultProgressionCount}>`。
- `src/styles/shell.css`:今いる項目(うすい地・`::before` の 3px の緑の線。枠は消した)/印の決まり/`.lv-nav-count`/動きを減らす設定の並びに `.lv-nav-count`。
- 足したテスト:`e2e/p23-02-sidebar.spec.ts`(4 件、1440×900)と、`src/components/AppShell.test.tsx` に「shows the Vault count beside Vault only when it is given and above zero, without renaming the button」(7 を渡すと「7」/渡さない・0 のときは出ない)。
- 直したテスト(A:探し方の直し):

| ファイル・テスト | 前の探し方 | 後の探し方 | 理由 |
|---|---|---|---|
| `src/components/AppShell.test.tsx`「lists the Japanese sidebar in the mock order with stable data-nav hooks」 | `[data-nav]` の `textContent`(ボタンの中の字を全部) | `[data-nav]` の中の `.lv-nav-label` の `textContent` | 印の `<svg>` の中の字(「VL」など)がボタンの字に入るようになったため。確かめる中身(項目の名前と並び)は同じ。ボタンの読み上げの名前は `aria-hidden` で変わっていない |

- `e2e/responsive.spec.ts` の左メニューのテストは、**直さずに通った**(§3 のあとの `npm run test:ui -- e2e/p23-02-sidebar.spec.ts e2e/responsive.spec.ts e2e/p23-02-toast.spec.ts` は 11/11 PASS。FULL の Playwright full も PASS)。

## 4. 基準の写真

- 前:`p89-generated/p23-02/baselines/before/`、後:`p89-generated/p23-02/baselines/after/`。8 枚(`capture-analysis-results-…`・`capture-empty-…`・`capture-source-selection-…`・`home-…`・`practice-…`・`progression-detail-default-…`・`settings-…`・`vault-…`。どれも `-chromium-desktop-win32.png`)。
- 更新の前に Playwright を全部回し(`npm run test:e2e`)、落ちたのが基準の写真の 4 件だけであることを確かめた(992 PASS・4 FAIL・2 skip)。そのあと `npm run test:e2e:update-baselines` を 1 回(996 PASS・2 skip)。
- 前と後の画素を比べた(色の差の合計が 24 を超える画素):8 枚とも、変わった画素は**全部 x ≤ 220(左メニューの中)**で、左メニューの外は 0 画素。基準の写真の中に §1 の言葉は出ていなかったので、変わったのは左メニューだけ。

## 5. §5 の確かめ

- 前と後の 37 枚を、画素で比べた(左メニューの右・右下のお知らせの所の外で変わった所の位置)うえで、後の写真を見た(`home`・`sidebar-collapsed`・`toast-undo`・`toast-error`・`save-menu`・`live-import` を 1 枚ずつ、ほかは画素の比べ)。

| 確かめ | 結果 |
|---|---|
| 1. 「Idea」の字が残っていない | 確かめた・問題なし(「進行のない曲（1件）」「新しい曲として保存」「今ある曲へ追加」「保存先の曲」「新しい曲を作る」「曲名」) |
| 2. お知らせ:左の色の線が無い・アイコンに色・前より小さい・文が切れていない | 確かめた・問題なし(成功・エラー・取り消しの 3 つ。2 行になる文「保存したコード進行を削除しました」「MIDIファイル（.mid / .midi）をドロップしてください。」も切れずに 2 行で出る。前も 2 行) |
| 3. 左メニュー(広い) | 確かめた・問題なし(ホーム/「集める」/取り込む/Vault と数/「練習」/VL・CD・BP/線/Live MIDI/設定。今いる項目の左の端に緑の線) |
| 4. 左メニュー(たたんだ) | 確かめた・問題なし(アイコンと印が縦 1 列。数と名前は出ない。「集める」「練習」は線) |
| 5. 768×640・1280×720 で項目が切れていない | 確かめた・問題なし(768×640 は、写真を撮った流れで「広げる」を押した後なので広い状態。設定まで見える) |
| 6. 左メニューのほかは前と同じ(§1 の言葉を除く) | 確かめた。左メニューの外で変わっていたのは、§1 の言葉(`save-menu`・`live-import`・`vault-orphans`・`toast-undo` の「Idea」→「曲」)、お知らせの形、そしてデータの違い(`home` の「最後に更新 · 今日 16:09」の時刻と、その日の「今日のループ」に選ばれた進行。テスト用の進行の id が撮るたびに違うため)だけ |

## 6. 気づいたこと(直していない)

- `src/components/correction-workspace/SectionSaveDialog.tsx:96` の `aria-label="追加するアイデア"` は、カタカナの「アイデア」が残っている(「Idea」ではないので今回の決まりの外)。
- 修正作業場の保存の「▾」のメニューを開くと、解析の直後のお知らせ「MIDIを解析しました。」が、1280×720 などでメニューのいちばん下の項目「コードだけメモに追記」に重なる(`save-menu-1280x720.png`。前の写真でも同じ)。
- 768×640 で取り込む画面の上の行の「テキスト」のボタンに、MIDI の状態の丸が重なっている(`toast-error-768x640.png`。前の写真でも同じ)。
- たたんだ左メニューの今いる項目にも、左の端に緑の線が出る(`::before` は広い・たたんだの両方に効く。見本の B 案の通りかは、見本の字の大きさで分からなかった)。

## 7. テストの直しのまとめ

- A(探し方の直し):`src/components/AppShell.test.tsx` の 1 か所(上の表)。
- B(新しい動きへの置き換え):

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `e2e/correction-workspace-save.spec.ts:81`(メニューの「既存Ideaへ追加」を押す) | 同じ所で「今ある曲へ追加」を押す | §1-3 |
| `src/views/VaultView.test.tsx:135`(「進行のない Idea（2件）」の折りたたみ) | 「進行のない曲（2件）」の折りたたみ | §1-3 |
| `src/i18n.test.ts:7`(`library.idea` が「Idea」) | 「曲」 | §1-3 |
| `src/i18n.test.ts:23`(`library.openIdea` が「Ideaを開く」) | 「曲を開く」 | §1-3 |

- 足したテスト:`src/i18n.test.ts` 1 件・`NotificationProvider.test.tsx` 1 件・`AppShell.test.tsx` 1 件・`e2e/p23-02-toast.spec.ts` 2 件・`e2e/p23-02-sidebar.spec.ts` 4 件。
- 基準の写真:上の 4 の 8 枚。

## 8. 指示書どおりにできなかった所

- 無し。

## 9. FULL の結果

| 回 | いつ | コミット | 結果 |
|---|---|---|---|
| 1 | 2026-11-11 16:47 開始(日本時間) | `2cbfad6e` | **FAIL**。Vitest full 6397/6399 PASS(2 skip)・Playwright full 943/945 PASS(2 skip)・**Playwright heavy pass:51 PASS・2 FAIL** |

- 落ちたテスト:`e2e/phase13-1-bass-ui.spec.ts:164`「P13.1 §1 §10 result without scroll and primary actions 1920」と「… 1440」の 2 件。どちらも `e2e/phase13-1-bass-ui.spec.ts:104` の `await expect(page.getByTestId("midi-bass-result")).toContainText("余分な音 1");` で、実際は「余分な音 2」だった。
- 関係がないと考える理由:
  - このテストは、合成の音を本物の WebAudio → MediaRecorder → 解析に通して数を数える。前から同じ「余分な音 1 → 2」で揺れると記録されている(`docs/reports/P12.5-final-hardening.md:86`〜`92`:master でも 10 回中 2 回失敗。P23-00 の調査の C にも載せた)。
  - この指示書で変えたのは、言葉・お知らせの CSS・左メニュー・ホームの ♥ のお知らせだけで、Bass Practice の録音・解析・判定には触れていない。
  - コードが同じ状態(`f4d0cf5d` と、基準の写真の更新の作業中)で Playwright を全部回した 2 回(`npm run test:e2e` の 992 PASS と、`npm run test:e2e:update-baselines` の 996 PASS)では、このテストは 2 回とも通っていた。
- README の決まり(「自分の変更と関係がなさそう…回し直さず、報告して止まる」)により、FULL は回し直していない。
