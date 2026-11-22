# P22-03: ホーム(「続きから」を最後の練習の続きにする+微調整)

- ブランチ: `feat/p22-03-home`(master から)。コミット `4a18d15f`(実装とテスト)、この報告のコミット
- ベース: master に P22-01・P22-02 が入っていなかったので、まず **ローカル master へ fast-forward でマージ**しました(`master` = `6c28baaa` → `ceee1d8e` → `a6307197`)。master の履歴は一直線のまま(マージコミット無し)です。master への追加のマージ・push はしていません。

## 0. 今の作り・最初にやったこと

- ホームの集計は `src/views/home/useHomeSummary.ts` の `deriveHomeSummary`、画面は `src/views/HomeView.tsx`。写真は 5 つのサイズ × 3 つの状態(進行 0 件 / 進行あり・記録なし / 進行あり・記録あり)を `p89-generated/p22-03-home/before/` に撮りました(下の「写真」)。
- **Bass Practice の記録から「最後にやった日時」と「どの練習か」が取れるか**(§0-2): **取れます**。
  - `practiceFile.attempts`(評価のあるもの)の `completedAt` → Degree Echo
  - `practiceFile.rhythmAttempts` の `completedAt` → Rhythm Echo
  - `practiceFile.chordContextHistory` の `completedAt` → Bassline Echo(コード・コンテキストは Bassline Echo の中で開く)
  - `practiceFile.rootMotionHistory` の `completedAt` → Root Motion Echo
  - `practiceFile.sourceBasslineHistory` の `completedAt` → Bassline Echo
  - `midiAttempts` の `completedAt` → MIDI のベースライン
  - どの記録にも日時があり、記録の種類で練習が分かります(`chordContextHistory`・`sourceBasslineHistory` は Vault の reference も持ちますが、今回は使いません)。日時の無い記録(未完了)は候補にしません。

## 1. 「続きから」を最後の練習の続きにする

- 新しい覚え書き `src/voicingPractice/lastPractice.ts`(`loop-vault:voicing-loop-last:v1` に `{version:1, reference:{ideaId,blockId}, at}`)。`recentProgressions.ts` と同じ作り(try/catch・壊れた値は「なし」・手書きの検査)で、**書くのは Voicing Loop の練習画面が開いたとき**(`App.tsx` の `openProgressionVoicingPractice`、`recordRecentVoicingLoopProgression` を呼んでいる同じ場所)。Vault・練習の記録・書き出しには入れていません。単体テスト 4 件。
- `src/views/home/useHomeSummary.ts`: `deriveHomeSummary` に 2 つの入力(`voicingLast`・`dojoRecent`)を足し、**3 つの候補のうち日時がいちばん新しいもの**を返すようにしました。`localStorage` を読むのは `useHomeSummary`(フック)だけで、`deriveHomeSummary` は純粋なままです(テストで差し替え可能)。
  - Voicing Loop: `lastPractice` の `at`。進行が Vault に無ければ候補にしない。
  - Chord Dojo: `dojoRecent` の一番新しい項目の `at`。項目が消えている(進行が削除・知らない id)なら候補にしない。
  - Bass Practice: `src/views/home/practiceActivity.ts` に足した `latestBassPractice()`。日時と練習の種類を返す。
  - **候補が 1 つも無いときは今までどおり**:`activity.latest` が指す進行 → 最後に編集した進行(`via: "edit"`)。
- 出し方(`HomeView.tsx`):箱の場所・大きさ・「続きから」の見出しは今のまま。
  - Voicing Loop: アイコン + 「Voicing Loop ・ 日付」、大きな字=進行の名前、キー・BPM・小節数(今と同じ)、コードの帯(今と同じ)、ボタンは「試聴」と「続きをやる」。
  - Chord Dojo: アイコン + 「Chord Dojo ・ 日付」、大きな字=Dojo ホームの「続きから」と同じ題、その下=同じ補足。帯は**空けて高さを保つ**(`.lv-home-strip[data-empty]`)。ボタンは「続きをやる」だけ。行き先は Dojo ホームの「続きから」と同じ仕組み(`ChordDojoView` に `initialRecent` を渡し、中の `resumeRecent` をそのまま使う。2 つ目は作っていない)。
  - Bass Practice: アイコン + 「Bass Practice ・ 日付」、大きな字=練習の名前(Bass Practice のタブの名前: Degree Echo / Rhythm Echo / Bassline Echo / Root Motion Echo / MIDI のベースライン)。ボタンは「続きをやる」だけで、その練習のタブを開きます(`BassPracticeModeView` に `initialMode`)。
