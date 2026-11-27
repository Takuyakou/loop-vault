# VL-13: Voicing Loop の直し2つ(報告)

対象: `fix/vl-13-voicing-loop`(master `4bddd3c4` から)。**master へのマージ・push はしていない。**
A: MIDI キーボードの音 / B: 全体の棒(進行タイムラインの横)の動き。

---

## A. MIDI キーボードを弾いた音を鳴らす

### A-1. 原因の確認(見立てどおり)

コードを読んで確認した。

- `src/views/ProgressionVoicingPracticeView.tsx` は **`useMidiConnection` だけ**を使い、`startDojoPianoInput` / `useDojoMidi` を一度も使っていなかった。
- 鍵盤の音を鳴らす部品は `startDojoPianoInput`(`src/views/chord-dojo/midiInput.ts`、サンプルのピアノ)と、それを包む `useDojoMidi`。使っているのは Chord Dojo(定番・エンドレス・Master 2-5-1・Original/Jazz)と耳で弾く(`EarRun`)だけだった。
- したがって「壊れた」のではなく、**Voicing Loop に最初から配線が無かった**。見立てどおり。

### A-2. 変えたもの

- `ProgressionVoicingPracticeView.tsx`
  - `useMidiConnection()` を **`useDojoMidi(progressionLoaded)`** に置き換え、`view` をそこから取る。接続の購読は1つ。
  - `muted` は指定しない(= `false`)。**ループの再生中も鍵盤の音が鳴る**。
  - 音は `useDojoMidi` のサンプル・ピアノ(`midiInputPianoMonitor`)。上部のピアノ/エレピの切り替えは今までどおりループの音だけ。
  - 画面のどこかを押したら `prepareAudio()`(練習画面と、進行を選ぶ画面の両方のルート)。再生ボタン/スペースでも `prepareAudio()`。
  - 読み込みに失敗したときは、画面上部に Chord Dojo と同じ知らせ:
    「入力のピアノ音を開始できませんでした」「入力の判定は続けられます。」+ **「入力音をもう一度」**(`retryAudio`)。
    `StatusMessage`(warning)を使い、画面の状態は `data-midi-audio` で分かる。
  - 画面を出たら `useDojoMidi` の後始末でモニターを閉じる。
- `src/views/chord-dojo/midiInput.ts`
  - 動き(ペダル・同じ音の押し直し・機器の交換・ミュート)は変えていない。
  - **テスト用の記録だけ**追加: フィクスチャ(`__dojoMonitorCount` がある時)に、モニターへ渡した最後の音を `__dojoMonitorNotes` として残す。音の処理そのものは変えていない。
- `src/testing/p12DojoFixture.ts`
  - フィクスチャに `__dojoMonitorNotes: []` を追加。
- `src/views/chord-dojo/midiInput.test.ts`
  - 上記の記録の単体テストを追加(jsdom)。

### A-3. 変えていないこと

Voicing Loop のループ再生・音色・判定・表示。Chord Dojo・耳で弾く・Live MIDI(Live MIDI のボイシング取り込み)の鍵盤の音。MIDI の接続/切断の状態機械。

### A-4. テスト

新規 e2e `e2e/vl-13-voicing-loop.spec.ts` の A(8件)はすべて PASS。

1. 音を押すと `__dojoMonitorNotes` に届き、離すと空になる。
2. ループ再生中でも押した音が届く(開始 →「一時停止」表示中に確認)。
3. 機器を外すとモニターが 0 になり、つなぎ直すと 1 に戻る。
4. Voicing Loop → Chord Dojo → Voicing Loop と移っても `__dojoMonitorCount` は 1。
5. mp3 を止めた状態で開くと知らせと「入力音をもう一度」が出て、止めるのをやめて再試行すると消えて `data-midi-audio="ready"`・モニター1になる。
6. **A-6**: 音がまだ止まっている状態(`suspended`)では、Chord Dojo の e2e が見るのと同じ `data-midi-audio` の状態になる。画面(MIDI 入力の行)を押すと `ready` になり、次の C4 がモニターに届く。
7. **A-8**: C4 を押したまま Voicing Loop → Chord Dojo → Voicing Loop と移る。どちらの向きでも、移った先のモニターは1つだけ・押したままの C4 では新しいアタックが起きず(`__dojoMonitorNotes` は空)、離して押し直すと鳴る。stop・dispose 自体は既存の `midiInputPianoMonitor.test.ts`(dispose が `releaseAll` と `sampler.dispose` を呼ぶ)と `midiInput.test.ts`(close が dispose を呼ぶ)で確認済み。
8. **A-9**: C4 を押したまま機器を外すとモニターは 0、つなぎ直すと 1 だが、前の C4 は残らず(`__dojoMonitorNotes` は空、新しいアタックも無い)、押し直すと鳴る。

