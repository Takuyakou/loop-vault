# P23-22:耳で弾く:判定の形(試した形を残す・判定を部品に)

- ブランチ:`feat/p23-22-ear-judgement`(master `50e3bf07` から)
- コミット:
  - `0d177353` p23-22-01: the judgement, the tried shapes and the two answer sounds(J1〜J3)
  - `02254681` p23-22-02: tests(C1〜C4)
  - (この報告)`p23-22-03: report`
- **FULL を 1 回**回しました。結果は **FAIL**(下)。決まりどおり、直さず・回し直さずに止まります。

## やったこと(決まりごと)

- **J1 判定を部品に**:`src/domain/earPractice/judgement.ts` を新しく作り、`judgeEarAnswer(target, played)` を置いた。返す物は、今までの判定(`EarVerdict`)に加えて、**余分な音の一覧**・**足りない音の一覧**・**一番下の音が違うか**・**何も押していないか**。言葉(`message`)と `ok` は今までの `earJudge` のまま(中で呼んでいる)。画面(`EarRun`)は今までどおり `EarSession.answer()` を使い、その中がこの関数を呼ぶように替えた。**画面の出る物は変わらない**。
- **J2 試した形を残す**:`EarSession` に `triedForms` を足した。外した形(押した音・そのときの言葉・いつ)を新しい順に 3 つまで、続けて同じ形は 1 つにまとめる。**次の問題へ進むと空**。この実行の中だけの物で、ファイルにも localStorage にも残さない。MIDI なし(自分で判定)では `answer()` を通らないので何も覚えない。画面にはまだ出していない。
- **J3 鳴らし方の土台**:`src/views/ear-practice/earPlayback.ts` に `answerListenNotes(answer, mode, options)` と `playAnswerListen(play, id, answer, mode, options)` を足した。`mode` は `"chord"`(全部)・`"bass"`(いちばん低い音だけ)・`"spread"`(下から 1 音ずつ)。`playAnswerListen` はセッションに触らないので、**聴いた回数を数えない**。画面のボタンとキー(B・A)は足していない。
- **J4〜J6**:記録の形と数え方・MIDI なし/腕試しの動き・テンポ(共通 BPM と別)は、どれも変えていない。

## 指示書どおりにできなかった所

1. **ブランチを作らずに作業を始めてしまった**(手順の誤り)。P23-22 のコミットが一時的に `feat/p23-15-progression-header` に載りました。すぐ直しました:`feat/p23-22-ear-judgement` を master `50e3bf07` から作り、2 つのコミットを移し(`0d177353`・`02254681`)、`feat/p23-15-progression-header` は元の `14a56e93` に戻しました。
2. **21 本の e2e で 1 本だけ落ちました**(Question に書いて、ANSWER で案 A をもらった物)。`e2e/dojo-display-judge.spec.ts`「MIDI reconnect during tempo clears the old input Target and a new round accepts all answers」が `Expected "0:tempo:0:1" / Received "0:tempo:0:5"`。**この spec だけなら、ブランチも master も 9/9 PASS**。落ちたのは 21 本同時(高負荷)のときだけでした。直さず、回し直していません。
3. **FULL が 1 件で落ちました**(下の「最後の確かめ」)。決まりどおり直さず・回し直さずに止まります。

## 今あるテストで直した行

**無し。**(unit 6728/6730 で、耳・Dojo の今あるテストは全部そのまま通っています)

## 確かめること(番号ごと)

| # | どこで確かめたか | テストの名前 |
|---|---|---|
| C1 | 単体 `src/domain/earPractice/judgement.test.ts` | `C1 reads a right answer as right, without extra or missing notes` / `C1 names the note that was extra` / `C1 names the note that was missing` / `C1 reads a wrong bass as wrong with the notes themselves in place` / `C1 does not mind the octave of the same notes` / `C1 says nothing was played`(6 件) |
| C2 | 同上 | `C2 keeps the same words as the judgement for every setting and answer`(8 つのコード × 3 つの判定の形 × 7 つの押し方で、`earJudge` と同じ言葉・同じ `ok`、一覧と言葉が食い違わないこと) |
| C3 | 単体 `src/domain/earPractice/earSession.triedForms.test.ts` | `C3 keeps the last three, newest first, with a repeat folded into one` / `C3 keeps the words the judgement said at that moment` / `C3 leaves a right answer out of the shapes` / `C3 empties the shapes when the next card comes` / `C3 keeps nothing without a MIDI keyboard (the player judges)`(5 件) |
| C4 | 単体 `src/views/ear-practice/earAnswerListen.test.ts` | `C4 sounds only the lowest note for 「ベースだけ」` / `C4 sounds the notes one at a time from the bottom for 「ばらして聴く」` / `C4 still sounds the whole chord when asked` / `C4 counts no listen when the shapes are sounded through the answer helper`(4 件) |
| C5 | `npm run test:fast -- src/views/chord-dojo src/domain/chordDojo src/domain/earPractice src/views/ear-practice`(既存テストそのまま) | 6728 / 6730 PASS(2 は前からの skip) |
| C6 | e2e の使い捨ての手順で、master と**同じ合成データ・同じ大きさ**で撮って比べた(下) | 3 画面 × HTML と画像 |

