# P23-21:耳で弾く — 選ぶ画面と記録

- ブランチ:`feat/p23-21-ear-choose-records`(QUEUE の 1 番 P23-26 の先頭 `ce90fec2` から)
- コミット:
  - `d3bd9b5d` p23-21-01:`recentPlays`(E13)+ 単体テスト(C4)
  - `5e7afe6a` p23-21-02:選ぶ画面(E1〜E12・E14)
  - `bc949f4f` p23-21-03:記録(R1〜R14)
  - `7484aec1` p23-21-04:新しい e2e(C2〜C10)と `guideNote` の単体(C7)
  - `cff29930` p23-21-05:1280×720 でスクロールなしに収める(E14)
  - (この報告)

## 1. 選ぶ画面(E1〜E14)

- **E1**:上の行 = 戻る・「耳で弾く」・右に説明の 1 行(今の文。薄い字。折り返しあり)。
- **E2**:「問題」を 1 枚の面に。3 つの選び(`ear-source-*`)と同じ行の右に数の文(`ear-count`、今の文のまま)。「自分の進行」のときの `ear-collection` はその下。
- **E3**:「レベル」を 1 枚の面に。5 行は**高さ 46px・行の間 6px**。左から番号の札(26px の角丸。選ぶとアクセントで塗る)・説明・右に例と「n 個」。`role="radio"`・`ear-level-n`・`aria-checked` は今のまま。読み上げ名に個数入り(`レベル 3、セブンス…、88 個`)。
- **E4**:例は 1「C F G Am」/2「Fm G/B Csus4」/3「Dm7 G7 Cmaj7」/4「Dm9 G13 F/G」/5「G7(♭9) CmMaj7」(等幅・薄い色・`aria-hidden`)。1024px 未満では例を隠して個数だけ。
- **E5**:個数は**今選んでいる「問題」と「長さ」で、そのレベルに出せる問題の数**(`availability({...settings, level}, scan)` を 5 回。今の `here` と同じ決め方)。0 は「0 個」を薄く。
- **E6**:長さ・キー・テンポ・詳しい設定を 1 枚の面の 1 行に。「詳しい設定」は行の右端のボタンで、開くと行の下に中身が面の幅いっぱい(`ear-advanced-body`)。中の項目・testid・「初期値に戻す」は今のまま。
- **E7**:そのすぐ下に「始める」の帯。上下の余白 14px・帯は 80px 以下。左に「レベル {n} ・ {m} 小節」と「キーは… ・ テンポ … ・ …から 1 問出します。」、右に `ear-start`(**48px・170px**、`Enter` の札つき)。
- **E8**:お知らせ(`ear-focus`・`ear-reason`)は E6 と E7 の間。
- **E9**:帯の下は空けたまま。
- **E10**:右の列 1 枚目「腕試し」は今のまま。
- **E11**:右の列 2 枚目は見出し「直近の成績」+「記録を見る」(`ear-open-records`、`aria-label="耳の記録を開く"`)。中身は ①今週の 1 行(`ear-recent`、今の文)②直近の 3 問 ③お知らせ。
- **E12**:直近の 3 問は `ear-recent-plays` の `ear-recent-play`。1 枚 = 「[腕試し ・ ]レベル {n} ・ {m} 小節」/「{出題用/定番/自分の}進行 ・ {日付}」/右に一発の割合(等幅・% なし・測れない問題は「—」)。押せない・曲名は出さない。
- **E13**:`recentPlays(records, count = 3)` を `src/domain/earPractice/earStats.ts` に足し、`index.ts` から出した(1 問の時刻 = その問題で一番新しい `at`、割合 = `figuresOf` の `firstTryRate`)。
- **E14**:今と同じ 2 列(左 1fr・右 300px)。**1440×900 と 1280×720 で「始める」まで見える**(720 では面の余白と行間を詰める `@media (max-height: 780px)` を足した)。1024px 未満で右の列が下に回る(今のとおり)。

## 2. 記録(R1〜R14)

