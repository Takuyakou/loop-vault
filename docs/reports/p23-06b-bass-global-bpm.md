# P23-06b:Bass の Rhythm Echo・Bassline Echo を共通 BPM につなぐ

- ブランチ:`feat/p23-06b-bass-global-bpm`(master `833f28e3` から)
- コミット:
  - `2fe5b459` p23-06b-01: the worker may merge after the review passes (CLAUDE.md)
  - `fb5b4a88` p23-06b-02: Rhythm Echo plays at the app-wide BPM
  - `84f64896` p23-06b-03: Bassline Echo plays at the app-wide BPM (the comment in §3 comes with it)
  - `6e341164` p23-06b-04: the Bassline Echo tests play at the app-wide BPM (T7-T13)
  - `344e5809` p23-06b-05: the end-to-end checks for the bass echoes
  - `0d395366` p23-06b-06: the Chord Context e2e expects the app-wide BPM (+4 from 120)
  - (この報告)`p23-06b-07: report`
- **FULL は回していません**(指示書のとおり。次の FULL は P23-08)。

## やったこと(節ごと)

- **§0** `CLAUDE.md` の 2 行を指示書の「後」のとおりに直した(レビュー合格後にローカル master へ入れてよい、という利用者の決定)。`npm run validate:ai-handoff`・`npm run validate:phase-docs` とも PASS。
- **§1** `RhythmPracticeView.tsx`:`useGlobalBpm()` を使い、`tempo` の最初の値を共通 BPM に。`ready` で保存中でないときだけ共通 BPM に合わせる effect を足した。テンポの欄は `setGlobalBpm` を呼ぶだけにし、`status !== "ready"` か保存中は `disabled`。`status !== "ready"` で `tempo !== 共通 BPM` のとき `rhythm-tempo-pending` の 1 行を出す。拍子・カウントイン・`controlsLocked`・H/C・録音の部品・`exerciseSnapshot` は変えていない。
- **§2** `BasslinePracticeView.tsx`:`useGlobalBpm()` を使い、`effectiveBpm` の最初の値を共通 BPM に。進行が替わったときの effect から `setEffectiveBpm(tempoBaselineBpm)` を消した。`chooseEffectiveBpm` は `clampChordContextBpm(...)` した値で `setGlobalBpm` を呼ぶだけにした。新しい effect(`!recordingInFlight` で共通 BPM と違えば、試聴を止める・`setLegacyPlaying(false)`・`stopChordContext()`・`setEffectiveBpm`・`invalidateRecordedFacts()`)を足した。録音中は `chord-context-tempo-pending` の 1 行。説明の後ろ半分を「ここで変えると、上の共通 BPM が変わります。Vault は変わりません。」に。`useAnnounceSongBpm(...)` で曲の BPM を知らせる。
- **§3** `GlobalBpmProvider.tsx` の説明の 1 行を「Voicing Loop, Jazz and the two Bass echoes play at it」の意味に直した(コードは変えていない)。

## 指示書どおりにできなかった所

- **無し。**(新しいファイルは無い。§1 のコードとテスト、§2 のコード、§2 のテスト、e2e は指示書のとおり)
- コミットの分け方だけ、指示書の「§2(テスト込み)/§3」と少し違います:§3 は 1 行のコメントなので §2 のコードと同じ `84f64896` に入れ、§2 のテストは `6e341164` に分けました(内容は変えていません)。

## 今あるテストで直した行(A/B)

A = 準備だけ(期待は変えない)/ B = 決まりが変わった期待。

| ファイル:行 | 前 | 後 | A/B |
|---|---|---|---|
| `BasslinePracticeView.chordContext.test.tsx:92`(`beforeEach`) | (無し) | `localStorage.setItem("loop-vault:global-bpm:v1", {version:1,bpm:96})` | A |
| 同(`afterEach`) | (無し) | `localStorage.clear()` | A |
| 同(import) | `GlobalBpmProvider` だけ | `useGlobalBpm` も | A |
| 同(`renderView` の中) | `render(<BasslinePracticeView …/>)` | `render(withGlobalBpm(<BasslinePracticeView …/>))` | A |
| 同 8 か所の `root?.render(`(720・754・767・821・839・872・913・1070 行) | `root?.render(<BasslinePracticeView …/>)` | `root?.render(withGlobalBpm(<BasslinePracticeView …/>))`(包み直すと作り直されて状態が消えるため) | A |
| 同:220 | `toBe("112")` | `toBe("96")`(112 の進行を選んでも欄は共通 BPM のまま) | B |
| 同:244 | `toBe("92")` | `toBe("96")`(同上) | B |
| 同:275 | `effectiveBpm: 92` | `effectiveBpm: 96`(履歴に残るのは鳴らした速さ) | B |
| 同:483 | 文言 `"Vaultは変更されません"` | 文言 `"Vault は変わりません"`(L6 の文言) | B |
| 同:794 | `toBe("104")` | `toBe("96")`(進行の BPM 104 でも共通 BPM のまま) | B |
| `e2e/phase5.18-chord-context.spec.ts:106` | `toHaveValue("100")` | `toHaveValue("124")`(+4 は共通 BPM の 120 から) | B |

