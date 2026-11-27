# P23-25:Bass Practice(選ぶ画面と、練習の画面の上の行)

- ブランチ:`feat/p23-25-bass-practice`(master `1304c375` から)
- コミット:
  - `5101be63` p23-25-01(WIP):選ぶ画面を先に・上の行・P8 の言葉
  - `47af2285` p23-25-02(WIP):練習の画面の単体テスト
  - `8f559bab` p23-25-03(WIP):e2e を `openBassPractice` に・CSS のビルドを直した
  - `42275637` p23-25-04:UI 一覧を緑に・記録の出どころ・C1〜C6(この報告の手前)
  - `15ff54aa` p23-25-05:この報告
  - `3d443a3a` p23-25-06:C4 のテスト名から P8① の字を落とした(1 行)
  - (この報告への追記)
- 結果:指示書の表 P1〜P8 はすべて入った。最後の確かめと FULL は下の「5」「6」。

## 1. 落ちていた e2e 10 件

`8f559bab` の時点で、指示書の一覧を回すと **10 件**落ちていた(4 つの spec)。

| spec | 件数 | 落ちていた理由 | 直し方 | 形 |
|---|---|---|---|---|
| `e2e/phase5.16.1-degree-echo.spec.ts` | 7 | `openDegreeEcho` が `degree-echo-view` の表示を待っていたが、入り口が選ぶ画面になったので隠れている | 選ぶ画面を出し、Degree Echo の札を押してから待つ | A |
| `e2e/phase5.16-production-activation.spec.ts` | 1 | `openBassPracticeFromHome` が `degree-echo-view` を待っていた | 入り口は選ぶ画面なので、最初の札(degree)を見る | B(P1 で入り口が変わった) |
| `e2e/phase13-1-bass-ui.spec.ts`「§5 §11 最後の小節まで届く」 | 1 | `.bass-midi-content` がスクロールしなくなった(枠が縦に伸びた) | 下の「2(1)」の作り直し | 期待は変えていない |
| `e2e/phase13-bass-practice.spec.ts`「MIDI practice geometry…」 | 1 | 1440×900 で `.bass-echo-frame` の下端が 930.5(901 を超える) | 同上 | 同上 |

## 2. 止まらずに直した所(同じ原因・同じ種類)

### (1) 練習の画面の高さ(枠が画面からはみ出していた)

選ぶ画面と練習の画面を包む `div` を足したときに flex の鎖が切れ、`.bass-echo-frame { height:100% }` の基準が決まらなくなって、枠が中身の高さまで伸びていた。**P4 の上の行を足したのと同じ原因**なので、同じ考え方で直した。

- `src/features/bass-practice/ui/BassPracticeModeView.tsx:101,112`:包む 2 つの `div` に `bass-stage`(選ぶ画面側は `bass-home-stage` も)を付けた。
- `src/features/bass-practice/ui/bassPractice.css:6-11`:段を 1 本の縦の列にし、段の中の `.bass-mode-panel` に `flex:1; min-height:0` を返した。`[hidden]` は明示的に `display:none`(クラスで `display:flex` を付けたため)。選ぶ画面の段だけは中でスクロールする。

期待は変えていない。直した後、上の 2 件はそのまま緑に戻った。

### (2) 記録の出どころ(P5:今ある記録から出す)

`bassHomeData` が「練習ごとの 7 日・最後・続きから」を `sessions`(session の `startedAt`)から作っていた。session は練習の画面に入った時点で App が作るので、**まだ何も弾いていないのに「最後: 今日」「続きから」が出る**。P5 の「今ある記録(`src/views/home/practiceActivity.ts`)から出す」に合わせた(`src/features/bass-practice/application/bassHomeData.ts:67-82`)。

- 度数:評価の付いた `attempts`(`rating` があり `completedAt` がある物)
- リズム:`rhythmAttempts`
- ベースライン:`chordContextHistory` + `sourceBasslineHistory`(Home と同じ 2 つ)
- ルートの動き:`rootMotionHistory`
- MIDI:`midiAttempts`

### (3) §6 の色の検査(ホバーの遷移の途中を読んでいた)

枠が画面に収まるようになって縦スクロールバーが消え、札を押した後のポインタが欄の上に残るようになった。`border-color` の 0.12s の遷移の途中(30% ほど)を読んでいたので、ポインタを退けて遷移の終わりを待ってから読むようにした(`e2e/phase13-1-bass-ui.spec.ts:171-173`)。**期待は変えていない**。

## 3. 確かめること C1〜C6