- **R1**:上の行 = 戻る・「耳の記録」・右端に薄い字「週は月曜はじまり」。お知らせはその下。
- **R2**:今週の札 5 枚(表をやめた)。見出し「今週」+「先週との差つき。下の線は直近 12 週です。」、右に「測ったコード 今週 {n} ・ 先週 {n}」。testid は札に付け替え(`ear-week-first`・`-clean`・`-sec`・`-nohint`・`-replay`、`data-few` も)。
- **R3**:札 1 枚 = 名前(`help` は `title`)/大きい数字(等幅。単位は小さい字)+ 差(`DiffText`。良くなった = アクセント・悪くなった = 注意)/「先週 {値}」/直近 12 週の細い線(28px・`aria-hidden`・値の無い週は線を切る)。少ないときは数字を薄く。
- **R4**:1 枚目だけ幅を広く(1.25 倍)。5 枚は 1 行、1024px 未満で折り返し。
- **R5**:札の下に今の 2 つの添え書き(`ear-degree-shown`・`ear-sounded`)を今の文のまま。
- **R6**:「レベルの目安」を 5 枚の札に(箇条書きをやめた)。見出しと今の 2 つの説明の文。
- **R7**:札 = 番号と「レベル {n}」・右に状態の札(`stable` =「安定」、`on-track` =「順調」、ほかは出さない)・短い説明・「一発」の棒と数字・「秒数」の棒と数字・「{n}コード ・ 進行 {n} つ」・一言。`stable` は枠をアクセントに。
- **R8**:棒は一発 0〜100%(目安 80% に縦線)、秒数 0〜8 秒(4 秒に縦線、8 秒超は右端)。目安を満たす棒はアクセント・満たさない棒は薄い色。値が無ければ空で「—」。`aria-hidden`。
- **R9**:一言は 5 つの状態(コード 0 / 数が足りない / `on-track` / `enough` / `stable`)で決まりどおり。今の言葉はそのまま残し、足りなかった 2 つ(「あと n コード・進行 n つで…」「目安まで、一発あと n % ・ 秒数あと n 秒です」)を足した(届いている側は書かない)。
- **R10**:週ごとの変化は中身そのまま、見出しの右にレベルの切り替え。
- **R11**:苦手・動きは今のまま(2 列)。
- **R12**:腕試しの記録は今のまま。
- **R13**:記録が無いときは上の行の下に 1 枚の面で今の文(`ear-records-empty`)+ 主のボタン「耳で弾くを始める」(`ear-records-start` → 選ぶ画面)。下の札は今と同じく出す。
- **R14**:`max-width: 1040px` をやめ、中身は `max-width: 1320px`。

## 3. 指示書どおりにできなかった所・見本と違う所

- **E6 の「詳しい設定」**:`<details>` ではなく**ボタン + 下に出る面**にした(行の右端に置いたまま中身を面の幅で下に出すには、`<details>` のままだと中身が行の中に入ってしまうため)。文と testid と働き(開く・閉じる・初期値に戻す)は同じ。走らせると閉じる。
- **言葉は増やしていない**:ボタンの「探し直す」のような言い換えはせず、今の言葉を使った(表に無い言葉を決めないため)。
- それ以外は表のとおり。**今あるテストは 1 行も変えていない**(testid を全部残したので、`e2e/p16-ear-*.spec.ts` はそのまま通った)。

## 4. 今あるテストで直した行

耳で弾くのテストでは **0 行**(形 A・B とも)。ただし FULL の 1 件を直すため、**リードの指示(ANSWER 2)で Chord Dojo の spec の待ち方**を直した(形 C:見本が入るのを待つ)。

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `e2e/helpers/p12.ts:7` | (無し) | `waitForP104Fixture(page, progressions = 1)` を足した(`nav-vault-count` が `1` になるまで待つ=見本が入った印) | C |
| `e2e/p12-theme-score.spec.ts:4` | `play,next,type MidiControl` を import | `waitForP104Fixture` も import | C |
| `e2e/p12-theme-score.spec.ts:7`(`theme()`) | `goto(?p12=midi&p104=theme)` → すぐ Chord Dojo へ | goto の後に `waitForP104Fixture` を挟む | C |
| `e2e/p12-theme-score.spec.ts:20,22,24` | `goto(?p12=no-midi&p104=theme)` → すぐ Chord Dojo へ | 同上(3 か所) | C |
| `e2e/p12-chord-dojo.spec.ts:14` | import に `waitForP104Fixture` 無し | 足した | C |
| `e2e/p12-chord-dojo.spec.ts:192` | `goto(…p104=themeあり)` → すぐ Chord Dojo へ | `fixture==='theme'` のとき待つ | C |
| `e2e/p12-chord-dojo.spec.ts:202` | `goto('/?p12=no-midi&p104=theme')` → すぐ Chord Dojo へ | 待つ | C |
| `e2e/p12-vertical-layout.spec.ts:4` | import に無し | 足した | C |
| `e2e/p12-vertical-layout.spec.ts:22,54` | `goto(?p12=no-midi&p104=theme)` → すぐ Chord Dojo へ | 待つ(2 か所) | C |
| `e2e/p12-vertical-layout.spec.ts:33` | `goto(?p12=midi&p104=theme)` → すぐ Chord Dojo へ | 待つ | C |
| `e2e/p12-dojo-home-layout.spec.ts:3,15` | import に無し / poll の後すぐ Chord Dojo へ | import と待ちを足した | C |
| `e2e/p12-master251-register.spec.ts:9,35` | import に無し / poll の後すぐ Chord Dojo へ | import と待ちを足した | C |