- `titleOf`・`subOf` と、その元になる言葉は `src/views/chord-dojo/dojoRecent.ts` の `dojoRecentLabels`・`dojoRecentTitle`・`dojoRecentSubtitle` に移し、**Dojo ホームとホームの両方**が同じものを使います(Dojo ホームの見た目・テストは変えていません)。

## 2. 「取り込む」の箱

- 点線の大きな箱をやめ、下のボタンと同じ枠のボタン 2 つ(同じ形・同じ高さ)にしました。言葉は「MIDI から取り込む」「テキストから取り込む」。
- 小さな説明「コード採集を開いてファイルを選ぶ」は箱の下に 1 行だけ。アイコンと押したときの動きは今のまま。空いた分だけ箱が低くなり、右の「今日の練習」が上に詰まります。

## 3. 「今日の練習」の箱

- **Voicing Loop の行を足して 3 行**(Voicing Loop・Chord Dojo・Bass Practice)。アイコンは左のメニューと同じ `VoicingLoopIcon` を四角に入れています。押すと Voicing Loop(選ぶ画面)を開きます。
- Voicing Loop の行は**丸い数字を出しません**。下の小さな字は `loop-vault:voicing-loop-last:v1` があれば「前回 今日/昨日/M/D」(`formatWhen` の時刻なし)、無ければ何も出しません。「今日はまだ」とは出しません。
- Chord Dojo・Bass Practice は、0 の日は 2 行とも「今日はまだ」、1 以上の日は「今日 n 回」。数え方は変えていません(前の「今日 0回」と Bass の「n問」をやめました)。
- 説明(見た目は変えず `title` と `aria-label`):丸い数字=「今日の回数」、右上の点=「直近 5 日の練習した日」。

## 4. テスト

### A(探し方の直し)

| ファイル・テスト | 前 | 後 |
|---|---|---|
| `e2e/phase5.16-production-activation.spec.ts`(Bass の回数) | `/今日 [1-9]\d*問/` | `/今日 [1-9]\d*回/`(§3 の言葉に合わせた。数え方は同じ) |

### B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `src/views/HomeView.test.tsx`「continues the latest Chord Dojo practice, else the latest edited progression」(練習の記録が指す Vault の進行を出す) | そのまま残し、さらに「Voicing Loop が最近のとき」「Bass Practice が最近のとき」「候補が無いとき」を単体と e2e で確かめる | §1 |
| (無し)「今日の練習」2 行 | 3 行・Voicing Loop は数字なし・0 の日は「今日はまだ」・1 以上は「今日 n 回」 | §3 |
| (無し)点線の箱と横長のボタン | 2 つが同じ形・同じ高さ・言葉は「MIDI から取り込む」「テキストから取り込む」 | §2 |

### 足したテスト

- 単体 `src/views/home/useHomeSummary.test.ts`(7 件):Voicing Loop / Chord Dojo / Bass Practice の候補、いちばん新しいものが勝つ、行き先が開けない候補は使わない、候補が無いときの今までの動き、Voicing Loop の覚え書きがホームに渡る。
- 単体 `src/voicingPractice/lastPractice.test.ts`(4 件):書いて読める、壊れた値は「なし」、書けなくても落ちない、入れる形。
- 単体 `src/views/HomeView.test.tsx` に 2 件:Bass Practice の「続きから」(行き先 `openBassPractice("rhythm")`)、3 行と Voicing Loop の数字なし。
- e2e `e2e/p22-03-home.spec.ts`(9 件):Voicing Loop が最近のとき(覚え書きが書かれる・「続きをやる」で練習が開く)、Chord Dojo が最近のとき(題・補足・帯の空き・「試聴」なし・「続きをやる」で Dojo の練習が開く)、何も練習していないとき(最後に編集した進行)、Vault から消えた進行と開けない Chord Dojo の項目は候補にしない、取り込む 2 つの形と行き先、3 行と数字なしと「今日はまだ」、練習した日は「今日 n 回」、Voicing Loop の行の「前回 …」と行き先、5 つのサイズで横にはみ出さない。

