# P23-30:読み込み中・失敗の画面と、確かめの窓

- ブランチ:`feat/p23-30-states-dialogs`(QUEUE の 8 番 P23-28 の先頭 `8eb06246` から。`READY.txt` の「merge: P23-26」は 1 つ前のブランチに P23-26 が入っていることで満たしている)
- コミット:
  - `db77aabb` p23-30-01:`ProblemPanel` と起動・復旧・隔離の 4 画面(P1〜P8)
  - `382f16d4` p23-30-02:確かめの窓の形・ボタンの並び・キーの札(D1〜D8)
  - `ecadbfef` p23-30-03:見本と単体の確かめ、窓の e2e(C1〜C5)、写真
  - (この報告)`p23-30-04`
- 見本:`handoff\mocks\p23-more-mock.html` は **①〜③ の 3 つだけで、「④ 読み込み中・失敗・確かめの窓」が入っていない**(`④` は Vault の進行の案内文の中の 1 か所だけ)。指示書の表 P1〜P8・D1〜D8 がすべての見た目と言葉を書いているので、**表どおりに作った**(表に無い見た目・言葉は決めていない)。

## 1. やったこと(番号ごと)

- **P1**:`src/components/ProblemPanel.tsx` を新設。幅 640px まで・角丸 16px・面 `--lv-surface`・上に 40px の印(注意 = `--lv-warning`・誤り = `--lv-danger`・お知らせ = `--lv-accent`)と題(19px)と 1 行の説明、その下に暗い箱(`--lv-well`)の 3 行(左 96px の薄い字の見出し、右に文)、子要素、一番下に畳んだ「詳しい情報（問い合わせのとき用）」(等幅・`<details>`、無ければ出さない)。`data-testid="problem-panel"`・`data-tone`。データの行は `data-safe` のとき成功の色 `--lv-success`。小さい形(`compact`、P8 用)は幅いっぱい・印 32px・3 行だけ。
- **P2**:起動中は真ん中に印(`/loop-vault-icon.svg`)・「Vault を読み込んでいます」・「この PC に保存した進行を読んでいます。」・細い動く棒(3px・`prefers-reduced-motion` では止めて全幅)。読み上げは今の `LoadingState`(`role="status"`・`aria-live`)をそのまま使っている。
- **P3**:復旧は注意の `ProblemPanel`。題「Vault のファイルが壊れていました」・説明「バックアップから戻すと、続きから使えます。」・何が起きたか「保存したデータのファイルを読めませんでした。」(`migration-recovery` のときは今の `recovery.message`)・データは「消えていません。壊れたファイルは別の場所に移して残しました。」・次にすること「下のバックアップから 1 つ選んで戻してください。」(バックアップが無いときは「利用できるバックアップはまだありません。設定の『データ』から読み込むこともできます。」)。詳しい情報 = `recovery.corruptPath`。
- **P4**:バックアップの並びは `createdAt` の新しい順(同時刻・日付なしは `revision` → 名前)。1 行 = 読める日付(P23-26 の `readableBackupDate`。読めない名前は名前のまま)と薄い字(自動の `data-YYYYMMDD-HHMM.json` は「自動で作ったバックアップ」、そうでなければ名前)、右に「これに戻す」。一番新しい行だけ塗りの主のボタン + 札「いちばん新しい」。読み上げは「{日付} のバックアップに戻す」。押すと今の `requestRestoreBackup(name)`。
- **P5**:新しい形式はお知らせ(アクセント)。題「Loop Vault を新しくしてください」・説明「このデータは、今のアプリより新しい版で保存されています。」・何が起きたか「データの形が、このアプリの知らない新しい形（版 {n}）でした。」(版が無いときは今の `readonly.message`)・データは「そのままです。読むだけにして、書き換えていません。」・次にすること「Loop Vault を最新の版にしてから、開き直してください。」。
- **P6**:読み込めないときは誤り。題「Vault を読み込めませんでした」・説明「アプリを開き直すと直ることがあります。」・何が起きたか「保存したデータのファイルを開けませんでした。」・データは「書き換えていません。」・次にすること「アプリを開き直してください。直らなければ『詳しい情報』を控えておいてください。」。詳しい情報 = 今の `error`(無ければ「不明な起動エラーです。」)。
- **P7**:`PracticeRecoveryPanel` を `ProblemPanel` に。注意(読み取り専用はお知らせ)。題は今の「練習の記録を読み込めませんでした」・説明「Bass Practice の記録のファイルです。Vault の進行は無事です。」・何が起きたか「練習の記録のファイルを読めませんでした。」・データは今の説明を短くした物(「消えていません。元のファイルは残してあります。バックアップは置き換える前にすべて検証します。」/読み取り専用は「消えていません。元のファイルは置き換えも非表示もしません。」)・次にすること「バックアップに戻すか、記録を空にして新しく始めます。」(読み取り専用は「Loop Vault を新しくしてください。」)。バックアップの行は P4 と同じ形(日付が読めなければ「バックアップ r{n}」、読み上げは「… に戻す」)。「もう一度読み込む」は薄いボタン、「記録を空にして新しく始める」は赤い枠(`lv-button-danger`)。「…中」の字と誤りの文は今のまま(誤りは「詳しい情報」にも出る)。
- **P8**:`QuarantineNotice` は `ProblemPanel` の小さい形(幅いっぱい・印 32px・3 行)。何が起きたか・データは・次にすること = 今の 3 行(「次にすること：」の頭は取った)。
- **D1**:窓は幅 480px・角丸 16px・題 17px・本文 13px/行間 1.7。ボタンの並びは全部同じ:左に取り消す方、空き、消える方、一番右に主の方(`.lv-confirm-actions` + `.lv-confirm-spacer`)。
- **D2**:取り消す方は「戻る」(SettingsView の「キャンセル」を「戻る」に)。その場で何かをする前の確かめ(「同じ音が続く所をつなぐ」「同じ直しを他にも反映」)は「やめる」のまま。
- **D3**:Esc は取り消す方のボタンの中に札で出す(すべての窓)。Enter は実際に効く窓(上の 2 つ)だけ主のボタンに札で出す。字に入っていた「（Esc）」「（Enter）」は字から取った(キーの働きは変えていない。Enter は今の `runConfirm` のまま)。
- **D4**:消える方は赤い枠(`lv-button-danger`)。窓が「取り消す」と「消える方」の 2 つだけのときは赤い塗り(新しい `lv-button-danger-solid`。`tokens.css` に 1 つ足した)。
- **D5**:変更の数が分かる窓(取り込むの離れる前・修正作業場の離れる前・変更を捨てる)は題の右に小さい札「変更 n」(注意の色)。本文の数はそのまま。
- **D6**:バックアップを戻す窓は題「{日付} のバックアップに戻しますか？」(読めない名前は今の「バックアップを復元」)・本文「今のデータは、このバックアップの中身に置き換わります。」・ボタン「やめる」と「戻す」(赤い塗り)。
- **D7**:進行のページの離れる前の窓は題「変更を保存しますか？」・本文「この進行には、まだ保存していない変更があります。保存せずに移ると、その変更は消えます。」・ボタン「戻る」・「保存せずに移る」(赤い枠)・「保存して移る」(主)。**進行のページの中の切り替えの窓も同じ本文にそろえた**(`ProgressionWorkspacePage`)。
- **D8**:`Modal` を使う窓(`SectionSaveDialog`・`LiveMidiImportDialog`・`LiveMidiSettingsDialog`)は角丸 16px(`.lv-dialog-16`)と下のボタンの並び(`.lv-dialog-actions`:左に戻る、右に主)だけそろえた。中身は変えていない。