期待(`Dm9 G13 Cmaj9`)は変えていない。**待ち時間を延ばしたのではなく、条件(見本が入った印)を待つ**直し。


## 5. 確かめること(C1〜C10)

| # | 単体/e2e | テスト |
|---|---|---|
| C1 E1〜E14 | e2e | `e2e/p23-21-ear.spec.ts`「C1/C2/C5/C10: the choosing screen keeps its items and its sizes」「C3…」「C4/E12…」 |
| C1 R1〜R14 | e2e | 同上「C6/C8: the records screen…」 |
| C2 | e2e | 同上(レベルの行 5 つが 46px±1・`ear-start` が 48px±1・幅 160〜180・帯 80px 以下) |
| C3 | e2e | 「C3: the five level counts follow the source and the length」(4 小節と 8 小節で個数が変わり、選んでいるレベルの個数が `ear-count` の n と同じ) |
| C4 | 単体 + e2e | `src/domain/earPractice/earRecentPlays.test.ts`(同じ `play` がまとまる/新しい順/3 つまで/腕試しの印/測れない問題は割合なし)・e2e「C4/E12…」(1 問のあと札が 1 つ増える) |
| C5 | e2e | 同上(1440×900・1280×720 で `ear-start` の下端が窓の中) |
| C6 | e2e | 「C6/C8…」(5 枚の値が選ぶ画面の今週の一発と同じ・細い線の点の数 = 値のある週の数) |
| C7 | 単体 | `src/views/ear-practice/earGuideNote.test.ts`(5 つの状態の札と一言) |
| C8 | e2e | 「C6/C8…」(空のときの文と「耳で弾くを始める」→ 選ぶ画面) |
| C9 | e2e | 「C9: four widths, axe and the keys on both screens」(4 幅ではみ出さない・axe の serious/critical 0(選ぶ画面と記録)・Tab の順・Enter/Esc) |
| C10 | e2e | 「C1/C2/C5/C10…」(下の表の項目と testid を 1 つずつ) |

### C10:直す前の項目と後の画面

| 前 | 後 |
|---|---|
| 問題(出題用/定番/自分の進行・`ear-count`・`ear-collection`) | 同じ面の中に同じ testid で |
| レベル 5 つ(`ear-level-n`・`data-on`) | 低い行 5 つ。testid・`role`・`data-on` は同じ |
| 長さ(`ear-length-4/8/16`)・キー(`ear-tonic`)・テンポ(`ear-bpm`) | 同じ面の 1 行 |
| 詳しい設定(度数 `ear-show-degrees`・1つ目 `ear-first-name`・自動 `ear-autoplay`・追加 `ear-extra`・`ear-settle`・時計 `ear-show-clock`・初期値に戻す) | 同じ項目・testid(開き方が button) |
| 始める(`ear-start`) | 帯の中の同じ testid |
| 苦手のお知らせ(`ear-focus`・`ear-focus-clear`)・理由(`ear-reason`) | 同じ |
| 腕試し(`ear-benchmark-card`・`-last`・`-soon`・`-start`) | 同じ |
| 今週の成績(`ear-recent`)・記録を開く(`ear-open-records`)・お知らせ(`ear-records-notice`) | 見出し「直近の成績」+ 同じ testid + 直近の 3 問(`ear-recent-plays`・`ear-recent-play`)を足した |
| 記録:今週の表(`ear-week-first` など 5 行) | 5 枚の札(`ear-week-*` は同じ testid) |
| 記録:レベルの目安(箇条書き・`ear-guide-n`・`data-state`) | 5 枚の札(同じ testid・`data-state`) |
| 記録:週ごとの変化・苦手・動き・腕試し・2 つの添え書き・空の文・レベル切り替え | 同じ testid・同じ文 |

## 6. 幅ごとの数字(測った物)