### 見た目の基準

- `e2e/visual.spec.ts` を回して **8 枚とも変化なし**(更新なし)。`home.png` が写しているのは **進行が 0 件のホーム**(最初の取り込みの案内だけ)で、今回変えた箱(続きから・取り込む・今日の練習)は進行があるときだけ出るため、写りません。変えた画面の基準が別に無いので、更新はしていません。

## 写真

`p89-generated/p22-03-home/`(git では追跡しない)

- 変える前: `before/{empty,edit,practiced}-{1280x720,1366x768,1440x900,1920x1080,768x640}.png`
- 変えた後: `after/` に同じ 15 枚。
  - empty=進行 0 件(最初の取り込みの案内)、edit=進行あり・練習の記録なし、practiced=進行あり・Chord Dojo で 1 枚練習した後。

## 指示どおりにできなかった所・注意

- **開けない Chord Dojo の項目**:ホームが見ているのは「その項目がまだあるか」です(進行が消えた `saved`/`voicing`、知らない id の `standard` など)。**記録のファイルが壊れていて Chord Dojo 側が「今は開けません」と出す状態**までは、ホームでは判定していません(その場合はホームから開こうとすると Chord Dojo が自分の案内を出します)。記録の読み込みをもう 1 か所増やさないためです。
- Bass Practice の練習の名前は、アプリのタブの名前(英語)をそのまま使いました。ホームに日本語の名前の決まりが無いためです。
- 取り込む箱の説明「コード採集を開いてファイルを選ぶ」は、2 つのボタンの下に 1 行だけ置きました(指示の「箱の下に 1 行だけ」)。
- FULL の結果は下に書きます。

## FULL

`npm run test:full` を **1 回**回して **PASS**(`4a18d15f`、2026-11-11 00:33〜00:50・**828.0 秒**)。落ちた回はありません。

- Vitest full: **6391 / 6393 PASS**(2 skipped)
- Playwright full: **930 / 932 PASS**(2 は既存の条件付き skip)
- Playwright heavy pass: **53 / 53 PASS**
- ほか: Source contracts・AI handoff・Class lint・Phase docs・Runner contracts 40/40・Privacy scan・E2E TypeScript・Production build・Repository ESLint・App TypeScript・Gallery excluded・Git diff check・Tracked PNG check すべて PASS
- `goto の開き直り 0 回`

回した FULL はこの 1 回だけです(落ちた回は無し)。

## 直し 1

`P22-03-fix-1.md` の直し 1〜4 と「足すテスト」をやりました。`feat/p22-03-home` の続き(新しいブランチは作っていません)。**master には触っていません**(マージも push もしていません)。

- コミット: `ed9bec95`(直しとテスト)、この報告のコミット

### 直し 1:ホームから再開した Chord Dojo が、タブを行き来するとまた始まる

`src/App.tsx`。

- `onModeChange` の 2 か所(`PracticeWorkspace` へ渡す 827 行・`PracticeModeTabs` へ渡す 1014 行)を指示の形にしました:
  `mode=>{if(mode==='chord-dojo')setPracticeTarget(undefined);setDojoRecentResume(undefined);setBassPracticeInitialMode(undefined);setPracticeMode(mode);}`
- `setPracticeMode(` を呼んでいる所は **8 か所**。それぞれで何を `undefined` に戻したか:

| 行 | 関数 | `dojoRecentResume` | `bassPracticeInitialMode` |
|---|---|---|---|
| 539 | `openDirectVoicingLoop` | 戻す(537) | 戻す(538) |
| 566 | `openPractice`(Vault の進行から Bass Practice) | 戻す(564) | 戻す(565) |
| 593 | `openChordDojo` | もう戻していた(591) | **足した**(592) |
| 605 | `openChordDojoRecent` | 値を入れる(603。ここだけ) | **足した**(604) |
| 616 | `openBassPractice` | **足した**(613) | 値を入れる(612。ここだけ) |
| 637 | `openProgressionVoicingPractice` | 戻す(635) | 戻す(636) |
| 827 | `onModeChange`(PracticeWorkspace) | 戻す | 戻す |
| 1014 | `onModeChange`(PracticeModeTabs) | 戻す | 戻す |

