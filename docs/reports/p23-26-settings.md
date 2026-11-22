# P23-26:設定と曲のページ

- ブランチ:`feat/p23-26-settings`(master `66f60528` から。`READY.txt` の「`9e21de3e` か、それより後」を満たす)
- コミット:
  - `e7547e0c` p23-26-01:設定の組み直し(S1〜S5・S7・S8)+ 単体テスト
  - `a91146ae` p23-26-02:曲のページ(D1・D2)+ `e2e/p23-26-settings.spec.ts`(C1〜C6)
  - `fc4fe0d0` p23-26-03:Bass Practice の見出しの重複(X1)
  - (この報告)

## 1. 設定(S1〜S8)

- **S1**:欄を 表示 / MIDI 入力 / データ / このアプリについて / 開発者向け に組み直した。「音と MIDI」と「Live MIDI」は 1 つの「MIDI 入力」に。
- **S2**:テストが使っている id・testid は残した。まとめた「MIDI 入力」の中に `#settings-live-midi` を置き、外側の `#settings-audio-midi` は欄の id のまま。`settings-general`・`settings-data`・`settings-developer`・`settings-about`・`settings-live-midi-device`・`settings-standard-title-bar`・`settings-record-channel`・`settings-import-mode`・`piano-sample-attribution`・`loop-vault-format-info`・`loop-vault-build-info`・`stored-api-key-removal`・`settings-analysis-content` もそのまま。
- **S3**:左の見出しは、読んでいる欄が光る(`aria-current`)。`#main-content` のスクロールを見て切り替える。「MIDI 入力」には上の帯と同じ `.lv-midi-dot`(同じ色の意味)を付けた。
- **S4**:チェックの箱は `Switch`(`role="switch"`)に。1 行 = 左に名前と説明・右に操作(`src/components/SettingsRow.tsx`)。開発者向けの中身は「変えない物」なので、今のチェックの形のまま残した。
- **S5**:「MIDI 入力」の上に「今の様子」— 機器の名前・状態・88 鍵の帯(押している音が光る。最後の音は白)・最後に届いた音・「探し直す」。88 鍵の帯は小さい窓(P23-18)の物を `src/components/LiveMidiKeyStrip.tsx` に分けて両方から使う。
- **S6**:データは「保存している場所(進行 n・曲 n)」+「ファイルに書き出す」「ファイルから読み込む」の 2 枚の札 + バックアップ。バックアップは名前(`data-YYYYMMDD-HHMM.json`)を**その PC の時刻**で「11月11日 9:30」の形に。形に合わない名前・古い取り込みの物は名前のまま。
- **S7**:足した設定は 1 つだけ:「Live MIDI の小さい窓を、常に手前に出す」。記録 `preferences.alwaysOnTop` はもうあったので、変える関数 `setAlwaysOnTop` を足した(初めは入)。小さい窓を開く所(`App.tsx:686`)が今も `preferences.alwaysOnTop ?? true` を渡していることを確かめた。
- **S8**:データの保存先の表示を、本当に使っているファイルに直した(`loopvault/data.json` → `loopvault/txt-jazz-v3/data.json`。`JAZZ_VAULT_DATA_PATH` を使う)。

## 2. 曲のページ(D1・D2)

- **D1**:作り直していない。土台の色・角の丸み・文字だけ当てた — `Panel` と進行のカードに `--lv-radius-md`/`--lv-radius-sm`、`teal`・`cyan`・`amber`・`red` の決め打ちの色を役割の色(`--lv-accent`・`--lv-success`・`--lv-warning`・`--lv-danger`)に。中身の並び・文・働きはそのまま。
- **D2**:「まだMIDIから保存したコード進行はありません。」→「まだ保存したコード進行はありません。」(`src/i18n.ts`)。

## 3. ついで(X1)

- `BassPracticeHome.tsx` の `<h2>Bass Practice</h2>` を消した。説明の文と右の「?」は残した。ページの名前は上の帯の題が持つ。
- 読み上げで段が飛ばないよう、右の列の「楽器」「この 7 日」を `h3` から `h2` に上げた(見た目は同じ CSS を当て直した)。

## 4. 指示書どおりにできなかった所

- **無し**(止まって聞く所は無かった)。ただし、表に無い見た目・言葉は決めないようにしたので、次の 3 つは**今の言葉のまま**にしてある。レビューで見てもらいたい。
  1. 「既定のMIDI入力」「接続テスト」の名前(見本は「使う機器」「確かめる」)。
  2. 表示の 2 行の名前と説明(見本は「Windows の標準のタイトルバーを使う」)。
  3. 開発者向けの中は、行の形も今のまま(見本はスイッチとボタンの行)。「開発者向けの中身は変えない」を優先した。
- **S8 は e2e で確かめていない**。ブラウザの下見では `__TAURI_INTERNALS__` が無いので、保存先は今も「デスクトップアプリのデータ保存場所」と出る(実際の道はデスクトップだけで出る)。単体テスト(Tauri の `appDataDir` を差し替え)で `…/loopvault/txt-jazz-v3/data.json` になることを確かめた。
- **C2 の「接続テスト」の行は、つながっていない・開けなかった・選ぶ前のときだけ出る**(前から同じ。ブラウザの下見は機器なしなので出ない)。単体テストで確かめた。