| # | 何を | どこで | 単体/e2e |
|---|---|---|---|
| C1 P1 | 左メニューから選ぶ画面が先に出る | `e2e/p23-25-bass-practice.spec.ts:66` | e2e |
| C1 P2 | 部品に記録から作った値を渡す(札 5 枚・7 日・最後・楽器・続きから) | `bassHomeData.test.ts`、`p23-25-bass-practice.spec.ts:110` | 単体 + e2e |
| C1 P3 | 部品の見た目は小さい直しだけ(props の追加なし) | (コード。直しは無し) | — |
| C1 P4 | 上の行は「‹ Bass Practice」+ 名前 + 札。5 つのボタンの並びは無い | `p23-25-bass-practice.spec.ts:66` | e2e |
| C1 P5 | 続きから・この 7 日・最後は今ある記録から | `bassHomeData.test.ts`、`p23-25-bass-practice.spec.ts:96,110` | 単体 + e2e |
| C1 P6 | Degree Echo は隠しても残る(外すと「途中でやめた」) | `p23-25-bass-practice.spec.ts:144` | e2e |
| C1 P7 | 進行を持って開く・練習を指定して開くは今と同じ所へ | `p23-25-bass-practice.spec.ts:110,165`、`BassPracticeModeView.chordContext.test.tsx:52` | e2e + 単体 |
| C1 P8① | 「目安: 96 BPM」「目安に戻す」 | `BasslinePracticeView.chordContext.test.tsx:798-802,939-940` | 単体 |
| C1 P8② | 録音中に共通 BPM を変えた文に「残していない録音は消えます。」 | `BasslinePracticeView.chordContext.test.tsx:1462` | 単体 |
| C2 | 5 つの練習それぞれへ入り、「‹ Bass Practice」で戻れる | `p23-25-bass-practice.spec.ts:66` | e2e |
| C3 | 出題の途中で選ぶ画面へ戻り、また入ると途中から続く。「途中でやめた」が増えない | `p23-25-bass-practice.spec.ts:144` | e2e |
| C4 | 進行を持って開くと選ぶ画面を飛ばして今と同じ練習に着く | `p23-25-bass-practice.spec.ts:110,165`、`BassPracticeModeView.chordContext.test.tsx:50` | e2e + 単体 |
| C5 | 記録が 1 つも無いとき、続きからは出ない。この 7 日は空の形 | `p23-25-bass-practice.spec.ts:96`、`bassHomeData.test.ts`(空と、file 未読込の 2 件) | e2e + 単体 |
| C6 | 4 つの幅で横にはみ出さない。axe の serious・critical が 0。キー操作が今と同じ | `p23-25-bass-practice.spec.ts:182` | e2e |

C6 の「数字で確かめる」は、4 つの幅(1440×900・1280×720・1024×768・768×640)で、札が画面の中に収まること・札の幅が 140px 以上あること・札どうしが重ならないこと・2 つの列が重ならないこと・`body` が横にはみ出さないことを測っている。キーは選ぶ画面の「?」と練習の画面の「⌨ キー操作」の文が同じであることを見ている(キー自体が効くことは `e2e/phase5.16.1-degree-echo.spec.ts` の「shortcuts ignore form focus」が今も見ている)。

## 4. 写真

`p89-generated/p23-25/` に 8 枚(git で追跡しない)。

- `bass-home-1440x900.png` / `-1280x720` / `-1024x768` / `-768x640`
- `bass-degree-1440x900.png` / `-1280x720` / `-1024x768` / `-768x640`

こちらでは画像を読めないので、形は上の数字で確かめた。写真はレビューで見てもらう。

## 5. 最後の確かめ

```
npm run lint                                PASS
npm run build                               PASS(9.94s)
npm run test:fast -- src/features/bass-practice   PASS 6736/6738(97.3s)
npm run test:ui -- <15 spec>                PASS 77/77(86.6s)
```

`test:ui` の 15 spec は、指示書の名前で 12 本(`p23-06b`・`phase13-1`・`phase13`・`phase5.16-production`・`phase5.16.1`・`phase5.17`・`phase5.18`・`phase5.22`・`p22-03-home`・`visual`・`accessibility`・`keyboard`)、取りこぼしの決まりで足した 2 本(`phase5.19-root-motion`・`phase5.20-text-progression`)、新しい 1 本(`p23-25-bass-practice`)。

取りこぼしを探した `git grep`:

- `セッション既定` → 0 件(消えている)
- `bass-home-card` → `e2e/helpers/app.ts`・`p23-25-bass-practice`・`phase13-bass-practice`・`phase5.16-production-activation`・`phase5.16.1-degree-echo`(全部上の一覧に入っている)
- `bass-practice-home` → `p23-25-bass-practice`・`phase5.16-production-activation`・`phase5.16.1-degree-echo`(同上)
- `bass-modebar` → `p23-25-bass-practice`・`phase5.16.1-degree-echo`(同上)

## 6. FULL

```
npm run test:full   PASS — 905.2s
```

| 段 | 結果 |
|---|---|
| Source contracts / AI handoff / Class lint / Phase docs | PASS(0.1s / 0.2s / 1s / 1.1s) |
| Runner contracts | PASS 40/40(2.5s) |
| Privacy scan | PASS(3.5s) |
| E2E TypeScript | PASS(10.9s) |
| Production build | PASS(20.3s) |
| Repository ESLint | PASS(31.4s) |
| App TypeScript | PASS(40.7s) |
| Vitest full | PASS 6736/6738(82.6s) |
| Gallery | 対象外(excluded) |
| Playwright full(軽い方) | PASS 1047/1049(2 件は既存の条件つき skip、550.9s) |
| Playwright heavy pass | PASS 53/53(271.3s) |
| Git diff check / tracked PNG check | PASS(0 回の開き直り、追跡 PNG の変化なし) |

