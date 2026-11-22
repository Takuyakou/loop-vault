# P23-08 ホームの記録(練習に開いた回数・練習ごとの 7 日・左メニューの「今日弾いた点」)

## 1. ブランチとコミット

ブランチ:`feat/p23-08-home-records`(master `9e21de3e` から)

| コミット | 名前 |
|---|---|
| 7c2ceb1c | p23-08-01: practice opens record (Voicing Loop / Chord Dojo) |
| 69f4b77b | p23-08-02: practice week and the Home summary's topOpened |
| dc6365e1 | p23-08-03: the side menu's practised-today dot |
| a797cb4b | p23-08-04: e2e for the practice opens and the side menu dot |
| (このコミット) | p23-08-05: report |

## 2. 節ごとにやったこと

- §1:`src/views/home/practiceOpens.ts` を新しく作った(`recordPracticeOpen`・`loadPracticeOpens`・`topOpenedProgressions`・`practicedDays`)。`lastPractice.ts` と同じく、読めない物は捨て、書けなくても例外を出さない。記録する所は `App.tsx` の `openProgressionVoicingPractice`(`rememberLastVoicingPractice` の隣)、`openChordDojo`(`target` があるときだけ、`requestProgressionLeave` の中)、`ChordDojoView.tsx` の `rememberRecent({kind:'saved'})`(「自分の進行」から。`from==='saved-progressions'` の方)の隣。
- §2:`src/views/home/practiceWeek.ts` に `practiceWeek(records, opens, now)` を置いた。Chord Dojo・Bass Practice は `collectPracticeRecords` の `date`、Voicing Loop は `practicedDays`。`activity` と `PracticeKind` は変えていない。
- §3:`HomeSummary` に `topOpened` と `practiceWeek` を足した(`HomeExtraInputs.practiceOpens` で受け、`useHomeSummary` が `loadPracticeOpens()` を `now` ごとに読む)。`HomeView.tsx` は変えていない。
- §4:`AppShell` に任意の `practisedToday` を足し、Voicing Loop・Chord Dojo・Bass Practice の行に点(`data-testid="nav-today-dot"`、6px、`var(--lv-accent)`、`sr-only` の「今日弾きました」)。広いときは名前の右(`.lv-nav-label` の中)、狭いときはマークの右上(絶対位置)。`App.tsx` は `useTodayPractised`(`practiceWeek.ts`)で、`view`・`practiceMode` が変わるたびに日付と記録を読み直す。Bass Practice の行が無いときは点も無い。

## 3. 指示書どおりにできなかった所

- **Chord Dojo「自分の進行」の記録の時点**:指示書の場所(`rememberRecent({kind:'saved'})` の隣)は、開いた瞬間ではなく**最初に答えた時**(`submit` の中で 1 回だけ)に通る。場所の指定に従ったので、「自分の進行」からは、開いて 1 回答えた時に 1 件入る。開いただけ(何も答えずに戻る)では入らない。
  なお同じ `submit` の中の `from===undefined&&outsideActive` の `rememberRecent({kind:'saved'})`(進行のページから開いた時)は、`App.openChordDojo` で記録済みなので記録しない(2 件にならない)。
- **T14 は単体ではなく e2e に置いた**:`ChordDojoView` を描いて答えるまで進める単体テストは今まで無く、組むのが大きいので、`e2e/p23-08-home-records.spec.ts` の「T14: …」で、期待する値(`via: "chord-dojo"`・1 件・進行のページと同じ `ideaId`・`blockId`)まで確かめた。
- **E6 の axe**:ホームの「最近の進行」の行の操作(`.lv-home-recent-actions`)は、ホバーまで `opacity: 0.55` という今の見た目のため、進行が 1 つでもあると color-contrast(serious)が出る(この指示書の変更とは関係なし。1024×768 で「練習」ボタンが 3.4:1)。E6 ではそこだけ `exclude` して、ほかの全部を確かめた。
- 新しいファイルの中身を指示された物は無い(コードはワーカーが書く指示)ので、変えた行は無し。
- `practicedDays(opens, via, now)` の `now` は形のとおり受け取るが使っていない(`_now`)。

## 4. 今あるテストで直した行

無し(§5 の B の形も要らなかった。足した項目は任意の props/全部比べている期待が無かった)。

## 5. 新しいテスト