## 5. 今あるテストで直した行(表で変わった物だけ。形 A/B)

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `src/views/SettingsView.test.tsx:75-88` | h2 が 一般/音と MIDI/Live MIDI/データ/開発者向け、左の見出しも同じ、id は 5 つ | 表示/MIDI 入力/データ/このアプリについて/開発者向け、id は `settings-about` も見る | B(S1) |
| `src/views/SettingsView.test.tsx:101-112` | `一般` を含む、`Live MIDI` を含む、帰属は `#settings-data` の中 | `表示` を含む、`このアプリについて` を含む、帰属は `#settings-about` の中 | B(S1) |
| `src/views/SettingsView.test.tsx:156-170` | 最初の `input[type="checkbox"]` を押す | `[data-testid='settings-show-degrees']` のスイッチ(`role="switch"`)を押す | B(S4) |
| `e2e/p23-25-bass-practice.spec.ts:66-78` | 選ぶ画面の `h2`「Bass Practice」が見える | 説明の文が見える・見出しは `h2` が 2 つ(飛ばない)・「Bass Practice」の見出しは無い | B(X1) |
| `e2e/p23-04-chord-names.spec.ts:29-32` | 「コードカードに度数を表示」を `getByRole("checkbox", …)` で探して `isChecked`/`check` | 同じ所を `getByRole("switch", …)` で探す(`isChecked`/`check` はそのまま効く) | A(S4) |
| `e2e/p23-14-card-harmony.spec.ts:60-63` | 同上を `getByRole("checkbox", …)` で探して `toBeChecked`/`uncheck` | 同じ所を `getByRole("switch", …)` で探す | A(S4) |

基準の写真は `settings-chromium-desktop-win32.png` の 1 枚だけ更新した(指示書のとおり)。

## 6. 確かめること(C1〜C6)

| # | 単体/e2e | テストの名前 |
|---|---|---|
| C1 S1 | e2e | `e2e/p23-26-settings.spec.ts`「C1 S1-S6 + C2: the five groups hold every setting that was there」 |
| C1 S2 | e2e + 単体 | 同上、`SettingsView.test.tsx`「is a screen with five sections…」、`SettingsView.p23-26.test.tsx`「C2: the items are all reachable…」 |
| C1 S3 | e2e | 同上(`aria-current`・`.lv-midi-dot`) |
| C1 S4 | e2e + 単体 | 同上、`SettingsView.test.tsx`「keeps general setting callbacks connected」 |
| C1 S5 | e2e + 単体 | 同上、`LiveMidiSettingsSection.p23-26.test.tsx`「S5: the 88 keys light…」 |
| C1 S6 | e2e + 単体 | 同上、`SettingsView.p23-26.test.tsx`「S6: the two write/read cards…」 |
| C1 S7 | 単体 + e2e | `LiveMidiSettingsSection.p23-26.test.tsx`「C3: the always-on-top switch…」、`miniWindowAlwaysOnTop.test.ts`、e2e「C3 S7: always-on-top turns off…」 |
| C1 S8 | 単体 | `SettingsView.p23-26.test.tsx`「S8: the shown location is the txt-jazz-v3 file」 |
| C1 D1 | e2e | 「C1 D1/D2: the song page keeps its words, with the base colour and corner」 |
| C1 D2 | e2e | 同上(文の確認) |
| C1 X1 | e2e | `e2e/p23-25-bass-practice.spec.ts`(見出しの段) |
| C2 | e2e + 単体 | 上の C1 S1-S6 の e2e、`SettingsView.p23-26.test.tsx`「C2: the items are all reachable…」 |
| C3 | 単体 + e2e | 上の S7 の 2 つ(切にすると記録が偽・開き直しても切のまま・窓を開く所が値を渡す) |
| C4 | 単体 | `LiveMidiSettingsSection.p23-26.test.tsx`「C4: no device, connected and failed-to-open each say their own thing」 |
| C5 | 単体 | `SettingsView.p23-26.test.tsx`「C5: a data-… name becomes that PC's date and time…」「C5: the data section shows the readable date…」 |
| C6 | e2e | 「C6: four widths stay inside the window, axe is clean and the keys still work」 |

### C2:直す前の項目と、後の画面

| 欄(前 → 後) | 項目 | 後の画面 |
|---|---|---|
| 一般 → 表示 | コードカードに度数を表示 / 標準のタイトルバーを使う | 1 行ずつスイッチで在る |
| 音と MIDI + Live MIDI → MIDI 入力 | 既定のMIDI入力 / 再読み込み→**探し直す**(S5 の言葉) / 接続テスト / 起動した時に自動でつなぐ / 機器の状態 | 今の様子 + 3 行 + 常に手前(S7) |
| 音と MIDI | Bass Practice · Record & Compare の入力チャンネル | 同じ欄の最後の行 |
| データ → データ | データ保存先 / フォルダを開く / パスをコピー | 保存している場所の 1 枚(進行・曲の数も) |
| データ | JSONを書き出す / JSONを読み込む(マージ・すべて置き換え) | 2 枚の札 |
| データ | バックアップと復旧(更新・復元・最新 5 件/すべて表示) | 同じ(日付が読める形に) |
| データ(中の `#settings-about`)→ このアプリについて | アプリ版 / アプリ形式 / データ形式 / ピアノの音の帰属 | 独立した欄に移した(中身は同じ) |
| 開発者向け → 開発者向け | 運指方式・計測・解析・修正ログ・評価データ・ビルドの情報・保存した API キー | そのまま(折りたたみも同じ) |