- 1440×900・1280×720:`ear-start` の下端が窓の中(1280×720 は面の余白と行間を詰めて収めた。詰める前は 726px で 6px はみ出していた)。
- 4 幅(1440×900・1280×720・1024×768・768×640):選ぶ画面・記録(空/記録あり)とも横にはみ出さない(`assertNoHorizontalOverflow`)。レベルの行は 5 つとも 46px±1、`ear-start` は 48px±1・幅 160〜180、帯は 80px 以下。

## 7. 最後の確かめ

```
npm run lint                                             PASS
npm run build                                            PASS(8.34s)
npm run test:fast -- src/domain/earPractice src/views/ear-practice   PASS 6753/6755(2 は既存の条件つき skip、107.8s)
npm run test:ui -- <14 spec>                             PASS 121/121(178.7s)
```

`test:ui` の一覧は、名前に `ear` を含む 8 本(`e2e/p16-ear-a11y`・`-degrees`・`-keyboard`・`-practice`・`-records`・`-score`・`-timing`・`e2e/p23-21-ear`)と `jazz-progressions`・`p20-resume-kinds`・`visual`・`accessibility`・`keyboard`・`responsive`。

取りこぼしは、変えた testid(全部そのまま)・変えた文字(無し)・**部品の種類**(`<details>` → ボタン、表の行 → 札)を `git grep` で洗い、`summary` を探すテストが無いこと・`ear-week-*` を使うテストが testid だけを見ていることを確かめた。基準の写真は無い(耳の画面に基準の写真は無い)。

## 8. FULL

**2 回回して、2 回とも別の所で落ちた**(1 回目は既知の不安定性、ANSWER の指示で直してから 2 回目)。

### 1 回目(22:02、ブランチ `ce4a9e25`)

`npm run test:full` — **FAIL**(heavy pass で 1 件、269.4s)。静的・Vitest(6753/6755)・軽い方(1056/1058)は PASS。

- `e2e/phase13-1-bass-ui.spec.ts:104`「P13.1 §1 §10 result without scroll and primary actions 1440」
  `expect(locator).toContainText() failed` — `midi-bass-result` に「余分な音 1」を待ったが実際は「余分な音 2」。

**前から記録のある不安定性**だった(同じファイル・同じ行・同じ「余分な音 1 を期待し 2」):

- `docs/phase12.0/reports/chord-dojo-long-final-hardening.md`:「master でも既に再現し、別ブランチ `fix/p13.1-bass-recording-flake` で調査・修正済みの不安定性と症状が一致する」
- `docs/phase12.0/reports/chord-dojo-display-judge-consistency.md` の表:「P13.1 Bass録音結果 1440 | 余分な音1を期待し2 | masterでも報告済みの既存不安定性と同じ症状」
- `fix/p13.1-bass-recording-flake`(`6273a9c4`)は作られていたが master には入っていなかった。

ANSWER(QUEUE 2 番)の案 1 にしたがい、リードの指示として取り込んだ:

- master(`<作業フォルダ>\Loop Vault-dev`、`66f60528`)に `git merge --no-ff fix/p13.1-bass-recording-flake -m "merge: P13.1 synthetic microphone shares the recorder's clock (known heavy flake)"` → `b032215c`(ぶつからず)
- このブランチに `git merge --no-ff master -m "merge: master (P13.1 flake fix) into P23-21"` → `65dd3838`(ぶつからず、rebase なし)
- 取り込まれた物:`e2e/helpers/bass-ui.ts`・`e2e/bass-recording-integrity.spec.ts`(新規)・`src/features/bass-practice/midi/analysis.test.ts`・`docs/phase13.1/reports/P13.1-recording-flake-investigation.md`(アプリのコードは変わらない)

### 2 回目(23:03、ブランチ `65dd3838`)

`npm run test:full` — **FAIL**(Playwright の軽い方で 1 件、563.2s)。Vitest 6756/6758 は PASS。**phase13-1 の 1 件は再発しなかった**(直しが効いた)。

- `e2e/p12-theme-score.spec.ts:7`(`theme()` の `toContainText`)「Score reserved area retains keyboard position when answer is hidden and revealed」
  `Locator: getByTestId('dojo-theme')` / 期待 `Dm9 G13 Cmaj9` / 実際 `連…の 曲の… テーマ・ C G Am7`
  = `?p12=midi&p104=theme` の見本のテーマが当たらず、別のテーマが出ている。

これは P23-21(耳の画面)とも P23-26(設定・曲のページ)とも関係の無い Chord Dojo の spec。同じ症状の記録は `docs/` には無かった(こちらの `git grep` の範囲)。**ANSWER の「別の spec で落ちた → いつもどおり止まる」にしたがい、直さず・回し直さず、ここで止める。**