**変えない物**:窓を出す決まり・押したときの働き・Esc と外を押したときの働き・焦点の動き・起動とバックアップと練習の記録の仕組み。

## 2. 窓ごとの表(C3)

| # | 窓(出す所) | 題 | ボタン(左→右) | 色 | 確かめた所 |
|---|---|---|---|---|---|
| 1 | 取り込むを離れる前(`App.tsx`) | 未保存の変更があります(+変更 n) | 戻る(Esc) / 保存せずに移る | 2 つだけ → 赤い塗り | 単体(`Modal.test.tsx` と同じ部品) |
| 2 | 進行のページを離れる前(`App.tsx`) | 変更を保存しますか？ | 戻る(Esc) / 保存せずに移る / 保存して移る | 赤い枠 + 主 | e2e(C1/C3/C4/C5) |
| 3 | 進行のページの中の切り替え(`ProgressionWorkspacePage`) | 変更を保存しますか？ | 戻る(Esc) / 保存せずに移る / 保存して移る | 赤い枠 + 主 | 単体(`ProgressionWorkspacePage` の既存テスト)+ D7 の本文一致を e2e で確認 |
| 4 | バックアップを戻す(`App.tsx`) | {日付} のバックアップに戻しますか？ / バックアップを復元 | やめる(Esc) / 戻す | 2 つだけ → 赤い塗り | 単体(部品)・P4 は単体(`StartupStates.test.tsx`) |
| 5 | 閉じるとき(`CloseDialogHost`) | ブロッカーの題 | 戻る(Esc) / 保存せずに閉じる / 保存して閉じる(保存が無いときは 2 つ) | 赤い枠 + 主(2 つのときは赤い塗り) | 単体(部品) |
| 6 | 同じ音が続く所をつなぐ / 同じ直しを他にも反映(`CorrectionWorkspace`) | 今のまま | やめる(Esc) / つなぐ・反映する(Enter) | 主 | e2e(`correction-workspace` の既存 2 本)+ 単体 |
| 7 | 変更を捨てますか(`WorkspaceSaveForm`) | 今のまま(+変更 n) | 戻る(Esc) / 変更を捨てる | 2 つだけ → 赤い塗り | 単体(部品) |
| 8 | 計測を消しますか(`CorrectionMetricsSettings`) | 今のまま | 戻る(Esc) / 消す | 2 つだけ → 赤い塗り | 単体(部品) |
| 9 | 修正ログを削除(`SettingsView`) | 今のまま | 戻る(Esc) / 消す | 赤い塗り | e2e(`keyboard` の既存テスト) |
| 10 | 区切りごとに保存・Live MIDI の保存・Live MIDI の設定 | 今のまま | 戻る / 主 | 角丸 16px・並びだけ | 単体(既存) |