## 7. 最後の確かめ

```
npm run lint                                        PASS
npm run build                                       PASS(9.32s)
npm run test:fast -- <指示書の 5 つ>                PASS 6745/6747(2 は既存の条件つき skip、111.1s)
npm run test:ui -- <15 spec>                        PASS 56/56(67.2s)
直した 2 本だけの再確認                      PASS 11/11(34.5s)
```

`test:ui` の一覧は、指示書の名前に `settings` を含む物(`e2e/p23-26-settings.spec.ts` だけ)・`phase11-fingering-ranker`・`p23-18-live-midi-mini`・`visual`・`accessibility`・`keyboard`・`responsive` に、触った画面の物として `p23-25-bass-practice`(X1)・`p23-07-command-palette`(設定を開く)・`phase5.27-voicing-loop-ui`(設定が無いこと)・`vault-flow`(曲のページのボタン)を足した。

基準の写真は `settings` の 1 枚だけ更新(`--update-snapshots` をこのテストにだけ当てた)。

## 8. FULL

```
npm run test:full   PASS — 893.4s(2 回目)
```

1 回目は Playwright の軽い方で 2 件落ちた(S4 でチェックの箱をスイッチにした所を、2 つの spec が今も `getByRole("checkbox", …)` で探していた)。ANSWER(P23-26)のとおり**形 A で直し**(探し方を `role="switch"` に。期待は変えていない)、直した 2 本だけを回して 11/11 を通してから、もう 1 回回した。落ちたまま終わっていない。

| 段 | 結果 |
|---|---|
| Source contracts / AI handoff / Class lint / Phase docs | PASS |
| Runner contracts | PASS 40/40(2.2s) |
| Privacy scan | PASS(2.7s) |
| E2E TypeScript / Production build / Repository ESLint / App TypeScript | PASS(8.9s / 17.8s / 29.1s / 37.1s) |
| Vitest full | PASS 6745/6747(79.2s) |
| Gallery | 対象外(excluded) |
| Playwright full(軽い方) | PASS 1051/1053(2 件は既存の条件つき skip、545.3s) |
| Playwright heavy pass | PASS 53/53(268.5s) |
| Git diff check / tracked PNG check | PASS(開き直り 0 回、追跡 PNG の変化なし) |
## 9. 写真

`p89-generated/p23-26/`(git で追跡しない)。

- `settings-1440x900.png` / `-1280x720` / `-1024x768` / `-768x640`
- `song-page-1440x900.png`

こちらでは画像を読めないので、形は e2e の数字(横にはみ出さない・行の中身と操作が重ならない・`body` が広がらない)で確かめた。写真はレビューで見てもらう。

## 10. 気づいたこと

0. **FULL の 1 回目で落ちた 2 件**は、上の「8. FULL」のとおり形 A で直して 2 回目で通した。取りこぼした理由は、S4 で**部品の種類**(チェックの箱 → スイッチ)を変えたのに、こちらの「取りこぼし」の探し方が「変えた文字・testid」だけで、`getByRole("checkbox", …)` の探し方を見ていなかったこと。ANSWER の指摘どおり、`git grep "checkbox"` で洗い直して、他に同じ所が無いことも確かめた(残りは Chord Dojo・Voicing Loop・取り込み前の確認・ヘッダーの MIDI の帯の物で、S4 で変えていない)。

1. 「進行のない曲」を開く道で、**削除の「元に戻す」が消えるまでの 5 秒間は曲のページが開かない**(P23-00 調査の E-4 と同じ)。`openDetail` が消す前の進行を見て、その進行のページを開こうとするため。曲のページの写真は、元に戻すの帯が消えてから撮った。
2. 開発者向けの「解析前のパート選択を有効にする」などは、S4 のスイッチにしていない(「開発者向けの中身は変えない」を優先)。見本のとおりにするなら別の指示で。
3. `App.tsx` の小さい窓を開く所は `preferences.alwaysOnTop ?? true` を渡していて、**すでに正しかった**。S7 で足したのは記録を変える関数と欄だけ。
4. 設定の「データ保存先」は、ブラウザの下見では今も「デスクトップアプリのデータ保存場所」と出る(実際の道は Tauri のときだけ)。S8 の直しはデスクトップでだけ見える。
5. `Bass Practice` の選ぶ画面の `<h2>` を消したので、`bassPracticeHome.css` の `.lv-bh-heading > h2` の規則は消した(見た目は変わらない)。
6. 曲のページの「以前の項目」の中の `LegacyField` などは手を入れていない(D1 は土台を当てるだけ)。