**この 1 件は、この状態で新しく出た物**(同じ日の前の FULL 4 回では `p12-theme-score` は 1 度も落ちていない: 1047・1049・1051・1056 passed のいずれにも出てこない)。

見立て(調べた事実だけ):

- `?p104=theme` の見本は、`App.tsx` の effect が **`loadStatus === "ready"` の後に動的 import で** Vault に入れる(`defaultVaultStore.setState`)。
- `e2e/p12-theme-score.spec.ts` の `theme()` は、`goto` → Chord Dojo へ → `dojo-home` が見える → `settlePaint` → **すぐに** `dojo-theme` が `Dm9 G13 Cmaj9` を含むことを見る。**見本が入るのを待つ印が無い**。
- 取り込んだ直しは `e2e/helpers/bass-ui.ts` と新しい spec 1 本だけで、Chord Dojo の見本・テーマには触れていない。新しい spec が 1 本増えたことで軽い方の割り振りが変わり、**この待っていない競合**が出た可能性が高い。

直すかどうか(見本が入るまで待つ等)はリードが決める。こちらは ANSWER の「別の spec で落ちた → いつもどおり止まる」にしたがい、触っていない。

**同じ `?p104=theme` を使う他の spec との違い**(直し方の参考。こちらでは触っていない):

- `e2e/p12-chord-dojo.spec.ts:192`・`p12-vertical-layout.spec.ts:22,33,54`・`p12-theme-score.spec.ts:20,22,24` などは、`goto` の後に **`practice-start` が見えるまで待つ**(= 見本が入るまで待つ)か、`expect.poll` で `goto` をやり直している。
- 落ちた `p12-theme-score.spec.ts:7` の `theme()` だけが、`dojo-home` が見えた直後に**テーマの文を直接**見ていて、見本が入るのを待っていない。
- したがって「見本が入るまで待つ」(他の spec と同じ形)で直る見込みが高いが、**ANSWER の「別の spec で落ちた → いつもどおり止まる」にしたがい、こちらでは直していない。**
## 9. 写真

`p89-generated/p23-21/`(git で追跡しない)。12 枚。

- `choose-{1440x900,1280x720,1024x768,768x640}.png`
- `records-empty-{…}.png`(記録なし)
- `records-{…}.png`(1 問ぶんの記録あり)

画像は読めないので、形は上の数字で確かめた。

## 10. 次の指示書(P23-23)が使う物

- `recentPlays`(`src/domain/earPractice/earStats.ts`、`index.ts` から出る)
- 選ぶ画面の `ear-level-*`・`ear-count`・`ear-start`・`ear-advanced-body`・`ear-recent-play(s)`
- 記録の `ear-week-*`・`ear-guide-*`・`ear-records-start`・`ear-records-empty`

## 11. 気づいたこと(直していない)

1. 1280×720 は元の並びでも「始める」が 6px はみ出していた(面を 1 枚ずつ足したため)。短い窓だけ詰める規則を足して収めた。1440×900 の見た目は変えていない。
2. レベルの例(「G7(♭9)」など)は飾りなので `aria-hidden`。読み上げは `aria-label`(レベルと説明と個数)で行う。
3. 記録の「今週の札」は幅 1.25 倍の 1 枚目を含めて 5 枚 1 行。1024px 未満で 2 枚ずつに折り返す。
4. 「詳しい設定」をボタンにしたので、`<details>`/`summary` を探す既存テストがあれば直しが要るが、耳の画面には無かった。
### 3 回目(ANSWER 2 の形 C を入れた後)

`npm run test:full` — **PASS — 863.3s**。

| 段 | 結果 |
|---|---|
| Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 / Privacy scan | PASS |
| E2E TypeScript / Production build / Repository ESLint / App TypeScript | PASS(7.5s / 15.1s / 21.1s / 25.7s) |
| Vitest full | PASS 6756/6758(71.1s、2 件は既存の条件つき skip) |
| Gallery | 対象外 |
| Playwright full(軽い方) | PASS 1061/1063(2 件は既存の条件つき skip、530.6s) |
| Playwright heavy pass | PASS 53/53(261.2s) |
| Git diff check / tracked PNG check | PASS(開き直り 0 回、追跡 PNG の変化なし) |

直した 5 つの spec は、FULL の前に 1 回ずつ回して通した(93/93 と 15/15)。