| # | テスト |
|---|---|
| T1 | `practiceOpens.test.ts`「T1: one recorded open reads back the same」 |
| T2 | 同「T2: a broken value reads as empty and a broken entry is dropped alone」 |
| T3 | 同「T3: an open older than 14 days goes on the next write; 13 days stays」 |
| T4 | 同「T4: the 501st open keeps 500, dropping the oldest」 |
| T5 | 同「T5: a failing write never throws」 |
| T6 | 同「T6: counts both practices per progression, …」 |
| T7 | 同「T7: exactly 7 days ago is not counted; 6 days 23 hours is」 |
| T8 | 同「T8: a progression that no longer exists is left out and the next moves up」 |
| T9 | 同「T9: practiced days are this PC's dates, …」 |
| T10 | `practiceWeek.test.ts`「T10: 7 days, oldest first, today last; …」(ほかに 0 時の境目のテスト 1 つ) |
| T11 | 同「T11: Chord Dojo and Bass Practice come from the existing records; …」 |
| T12 | 同「T12: topOpened keeps only progressions still in the Vault, …」「T12: nothing opened means an empty topOpened」 |
| T13 | 同「T13: Voicing Loop opens never change the existing activity」 |
| T14 | `e2e/p23-08-home-records.spec.ts`「T14: opening one of 自分の進行 in the Chord Dojo records it once with that progression」 |
| T15 | `src/components/AppShellTodayDot.test.tsx` の「T15: …」3 つ(ほかに狭いメニューのテスト 1 つ) |
| E1・E2 | `e2e/p23-08-home-records.spec.ts`「E1・E2: …」(Chord Dojo は開いただけでは点が出ないことを確かめる) |
| E3 | 同「E3: the Home's ▶, the Vault and the progression page add nothing」 |
| E4 | 同「E4: the search palette's Ctrl+Enter opens the Voicing Loop and is recorded」 |
| E5 | 同「E5: the records and the dot stay after the app is opened again」 |
| E6 | 同「E6: at 1024×768 (narrow menu) …」 |
| E7 | `e2e/visual.spec.ts`(§6 で回して通った。基準の写真は変わらない) |

## 6. 最後の確かめ

| コマンド | 結果 |
|---|---|
| `npm run lint` | 通った |
| `npm run build` | 通った |
| `npm run test:fast -- src/views/home src/components/AppShell.test.tsx src/components/AppShellTodayDot.test.tsx src/views/chord-dojo` | FAST: PASS(Vitest selected 6607/6609、2 は前からの skip)144.9s |
| e2e(p23-08・p22-03-home・visual・accessibility・keyboard・responsive・p23-07-command-palette と、名前に voicing-loop・dojo・sidebar・shell を含む 21 本) | 283 passed(3.0m) |
| `npm run test:full`(1 回) | FULL: PASS — 877.3s。Vitest full 6607/6609(83.8s)・Playwright full 995/997(2 は前からの条件付き skip、528.3s)・heavy 53/53(264.8s)。落ちた数 0 |

## 7. 写真

`p89-generated/p23-08/nav-dot-1440x900.png`・`p89-generated/p23-08/nav-dot-1024x768.png`(どちらも自分の目で見た。広いときは「Voicing Loop ●」、狭いときは VL のマークの右上に点)。

## 8. P23-09 が使う物

| 名前 | 返す形 | ファイル |
|---|---|---|
| `HomeSummary.topOpened` | `{ progression: HomeProgression; count: number }[]`(最大 3、今ある進行だけ) | `src/views/home/useHomeSummary.ts` |
| `HomeSummary.practiceWeek` | `PracticeWeek` = `Record<"voicing-loop" \| "chord-dojo" \| "bass-practice", boolean[]>`(長さ 7、古い日が先、最後が今日) | `src/views/home/useHomeSummary.ts`・`practiceWeek.ts` |
| `practiceWeek(records, opens, now)` | `PracticeWeek` | `src/views/home/practiceWeek.ts` |
| `useTodayPractised(ideas, practiceFile, now)` | `Record<PracticeWeekKind, boolean>` | `src/views/home/practiceWeek.ts` |
| `loadPracticeOpens()` / `recordPracticeOpen(reference, via, now?)` | `PracticeOpen[]` / `void` | `src/views/home/practiceOpens.ts` |
| `topOpenedProgressions(opens, now, exists)` | `{ ideaId, blockId, count, lastAt }[]` | `src/views/home/practiceOpens.ts` |
| `practicedDays(opens, via, now)` | `Set<string>`(`YYYY-MM-DD`) | `src/views/home/practiceOpens.ts` |

## 9. 気づいたこと(直していない)

- ホームの「最近の進行」の行の操作は、ホバー前 `opacity: 0.55` で color-contrast(serious)になる(上の 3)。今の `accessibility.spec.ts` は進行の無いホームしか測っていないので出ていない。
- Chord Dojo の点は練習の記録(`item.recent`)から作るので、「弾けた」を 1 回押しただけ(項目を終えていない)では出ない。
- 狭いメニューでは、ボタンの読み上げの名前は `aria-label`(名前だけ)が勝つので、「今日弾きました」は読まれない。
- 左メニューの Chord Dojo の点は `dojoStore` の中身から作る。アプリを開いた直後、ホームや Chord Dojo を開くまで `dojoStore` が読み込まれていない間は、Chord Dojo の点は出ない(ホームが最初の画面なので普段は出る)。