落ちても直さず・回し直さず、の決まりどおり 1 回だけ回した。

FULL を回した時の HEAD は `42275637`。その最中に、C4 のテスト名からもう見ていない P8① の字を落とした 1 行(`3d443a3a`。名前だけで、確かめている物は変わらない)を足したので、FULL が見た木は `3d443a3a` と同じ(報告の md を除く)。

## 指示書どおりにできなかった所

- **P8① を e2e で確かめていない**。「目安: 96 BPM」は**元ベースライン(`source-bassline`)を選んだとき**だけに出る(`BasslinePracticeView.tsx:213`)。その状態は P5.22 の「元ベースラインを練習用に保存」を作る重い道なので、単体(WIP が直した 2 か所)で確かめた。
- **C4 の「進行のページから進行を持って開く」は、外から開く道がもう無い**。P23-15 H2 で進行のページの練習ボタンが消えており、`ProgressionDetailView` の `openPractice` は渡されているが使われていない。今ある道(Bassline Echo の「Vault から選ぶ」)を e2e で、`chordContextSnapshot` を渡す道(選ぶ画面を飛ばす)を単体で確かめた。
- 写真は 4 サイズの 8 枚だけで、指示書の「写真 4 サイズ」の意味で足りているかは判断した(選ぶ画面と練習の画面を各 1 枚ずつ)。

## 今あるテストで直した行の一覧(この回の分)

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `e2e/phase5.16.1-degree-echo.spec.ts:5-15` | `openDegreeEcho` = アプリを開いて Bass Practice を押し、`degree-echo-view` の表示を待つ | 選ぶ画面(`bass-practice-home`)を出し、Degree Echo の札を押してから待つ | A |
| `e2e/phase5.16.1-degree-echo.spec.ts:19-22` | 練習の画面で rhythm・bassline のタブが見えること | 選ぶ画面で rhythm・bassline の**札**が見えること | A |
| `e2e/phase5.16-production-activation.spec.ts:5-12` | サイドバーから入ると `degree-echo-view` が見える | サイドバーから入ると degree の**札**が見える(入り口が選ぶ画面になった) | B |
| `e2e/phase13-1-bass-ui.spec.ts:168-174` | そのまま色を読む | ポインタを退け、`border-color` の遷移の終わりを待って読む | A |
| `e2e/phase13-bass-practice.spec.ts` | (変更なし) | (変更なし。作りを直して緑に戻した) | — |

WIP の 3 コミット分の直し(`BasslinePracticeView.chordContext.test.tsx` の「セッション既定」→「目安」、`BassPracticeModeView.test.tsx` のタブ → 札、`BassPracticeModeView.chordContext.test.tsx` の `[role='tab']` → `.bass-mode-name`)は `done/P23-25-question-1.md` にある。

## 足したテスト

- `e2e/p23-25-bass-practice.spec.ts`(新規・6 本):C1〜C6。
- `src/features/bass-practice/application/bassHomeData.test.ts`(新規・4 本):C5 と P5。
- `BasslinePracticeView.chordContext.test.tsx:1462`:P8② の「残していない録音は消えます。」を 1 行足した。
- `BassPracticeModeView.chordContext.test.tsx:52`:進行を持って開くと選ぶ画面を飛ばすことを 1 行足した。

## 気づいたこと

1. **誤コミットの戻し方**(作業中に `feat/p23-16-correction-workspace` にコミットしてしまった分):`git switch -c feat/p23-25-bass-practice master` → `git cherry-pick cb6391c8` → `git branch -f feat/p23-16-correction-workspace 3d2ca482` で戻した。`rebase`・`--force`・`reset --hard` は使っていない。
2. **練習の画面の中から左メニューの Bass Practice を押しても選ぶ画面に戻らない**。`openBassPractice()` が `bassPracticeInitialMode` を `undefined` にするだけで、中にいる間は `showHome` が変わらないため。表は「左メニューから開くと選ぶ画面」までなので触らず、報告だけにする。
3. Chord Context の見出しは「セッションのテンポ」のまま。P8① が名指ししたのは「セッション既定」の 2 か所だけなので、表に無い言葉は決めずに残した。
4. 選ぶ画面を出したまま Bass Practice を離れると、App が作った session が「途中でやめた」として 1 件残る(P1 以前の Degree Echo 直行と同じ)。選ぶ画面はまだ練習していないので、記録としては空振り。C3 の「増えない」は「選ぶ画面へ戻って、また入る」の範囲で確かめている。
5. `done/P23-25.md` の `question:` は `done/P23-25-question-2.md` を指しているが、`done\` にあるのは `P23-25-question-1.md` だけだった(2 は見当たらない)。
6. `768×640` では選ぶ画面が 1 列に積まれ(`bassPracticeHome.css:454-462` の 1199px・899px)、札は縦に並ぶ。横のはみ出しも重なりも無いことを数字で確かめた。