## 3. 今あるテストで直した行(A・B)

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `src/components/Modal.test.tsx:193` | `["戻る", "保存せずに移る", "保存して移る"]` | `["戻るEsc", …]`(D3 で Esc の札がボタンの中に入った) | B |
| `src/views/ProgressionDetailView.test.tsx:36` | `find(b=>b.textContent==='戻る')` | `find(b=>b.textContent?.startsWith('戻る'))`(札が付いても見つかる) | A |
| `src/features/bass-practice/ui/PracticeRecoveryPanel.test.tsx:27` | 「バックアップ r7 を復元」を字で探す | `aria-label="バックアップ r7 に戻す"` で探す(P4/P7 の行の形) | A |
| `e2e/keyboard.spec.ts:44` | `/キャンセル/` | `/戻る/`(D2) | B |
| `e2e/progression-workspace.spec.ts:29` | `{name:'戻る',exact:true}` | `{name:/^戻る/}`(D3 の札) | A |

`.skip`・`.only`・retry・待ち時間の延長は使っていない。

## 4. 確かめること(C1〜C5)

| # | 単体/e2e | テスト |
|---|---|---|
| C1 | 単体 | `src/components/StartupStates.test.tsx`(9 本):P1(印・題・1 行・3 行・`data-safe`・畳んだ詳しい情報)、P2(印・読み上げ・棒)、P3(注意・文・`corruptPath`・migration の文)、P4(新しい順・主は 1 つ・札・読み上げ・押した名前)、P5(アクセント・版の文)、P8(小さい形・3 行・説明なし)、P7(題・説明・3 行・バックアップの行・赤い枠のボタン・読み取り専用) |
| C1 | e2e | `e2e/p23-30-states-dialogs.spec.ts`:D1(480px・角丸 16px・題 17px・本文 13px・並びと空き)、D2/D3(「戻るEsc」)、D4(3 つは赤い枠+主 / 2 つは赤い塗り)、D7(題と本文)、C4(Esc と外) |
| C2 | 単体 | `StartupStates.test.tsx` の「P4/C2」(3 つ・1 つは形に合わない名前 → 並び・主は 1 つ・名前はそのまま・`requestRestoreBackup` に同じ名前) |
| C3 | 上の表 | 窓 1〜10 の並びと色。**実際に開いたのは e2e で 2・9**(と既存テストで 6)。1・4・5・7・8・10 は同じ `ConfirmDialog` を単体で描いて確かめた(開くのに壊れた Vault・OS の閉じる・MIDI の未保存作業場が要るため) |
| C4 | e2e | Esc で閉じる・外を押して閉じる・押しても何も変わらない(進行のページの窓)。ほかの窓は同じ `Modal` の `onClose`(Esc・外)なので、単体の `Modal.test.tsx` が今のまま通ることで確かめた |
| C5 | e2e | 1440/1280/1024/768 で横にはみ出さない・axe の serious/critical 0・開くと焦点が窓の中・Esc のあと 0 件 |