単体は `src/views` / `src/liveMidi` / `src/audio` / `src/components/timeline` の **625/625 PASS**(追加した記録のテストを含む)。既存 e2e(下の B と合わせた 115 件)も PASS。

---

## B. 全体の棒を、再生に合わせて滑らかに進める

### B-1. 変えたもの

`ProgressionVoicingPracticeView.tsx` の `navigator` まわりだけ。

- 塗りの span に `ref` を付け(`navigatorFillRef`)、毎フレームの `paint` で、**白い線と同じ値** `position.progressionBeat / snapshot.lengthBeats` を幅に入れる。React の再描画には頼らない。
- **明るい帯(今のまとまり)を削除**した。まとまりごとに飛ぶ原因だったため。今どのまとまりかは、下のタイムラインのカードの光り方と「コード 7/14」で分かる。
- 止めているとき・カウントイン・シーク・区間ループ・ループの先頭戻りも、すべて同じ `paint` で白い線と同時に同じ値になる(後ろ向きに伸び縮みしない)。
- `prefers-reduced-motion` でも同じ扱い(白い線と同じ)。
- 下のタイムラインの再生位置・追従・まとまりの印(`currentGroup` を使う所)は**変えていない**。「コード ◯/◯」「◯周完了」の数え方も変えていない。

### B-2. テスト

新規 e2e の B(6件)はすべて PASS。

1. 再生中、**塗りの幅と白い線の位置の差が 1% 以内**。4拍のまとまりの途中(境目から先)でも塗りが増えている。
2. 一時停止したとき、ナビゲータをクリックしてシークしたときも、塗りと白い線が同じ位置。ナビゲータの直下の span は塗りの1つだけ(明るい帯が無い)。
3. ループで先頭に戻ると、塗りも先頭から(白い線と同じ瞬間)。
4. 区間ループでも塗りは白い線と同じ位置で、区間の外へは進まない。
5. **B-1b**: 再生中に 250ms おきに塗りと白い線を**同じ evaluate で**読み、まとまりの境目をまたいでも塗りが減らずに増え続ける(最初と最後で +5% 以上、またいだまとまりが2つ以上)。各回のずれは 1% 以内。ループ先頭戻りは範囲外(80% で止める)。
6. **B-1c**: 再生中に表示の 8(および長い曲で 12・16)と追従を押して描き直しても、塗りは前のまとまりの境目(50%)へ戻らず、白い線と同じ位置のまま(52% より手前なら失敗)。

既存の `e2e/p5-26-2-voicing-navigator.spec.ts`(フレーム・クリック・ドラッグ・頭の毎フレーム更新・要素数)、`phase11-range-loop.spec.ts`、`phase5.27` / `phase5.28`、`p14-midi-connection.spec.ts`、`p12-chord-dojo.spec.ts`、`p16-ear-practice.spec.ts` の **115/115 PASS**。

---

## C. `npm run test:full`

**PASS** — Vitest **6259/6261**(2 skip は既存)、Playwright **784/786**(2 skip)、Git diff check を含む他の全ゲート PASS(619.4s)。ログ: `.local-evaluation/test-logs/2026-10-25T17-05-35-916Z-full.log`。

- FULL は製品コードを変える前(この5件を足す前)の実行。追加した5件は個別の e2e で確認し、製品コードは変えていないので FULL は再実行していない(指示どおり)。
- 追加5件を足した後の関係 e2e: `e2e/vl-13-voicing-loop.spec.ts` **14/14**、`e2e/p5-26-2-voicing-navigator.spec.ts` **4/4**、`e2e/p14-midi-connection.spec.ts` **27/27** の合計 **45/45 PASS**。
- FULL の中で P17-01 / P17-02 の画面写真も撮り直されたため、生成物だけ更新した(コード・レポートの内容は変えていない)。

---

## D. 画面写真(`docs/reports/vl-13/`)

- `midi-connected-1440x900.png` — MIDI 接続中の Voicing Loop(1440×900)
- `midi-status-1440x900.png` — 画面内の「MIDI 入力：合成入力」の拡大
- `midi-audio-error-1440x900.png` — 音の読み込みに失敗したときの知らせと「入力音をもう一度」
- `navigator-playing-1440x900.png` — 再生中(まとまりの途中)の棒の拡大。塗りが白い線と同じ所まで伸びている

---

## E. 停止

ここで止まる。実機で、ループに合わせて MIDI を弾いて音が出るか、棒が滑らかに進むかを確かめてください。