## 新しいテスト(番号ごと)

### 単体 `src/features/bass-practice/ui/RhythmPracticeView.globalBpm.test.tsx`(新規)

| # | テストの名前 |
|---|---|
| T1 | `T1 starts at the app-wide BPM` |
| T2 | `T2 a change in the field changes the app-wide BPM` |
| T3 | `T3 a change from outside reaches the problem that starts next` |
| T4 | `T4 a problem under way keeps its speed and shows the pending line` |
| T5 | `T5 the saved attempt keeps the speed the problem was played at` |
| T6 | `T6 the next problem takes the new speed and the line goes away` |

### 単体 `BasslinePracticeView.chordContext.test.tsx` の末尾(7 件)

| # | テストの名前 |
|---|---|
| T7 | `T7 starts at the app-wide BPM` |
| T8 | `T8 choosing a preset keeps the app-wide BPM and announces the song's` |
| T9 | `T9 the generated progression and a source bassline announce no song BPM` |
| T10 | `T10 +4 BPM and going back to the original tempo move the app-wide BPM` |
| T11 | `T11 a change from outside reaches the field and stops the playback` |
| T12 | `T12 a recording keeps its speed until it ends` |
| T13 | `T13 the saved history keeps the speed the take was played at` |

### e2e `e2e/p23-06b-bass-global-bpm.spec.ts`(新規。1440×900)

| # | テストの名前 |
|---|---|
| E1 | `E1 the app-wide BPM reaches Rhythm Echo` |
| E2 | `E2 a change in Rhythm Echo moves the app-wide BPM` |
| E3 | `E3 Bassline Echo follows the same BPM, and +4 moves the header too` |
| E4 | `E4 choosing a preset announces its BPM and keeps the app-wide one` |
| E5 | `E5 Voicing Loop plays at the BPM the header was set to by Bassline Echo` |
| E6 | `E6 both bass echoes have no serious accessibility violations` |

## 最後の確かめ(§6)

| コマンド | 結果 |
|---|---|
| `npm run validate:ai-handoff` | PASS |
| `npm run validate:phase-docs` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS(`✓ built in 9.21s`) |
| `npm run test:fast -- src/features/bass-practice/ui src/components/GlobalBpmProvider.test.tsx src/components/GlobalBpmField.test.tsx` | PASS — Vitest **6562 / 6564**(2 は元からの skip) |
| `npm run test:ui -- …(§6 の 12 本)` | PASS — Playwright **58 / 58** |

- `test:ui` は 1 回目、`e2e/phase5.18-chord-context.spec.ts` の 1 件だけが失敗(`100` を期待、実際は `124`)。上の B のとおり直してその spec だけ回し直し(4/4 PASS)、そのあと 12 本をまとめて回し直して 58/58 PASS。retry は使っていません。
- 見た目の基準(`e2e/**-snapshots`)は変わっていません(`visual.spec.ts` も PASS)。

## §2 の「調べて報告」(録音中に共通 BPM を変えたとき、まだ残していない録音はどうなるか)

**消えます。**

- 録音中は L4 の effect が動かないので、録音そのものと欄・`resetKey` は前の速さのままです(知らせの 1 行だけ出ます)。
- 録音が終わって `recordingInFlight` が false になると L4 が動き、`setEffectiveBpm(新しい値)` で `resetKey`(`bassline:…:effectiveBpm:…`)が変わります。`useRecordCompareSession` は `resetKey` が変わると録音の controller を捨てて作り直す(`controller.dispose()` → 新しい idle)ので、**まだ残していない録音(unkept take)はその場で消えます**。
- あわせて `invalidateRecordedFacts()` が `recordingFacts`・`retainedTakeReference`・履歴の状態を初期化するので、残していた録音の参照も外れます。
- つまり「録音中に速さを変えた」回は、その録音を残せず録り直しになります。文言で先に知らせるかどうかはリードの判断です(こちらでは変えていません)。

## 写真

`p89-generated/p23-06b/`(git に入れない)

- `rhythm-132.png`(Rhythm Echo を 132 で開いた所)・`rhythm-pending.png`(お手本の再生中に 140 へ変えた所。`rhythm-tempo-pending` の行)・`bassline-song-chip.png`(プリセットを選んで「曲 92」が出ている所)・`bassline-768x640.png`(同じ画面の 768×640)
- **目視について**:このセッションのモデルは画像を読めないため、写真を「見た」とは書けません。代わりに、同じ状態を e2e が数値で確かめています(E1・E2・E4 の欄と帯、E6 の axe、E11 相当の 768×640 は写真の条件と同じ)。

## 気づき

- 上の「録音中に速さを変えると、その回の録音は消える」は、利用者に先に知らせたほうがよいかもしれません(文言は未変更)。
- `BpmScrubField` の値は `<input>`(`#voicing-loop-bpm`)なので、E5 は欄の値を直接見ています。見出しの「n BPM」は別の場所に出ます。
- 設定画面の「修正ログを削除」と同じく、Bass の画面は「レビュー」を押さないと録音の部品が出ません(テストはその手順)。