- 値を入れるのは `openChordDojoRecent` と `openBassPractice(mode)` の 2 か所だけ、ほかは全部 `undefined` に戻す、という決まりになっています。ほかに `setPracticeMode(` はありません(`git grep` で確認)。

### 直し 2:ホームからの再開が、練習の記録の読み込みを待つ

`src/views/chord-dojo/ChordDojoView.tsx` 155 行。`initialRecent` の `useEffect` に `!runtime.ready` の待ちを足し、依存も `[runtime.ready, initialRecent]` にしました(`initialTarget` と同じ待ち方)。置き場所(記録を整える `useEffect` より後ろ)と `resumeRecent` の中身は変えていません。

- **単体テストは足していません**。理由:`ChordDojoView` を単体で立ち上げる土台が今 1 つも無く、指示どおり新しい土台は作らないため。読めたあとの再開は直し 1・直し 3 の e2e が確かめています。

### 直し 3:Vault の進行を練習したのに「今日のおまかせ」になる

`src/views/chord-dojo/ChordDojoView.tsx` 197 行(`submit` の `rememberRecent` の連鎖)。最後の `else` の直前に指示の 1 行を足しました:

```tsx
else if(task.kind==='progression'&&from===undefined&&outsideActive.current&&task.key.startsWith('vault:'))rememberRecent({kind:'saved',id:task.key});
```

`practiceFrom`・`initialTarget` の `one(...)` の呼び方は変えていません。今日のおまかせは今までどおり `today` として覚えます。

### 直し 4:「取り込む」を P22-03 より前の形に戻す

`src/views/HomeView.tsx`(取り込むの `<section>`)・`src/styles/home.css`。

- 点線の箱(`.lv-home-drop`・26px のアイコン・「MIDI から取り込む」・中に「コード採集を開いてファイルを選ぶ」)と、横長のボタン(「コード譜のテキストを貼り付け」)に戻しました。P22-03 で足した `<p>` とコメントは消しました。
- `home.css` は `.lv-home-drop` の 2 つの決まりと `prefers-reduced-motion` の並びの `.lv-home-drop,` を元の場所に戻しました。`git diff master -- src/styles/home.css` は **`.lv-home-strip[data-empty="true"]`(§1 で残すもの)だけ**です。
- `FirstCaptureGuide`・`VaultView`・`HomeView.test.tsx` の「テキストから取り込む」は触っていません(別の画面・別のテスト)。

### テスト

| 種類 | ファイル・テスト | 何を確かめるか |
|---|---|---|
| 強くした | `e2e/p22-03-home.spec.ts`「the newest Chord Dojo practice becomes 続きから…」 | 「続きから」に「自分の進行」と「P22-03 Home Fixture」が出る・「今日のおまかせ」が出ない・「続きをやる」のあと `[data-dojo-screen='practice']` と最初のコード Cmaj7 が出る(前は「Dojo の何かの画面」だけだった) |
| 書き直した | `e2e/p22-03-home.spec.ts`「the two ways into Capture…」 | 直し 4 に合わせて、「MIDI から取り込む」(点線の箱・中に説明)と「コード譜のテキストを貼り付け」が見え、テキストのボタンで取り込みが開く |
| 足した | `e2e/p22-03-home.spec.ts`「直し 1: coming back to the Chord Dojo tab…」 | 900×700 で、ホームの「続きをやる」→ 練習 → タブ「Voicing Loop」→ タブ「Chord Dojo」→ `dojo-home` が出て、もう一度始まらない |
| 足した | `e2e/p22-03-home.spec.ts`「直し 3: today's plan is still remembered as today」 | Dojo ホームの「今日のおまかせ」で 1 回答えたあと、`loop-vault:dojo-recent:v1` の先頭が `kind: "today"` のまま |
| 足した | `src/features/bass-practice/ui/BassPracticeModeView.test.tsx`(3 件) | `initialMode="rhythm"` で Rhythm Echo のタブが選ばれる / 渡さないときは今までどおり Degree Echo / その練習がオフのときは Degree Echo に戻る(落ちない) |