## 5. 写真(`p89-generated/p23-30/`、git 追跡外)

- `panel-P2-1440x900.png`・`panel-P3-1440x900.png`・`panel-P3-768x640.png`・`panel-P3-empty-1440x900.png`・`panel-P5-1440x900.png`・`panel-P6-1440x900.png`・`panel-P8-1440x900.png`
  - 出し方:見本の仕組み(コンポーネントの一覧)を `VITE_P89_GALLERY=1` で組み、`/?gallery` の P23-30 の欄を 1 つずつ撮った。このために一覧へ P3(バックアップ 3 つ)・P3(バックアップ無し)・P5・P6 の見本を足した(開発用の画面だけ)。撮ったあと、一時的な spec は消している。
- `window-progression-leave-1440x900.png`・`window-progression-leave-768x640.png`
  - 出し方:動いているアプリで進行のページを編集してから「‹ Vault」を押して撮った(e2e の中)。
- 撮れなかった物:取り込むの離れる前(MIDI の作業場を未保存にする必要がある)、バックアップを戻す(壊れた Vault が要る)、閉じるとき(OS の閉じる操作)、同じ直しを反映(修正作業場の同じ音の候補が要る)。どれも同じ `ConfirmDialog` なので、形と並びは単体の e2e/単体テストの数字で確かめた。

## 6. 最後の確かめ

```
npm run lint                                                   PASS
npm run build                                                  PASS(8.56s)
npm run test:fast -- src/components src/features/bass-practice src/views src/App.test.ts
                                                               PASS 6791/6793(116.2s)
npm run test:ui -- <上の grep で当たった spec・p23-30・visual・accessibility・keyboard・responsive>
                                                               PASS 134/134(132.5s)
```

取りこぼし探し:`git grep` で「キャンセル」「（Esc）」「（Enter）」「を復元」「新しく始める」「未保存の変更を破棄」「Vaultを読み込み中」「データ復旧が必要です」「Loop Vaultを更新してください」「Vaultを読み込めませんでした」「startup-loading」「startup-state」「practice-recovery」を e2e と src で探した。当たった spec は `correction-workspace`・`correction-workspace-save`・`progression-workspace`・`keyboard`・`p23-07-command-palette`・`p23-26-settings`・`p23-15-progression-header`・`p22-01-back` で、全部 `test:ui` に入れた。

## 7. FULL

`npm run test:full` を 1 回(`2026-11-15T07-05-19-425Z`)。**FAIL — Playwright full で 1 件**(Vitest full は PASS 6791/6793・97.5s。ほかの段は全部 PASS。heavy は回らず)。

- 落ちたテスト:`e2e/p16-ear-keyboard.spec.ts:45`「P16: 鍵盤が縦長にならない 768×640…」
- 出た文:`expect(ratio).toBeGreaterThanOrEqual(3.5)` / Received `3.1234569372227488`
- この指示書が変えたファイル(`src/components/StartupStates.tsx`・`ProblemPanel.tsx`・`ConfirmDialog.tsx`・`App.tsx`・`tokens.css` ほか)に、耳の練習の画面は無い。
- 過去の記録:`docs/reports/p23-23b-ear-result.md:95`(6 本同時の負荷で 1 回落ち、単独では通った)。**同じ値 3.123 が、この 1 つ前の P23-28 の FULL でも出ている**。
- 単独で:今のブランチ 5/5 PASS(7.5s)・master `b032215c` 5/5 PASS(7.8s)。
- 決まり(両方で通れば「揺れ」)に従い、**直さず・回し直さず**、FULL は FAIL のまま記録して 10 番(P23-12)へ進む。

## 8. 気づいたこと

- 見本 `p23-more-mock.html` に「④」が無い(①②③ だけ)。表だけで作ったので見た目の迷いは無かったが、リードが見本で確かめる場合はこの点を先に見てほしい。
- 進行のページの中の切り替えの窓の本文が「保存して移るか、保存せずに移るか選んでください。」のままだったので、D7 の「同じ言葉にそろえる」に合わせて、離れる前の窓と同じ本文にした。
- 窓の取り消す方に Esc の札を入れたので、`getByRole(..., { name: "戻る", exact: true })` の形で探しているテストは当たらなくなる(2 か所直した)。新しい窓を作るときは「戻る」+ 札が付く前提で探すのがよい。
- 赤い塗りのボタンは今まで無かったので、`lv-button-danger-solid` を 1 つ足した(枠の `lv-button-danger` は今のまま)。