### C6 の数字

- 撮り方:1440×900。`page.clock.install` で時計を止め、`Math.random` を固定の並びにして**同じ問題**(`bank:L1-4-03`)が出るようにした。master(`<作業フォルダ>\Loop Vault-dev`)とブランチ(`<作業フォルダ>\Loop Vault-p23`)で同じ手順を 1 回ずつ。
- **HTML**:聴く・弾く・結果の 3 画面とも **master と同じ**(文字数まで同じ)。比べる前に、開発用の実測値 2 つ(`data-clock-spread-ms`・`data-output-latency-ms`。毎回変わる)だけを外した。
- **ピクセル**:結果の画面は **差 0**(1440×900・1280×720・1024×768・768×640 の 4 枚中、比べた 1440 で 0 ピクセル)。聴くが **80 ピクセル**、弾くが **76 ピクセル**だけ違い、その差は **1 か所**(x 1384〜1400・y 57〜70)に全部入っていた。
- その場所にある物(`document.elementFromPoint(1392, 63)` で調べた):**`button.lv-level-meter`(「試聴レベル: 42% / 再生中の音を停止」)**。ヘッダーの音量の所にあり、`ear-run` の**外**。録音レベルの実測値なので毎回変わる。`ear-run` の中は同じだった。

## 最後の確かめ

| コマンド | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS(`✓ built in 12.69s`) |
| `npm run test:fast -- src/views/chord-dojo src/domain/chordDojo src/domain/earPractice src/views/ear-practice` | PASS — Vitest **6728 / 6730** |
| `npm run test:ui --`(名前に `ear`・`dojo` を含む spec 18 本 + `visual`・`accessibility`・`keyboard`) | **1 failed / 20 passed の spec**(テスト数では 1 件だけ失敗)。落ちたのは `dojo-display-judge`(上の 2)。単独では 9/9 PASS |
| `npm run test:full`(1 回) | **FAIL** — `FULL: FAIL — Playwright full exited 1`(522.7 秒)。Vitest **6728/6730 PASS**、Playwright full **1027 passed / 1 failed**、**heavy は未実行**(runner が止まったため) |

- 落ちたテスト(FULL):
  - spec:`e2e/p5-26-1-ui-fixes.spec.ts:82`「02 the editor scrolls and does not push sideways › a long saved progression: no sideways overflow from 1440 down to 320, and everything is reachable」
  - 出た文:`480px page column` — `Expected: <= 1` / `Received: 23`(`83` 行)
  - 私が変えた 3 つのファイル(耳の判定・耳の記録・耳の鳴らし方)は、この画面を使っていません。直さず・回し直さずに止まりました。
  - そのあと、**この spec だけを回して確かめました**:ブランチで **1 failed**(同じ `Expected: <= 1` / `Received: 23`)、**master(`50e3bf07`)でも同じく 1 failed**。つまり P23-22 の変更ではなく、**master にすでに入っている物**(P23-15 の merge のあと)で赤くなっています。くわしくは `QUESTION.md` に書きました。

## 写真

`p89-generated/p23-22/branch/`(git に入れない):`listen-{1440x900,1280x720,1024x768,768x640}.png`・`play-*.png`・`result-*.png`(結果は `photos-result-*.png` も)
- **目視について**:このセッションのモデルは画像を読めないため、写真を「見た」とは書けません。形は C6 の数字(HTML 同一・ピクセル差の場所)で確かめています。

## 次の指示書(P23-23)が使う物

- `import { judgeEarAnswer } from "../../domain/earPractice/judgement"` → `judgeEarAnswer(target, played)`
  - 返す物:`{ ok, message, extra: number[], missing: number[], bassWrong: boolean, empty: boolean }`(`extra`・`missing` は**音名の番号(ピッチクラス)**、小さい順)
- `EarSession.triedForms: EarTriedForm[]`(`{ notes: number[], message: string, at: number }`、新しい順・最大 3・次の問題で空)
- `import { answerListenNotes, playAnswerListen, type EarAnswerListenMode } from "../ear-practice/earPlayback"`(画面側は `./earPlayback`)
  - `answerListenNotes(answer, mode: "chord" | "bass" | "spread", { chordBeats, spreadBeats?, startBeat? })` → `{ notes: MidiPreviewNote[], endBeat: number }`
  - `playAnswerListen(play, id, answer, mode, options)` → `EarPlayHandle`(聴いた回数を数えない)

## 気づき

- 押している音の札(余分は赤・足りないは点線)を P23-23 で出すとき、`extra`・`missing` は**ピッチクラス**なので、鍵盤の鍵を赤くするには「答えの音のうち、その音名の物」を選ぶ必要があります(今の鍵盤は音名ごとに色を付ける作りです)。
- FULL の落ちたテスト(`p5-26-1-ui-fixes` の 480px の横はみ出し)は、私の変更と無関係に見えます。負荷で揺れるのか、前から出るのかは、リードの判断が要ります。