- 今ある期待は 1 つも消していません(決まり C はしていません)。既存の期待を変えたのは「two ways into Capture」の 1 件だけで、これは直し 4 で取り消した動きに戻したものです。
- 関係するテスト:`e2e/p22-03-home.spec.ts` 11/11・`p20-dojo-home`・`p22-01-home`・`p12-dojo-home-layout`・`p12-4-back`・`p89-home-continue`・`phase5.16-production-activation` を合わせて 54/54 PASS。`npm run test:fast` も PASS(Vitest 6394/6396)。

### 写真

`p89-generated/p22-03-home/fix-1/`(1440×900、git では追跡しない)

- `practiced.png`:Vault の進行を Chord Dojo で 1 回練習したあとのホーム(「続きから」に「自分の進行」と進行の名前)
- `edit.png`:進行あり・練習の記録なしのホーム(「取り込む」が点線の箱に戻っている)

### 見た目の基準

`e2e/visual.spec.ts` を回して **8 枚とも変化なし**(`git status` で基準の PNG に変更なし)。更新していません。

### FULL

`npm run test:full` を **1 回**回して **FAIL**(2026-11-11 01:35〜01:53)。

- Vitest full: **6394 / 6396 PASS**(2 skipped)
- Playwright full: **931 PASS / 1 FAIL**(下の 1 件)。**heavy は、この失敗で runner が止まったため回っていません**
- 落ちたテスト:`e2e/p12-theme-score.spec.ts`「Theme score readable and accessible 1440x900」(helper `theme` の `expect(p.getByTestId('dojo-theme')).toContainText('Dm9 G13 Cmaj9')` が 5 秒で切れた)
- **回し直していません**。理由:このテストは前から**負荷で揺れる**と記録されている(`docs/reports/test-slim-2026-11.md` の「不安定なテスト」に「`p12-theme-score.spec.ts` 1920×1080 | 同じ負荷の FULL で 1 回、テーマ文言の 5 秒の expect が切れた」とあるのと同じ症状。`docs/reports/p20-dojo-home.md` にも同じテストが負荷時に落ちた記録がある)。今回も**同じ FULL の中で 7 つのサイズのうち 1440×900 だけ**が 5 秒で切れ、単体では 3.6 秒で PASS します。直し 1〜4 はこの画面の文言・描画を変えていません(直し 3 は練習を始めたときの覚え書きだけで、ホームのテーマの文には触れていません)。P22-00 の「自分の変更と関係がなさそう(負荷で揺れるテスト)のとき:回し直さず、落ちたテスト・expect の行・なぜ関係がないかを報告して止まる」に従いました。

### FULL(2 回目・利用者の指示で、コードを変えずに回した)

- **2 回目**:コードは 1 回目と同じ(`707b3843`。直しのコードは `ed9bec95` のまま、1 文字も変えていません)。**PASS**(2026-11-11 10:28〜10:45・**815.6 秒**)
  - Vitest full: **6394 / 6396 PASS**(2 skipped)
  - Playwright full: **932 / 934 PASS**(2 は既存の条件付き skip)
  - Playwright heavy pass: **53 / 53 PASS**
  - ほか: Source contracts・AI handoff・Class lint・Phase docs・Runner contracts 40/40・Privacy scan・E2E TypeScript・Production build・Repository ESLint・App TypeScript・Gallery excluded・Git diff check・Tracked PNG check すべて PASS
  - 1 回目に落ちた `p12-theme-score`「Theme score readable and accessible 1440x900」は、2 回目は PASS(同じコード)。1 回目の落ち方は、前から記録されている負荷時の揺れと同じでした。
- 回した FULL は 2 回(1 回目 FAIL・2 回目 PASS)。1 回目の内容は上のまま残しています。

## マージ

- ローカル `master` へ **fast-forward** でマージしました(`master` = `a6307197` → `49f280cd`)。マージコミットは作っていません(履歴は一直線)。
- 入った中身は FULL を通したものと同じ木です(コード `ed9bec95` + 報告のコミット `707b3843`・`49f280cd`。2 回目の FULL は PASS・815.6 秒)。
- **push はしていません**。ローカル master に P22-01・P22-02・P22-03 が入った状態で止まります。
