# P23-62 / P23-63 / P23-64 — Bass Practice のステージ化(報告)

指示: `<作業フォルダ>\lv-handoff\inbox\P23-連続-2026-11-24.md`(各段の中身は `inbox\P23-62\P23-62.md`、`inbox\P23-63\P23-63.md`、`inbox\P23-64\P23-64.md`)
ブランチ: `feat/p23-62-bass-stage`(local master から)

---

## P23-62 — 度数・リズム・ルートの動きを 1 聴く → 2 弾く → 3 結果 のステージへ

### 何をしたか

- `P23-62.patch` を `git apply --3way` で適用(17 files, +1789 / −883)。
  - 新規: `src/features/bass-practice/stage/Stage.tsx`(ステージの共通部品)、`stage/stage.css`、`stage/useJudgedTake.tsx`(1 回ぶんの判定つき録音)、`e2e/helpers/bass-stage.ts`(e2e 用の合成ベース)。
  - 書き換え: `BassPracticeView.tsx`(度数)、`RhythmPracticeView.tsx`、`RootMotionPracticeView.tsx`、`BassPracticeHome.tsx`(日本語名)、`BassPracticeModeView.tsx`、`EchoPracticeFrame.tsx`、`RecordCompareSection.tsx`(`presentation="none"` / `onStatusChange` / `onInputLevel`)、`midi/analysis.ts`(`pitchRule`)、`midi/analyzeRecording.ts`、`midi/playback.ts`、`HomeView.tsx`、`RetainedTakesPanel.tsx`。
- 名前(日本語): 度数 / リズム / ルートの動き / コード進行のベース / MIDI のベースライン。英語名は `e2e/helpers/app.ts` の `BASS_MODE_BY_NAME` にだけ残した。
- 振る舞いの変更(指示 §2 のとおり):
  - 度数: 「練習を準備」画面がなくなり、開くとそのまま 1 聴く。セッションは最初の聴取から始まる。`mainIssue` は持たない。
  - リズム: 問題の `seed` が難しさ・リズム・回を持つ。`hintLevel` は開いたヒントの数(0–3)。
  - ルートの動き: 答えたあともお手本を聴き直せる(聴き終わり/停止で同じ段に戻る)。

### 確かめたこと(テスト)

- 置き換えた単体テスト(消えた見た目 → 新しい見た目)
  - `BassPracticeView.test.tsx` 9 本: 6 段の流れ → `.bp-step` の 3 段(1聴く 2弾く 3結果)と `data-stage-step`、`data-primary-action` → `[data-tone='primary']` が 1 つ、ヒント 4 段 → `.bp-hint` の 3 つ(輪郭 → 度数 → 音名と指板)と指板、歌うの待ち時間 → 歌う参考音は任意、移調 → 別のキーで(同じ度数・違う音)、8 問目の要約画面 → 「このセッション 8 / 8 問」と「次の 8 問へ」。
  - `RhythmPracticeView.test.tsx`(2 本)・`RhythmPracticeView.globalBpm.test.tsx`(6 本): 6 段 → 3 段、`#rhythm-tempo` → 上の BPM(条件のポップオーバーに「いま 132 BPM(次のリズムから 140 BPM)」)、`rhythm-grid` → `bp-lane` とヒント。
  - `RootMotionPracticeView.test.tsx`(3 本)・`RootMotionPracticeView.vault.test.tsx`(5 本): 6 段 → 3 段、移調 → 別の音から、`fieldset`/`再生中` → `data-practice-state='listening'` と「止める」、音数の選択は条件のポップオーバーの中。
  - `BassPracticeModeView.test.tsx`(5 本): 英語名 → 日本語名、`Degree Echoの進行` → `[aria-label='練習の段階']`、バッジ削除、右の欄の削除。
  - `BassPracticeHome.test.tsx`(3 本)・`RetainedTakesPanel.test.tsx`(1 本)・`BassPracticeModeView.chordContext.test.tsx`(1 本): 名前だけ日本語へ。
- 足した単体テスト(指示 §2 の 4 つ)
  - `midi/analysis.test.ts`: `pitchRule` の `ignore` / `octave` / `exact` と、指定が無いときは `octaveCountsAsCorrect` が決めること(4 本)。
  - `stage/useJudgedTake.test.ts`: `suggestedRating`(4/4 ヒント 0 = 簡単、4/4 ヒント 1 = 良い、3/4 = 良い、2/4 = 難しい、1/4 = もう一度、0/0 = もう一度)(3 本)。
  - `application/rootMotionSession.test.ts`: 答えたあとの聴き直しは `sing` に戻る(聴き終わりも停止も)(2 本)。
  - `recording/ui/RecordCompareSection.test.tsx`: `presentation="none"` では何も描かないが、`commands.start()` で録音が始まり `onStatusChange` が `recording` を受け取る(1 本)。
- 足した e2e: `e2e/p23-62-bass-stage.spec.ts`(S1–S5, S7, 報告用の写真)と `e2e/p23-62-bass-stage-no-input.spec.ts`(S6)。
  - S1 度数: ヒントを全部開いて答えを読み、3 つ目だけ半音 2 つ上げて録る → 3 / 4・音が違う 1・「良い」が選ばれる → 次のフレーズで記録が 1 つ増える。
  - S2 度数(録らずに): 答え → 自分で評価 → 次のフレーズが押せるまで。
  - S3 別のキー: 帯・ヒント無し・「何度でも聴けます」。
  - S4 リズム: タイミングだけで判定 → n / n・「音の高さは見ません」→ 次のリズムは別のリズム。
  - S5 ルートの動き: 答える → もう一度 ▶ が押せる → 録る → 結果 → 履歴に firstAnswer。
  - S6 入力なし: 録れないことを伝え、「録らずに評価する」で 3 結果。
  - S7 形: 1440×900 と 1280×720 で、横スクロール 0・`.bp-frame-scroll` のはみ出し 0・段 3 のボタンはレーンの下 120px 以内・`.bp-foot` は窓の下から 40px 以内。
- 見本との一致: `handoff/mocks/p23-62/` と `docs/reports/p23-62-assets/` を撮り比べ、段の位置・レーンのすぐ下のボタン・右の欄が無いことを確認(止める条件には当たらない)。

### 止まった所・報告

- S6 の文言: 入力デバイスが無いとき、この環境の Chromium は「録音を始められませんでした。」を返す(「入力の機器が見つかりません。」は自動チャンネルが決められない時だけ)。S6 はこの環境の文言に合わせ、理由をコメントに残した。
- Playwright は `launchOptions` を describe 単位で変えられないため、S6 は別ファイル `p23-62-bass-stage-no-input.spec.ts` にした(`--use-fake-device-for-media-stream` を付けない、の意図はそのまま)。

### ゲート

| 何を | 結果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run typecheck:e2e` | PASS |
| `npm run lint` | PASS |
| `npx vitest run src/features/bass-practice src/views/HomeView.test.tsx` | PASS(545 + 11) |
| `npm run test:fast`(1 回目) | Playwright 8 件失敗(英語名を確かめていた 6 本 + 無関係な揺れ 2 本)→ 6 本を新しい名前に直した |
| `npm run test:fast`(2 回目) | Vitest 7130/7132 PASS、Playwright 1 件だけ失敗(`dojo-display-judge` の MIDI 再接続。Bass Practice を触らない)→ 単独 `--repeat-each=3` で 3/3 PASS(負荷による揺れ) |
| 直した e2e | `p23-25` `p23-28` `p23-36` `p23-37` `p23-41` `p23-43` `p23-58` `p23-06b` `phase5.16` `phase5.16.1` `phase5.17` `phase5.18` `phase5.19` `phase5.20` `phase13-1` `phase13`(いずれも新しい画面の同じ確かめに置き換え) |
| `e2e/visual.spec.ts` | PASS 6/6(baseline の更新なし) |
| commit | `1021852f` |

- 単体テストの置き換えで弱めていないかは、各ファイルで「何が保存されるか・どの順で進むか・何ができないか」を残した(上の表のとおり)。
- `BassLane` の横スクロールに `tabIndex`/`role`/`aria-label` を足した(320px 相当で axe の `scrollable-region-focusable` が出たため。1280/1440 では見た目が変わらない)。
- Playwright は `launchOptions` を describe 単位で変えられないため、S6 は別ファイルにした(意図は「入力なし」のまま)。

---

## P23-63 — コード進行のベースを 1 聴く → 2 弾く → 3 結果 のステージへ

### 何をしたか

- **舞台化 (`src/features/bass-practice/ui/BasslinePracticeView.tsx`, `BassPracticeModeView.tsx`)**:
  - `STAGE_MODES` に `"bassline"` を追加し、`EchoPracticeFrame` を `rail={false}`・`active={!showHome}` に変更（右欄と `BassModeWeek` を撤去、`?` キー行は `bassline` 用の「`Space 聴く・お手本 · H ヒント · R 録って弾く・録り直す · Esc 止める · N 記録して次へ`」へ）。
  - **上の帯（「条件」のチップ）**: `<StageTools>` 内の `Popover`（`data-testid="bassline-conditions"`、幅 340px・`max-height: min(70vh, 560px); overflow-y: auto`）へ 10 項目（1. 練習する進行・`VaultProgressionPicker`・「現在のデフォルトに戻す」 / 2. プリセットのキー / 3. ベースライン「作る」・「元のベースライン」と保存済み選択 / 4. レベル / 5. 元ベースラインの区間 / 6. テンポ / 7. コードの音色 / 8. 聴く時に鳴らす Select / 9. 弾く時に鳴らす Select / 10. 前の練習から）を収容。各制約理由・注意文はその欄の下に 1 行表示で残し、「聴く/演奏」のラジオを撤去。
  - **1 聴く → 2 弾く → 3 結果**:
    - 段 1: `StageLane`（`chords` 段つき、2 小節超で `wide`）、再生行（左に「聴く時に鳴らす」回転チップ・中央 ▶ `startChordContext` / `legacyListen`・右「何度でも聴けます」）、ヒント（「音の数」→「音名と指板」）、ボタン（「録らずに弾く」・「● 録って弾く R」、未聴取時は「まず ▶ で聴きます」）。
    - 段 2: `useJudgedTake`（`mode: "bassline"`, `pitchRule: "octave"`, `click: false`, `prepareAccompaniment` / `startAccompaniment` / `stopAccompaniment` で既存の Chord Context 再生エンジンを呼び出し）でカウント → 「伴奏に合わせて弾いてください」・入力レベル → 停止 / 「録らずに弾く」経路。
    - 段 3: `StageResultHead`（`n / m`「音が合いました」・事実のチップ・評価 4 つ無し）、レーン、ボタン（`▶ お手本`・`▶ 自分`・`▶ 重ねて`・`録音を残す` ｜ `● 録り直す R`・`記録して次へ N`）。「記録して次へ」で `saveChordContextHistory` / `saveSourceBasslineHistory` を呼び、元ベースライン時は次区間へ、その他は同じ進行のまま段 1 へ戻る。
- **保存の検証の直し (`src/features/bass-practice/infra/repository/practiceRepository.ts` 71 行・117 行)**:
  - 前からあった不具合で、`signatureForSnapshot` が返す `chord-context-snapshot-v1:<16 桁の 16 進>` を、`chordContextHistoryEntrySchema`（71 行）と `rootMotionHistoryEntrySchema` の `vault-root-path`（117 行）の正規表現 `/^[a-f0-9]{8,128}$/` が弾いていたため、生成・Vault の進行の『練習履歴へ保存』と、ルートの動きの Vault の履歴が保存できていなかった。両行を `/^(?:chord-context-snapshot-v1:)?[a-f0-9]{8,128}$/` へ修正（90 行の 64 桁正規表現は不変）。
  - 単体テスト 2 本を `practiceRepository.test.ts` へ追加（実スナップショット由来の `ChordContextHistoryEntry` と `createVaultRootMotionExercise` 由来の `RootMotionHistoryEntry` を保存して再読込し一致を確認。手書き署名テストもすべて維持）。

### 確かめたこと・置き換えたテスト

- 追加 E2E（`e2e/p23-62-bass-stage.spec.ts`）:
  - **S8 コード進行のベース**: 聴き終わり → 正解音で録音 → `n / n` → 「記録して次へ」でエラー無し・段 1 へ戻り `chordContextHistory` が 1 件増える。
  - **S9 元ベースライン**: Vault 保存元ベースラインを選び録音 → 「記録して次へ」で `sourceBasslineHistory` が 1 件増え `3〜4小節` へ進む。
  - **S7 形**: `1440×900` と `1280×720` で `"bassline"` も横溢れ 0・`.bp-frame-scroll` 溢れ 0・ボタン位置と足元位置を確認。
- 新しい画面へ合わせ直した E2E（確かめる中身は維持・削除や skip なし）:

| テストファイル | 変更前（旧画面の前提） | 変更後（新舞台の同じ確かめ） |
|---|---|---|
| `e2e/helpers/practice.ts` (`bassPracticeFromVault`) | 画面内に常時ある `vault-progression-picker-open` を直接クリック | 閉じている時は上帯の `bassline-conditions` を開いてからピッカー操作 |
| `e2e/p23-25-bass-practice.spec.ts` (`C1`, `C4 P7`) | `bassline` をバッジあり旧画面扱い / 画面内 `chord-context-controls`・`bassline-source-summary` を参照 | `STAGE_MODES` に `bassline` を追加（3 段階・バッジ無し） / 条件ポップオーバー内の `bassline-progression-select`・チップ表示・`bp-lane`・`bassline-listen` を確認 |
| `e2e/phase5.16-production-activation.spec.ts` | `bassline-listen` の文言 `停止`・旧「レビュー」タブ・`record-accompaniment`・`chord-context-history-save`・`bassline-source` を参照 | `aria-label` の「止める」→「録らずに弾く」→「答えを見る」→ 段 3 `bassline-next` と条件内 `chord-context-play-mode` / `bassline-progression-select` を確認 |
| `e2e/phase5.20-text-progression.spec.ts` | 旧 `bassline-source-summary`・`chord-context-controls` で遷移先を確認 | `bassline-conditions` チップ・`bassline-progression-select` (`vault`)・`.bp-meta`・`bp-lane`・`bassline-listen` で同じ到達内容を確認 |
| `e2e/progression-workspace.spec.ts` (`P10.4` 編集音の受け渡し) | `chord-context-controls` 内のラジオ「聴く」「演奏」と `chord-context-start-stop` で `__lvBassSavedPlayback` を検証 | `stageMicrophone` 上で `bassline-listen`（listen）→ `bassline-record`（play）→ `bassline-stop`、および破棄後の再聴取で同じ `[64, 67]` 再生を確認 |
| `e2e/p23-28-bass-frame.spec.ts` | `bassline` を旧上部帯（バッジ＋説明文＋右欄）として検証 | `bassline` を 4 つ目の `staged: true` として 3 段階・右欄無し・`?` の段階キー行を検証 |
| `e2e/phase13-bass-practice.spec.ts` | `STAGE_VIEWS` が 3 練習のみで `bassline` を 2 カラム検証 | `STAGE_VIEWS` に `コード進行のベース` を追加し単一カラム舞台を検証 |
| `e2e/phase5.18-chord-context.spec.ts` / `e2e/phase5.22-source-bassline-practice.spec.ts` | 旧タスク枠・右欄内のコントロールと文字列を直接操作 | 上帯の `bassline-conditions` ポップオーバー・段階 1〜3・レーン上の同じ機能と制約を検証 |
| 単体テスト (`BassPracticeModeView*.test.tsx`, `BasslinePracticeView.chordContext.test.tsx`) | 旧ラジオ・右欄・旧履歴パネル DOM を前提 | 上帯「条件」ポップオーバー・3 段階・新保存動作に合わせて同じ仕様を検証 |

- 報告用写真（`docs/reports/p23-63-assets/`）: `bassline-1-listen-{1440,1280}.png`, `bassline-2-record-{1440,1280}.png`, `bassline-3-result-{1440,1280}.png`, `bassline-conditions-{1440,1280}.png`, `bassline-source-1-listen-{1440,1280}.png`。見本 `handoff/mocks/p23-62/bassline-{1-listen,3-result}-*.png` と段構成・レーン下のボタン位置・足元キー行・右欄無しの一致を確認。

### ゲート（P23-63 コミット前）

| 何を | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run typecheck:e2e` | PASS |
| `npm run lint` (`eslint`, `lint:classes`, `lint:source-contracts`) | PASS |
| `npx vitest run src/features/bass-practice` | **PASS**（67 files, 547 tests） |
| 対象 E2E 11 本（`p23-62-bass-stage`, `p23-25`, `p23-28`, `phase5.16`, `phase5.18`, `phase5.20`, `phase5.22`, `progression-workspace`, `vault-flow`, `phase13-bass-practice`, `visual`） | **PASS**（55/55、`visual.spec.ts` 6/6 差分なし） |

---

## P23-64 — MIDI のベースライン を 1 聴く → 2 弾く → 3 結果 のステージへ

### 何をしたか

- **上帯の統合 (`src/features/bass-practice/ui/BassPracticeModeView.tsx`)**:
  - `STAGE_MODES` に `"midi"` を追加（バッジ・右欄を撤去し、曲一覧 `LibraryView.tsx` や設定・保存形式・試聴挙動は変更せず）、`STAGE_KEYS.midi`（「`Space 聴く・止める · R 録って弾く・もう一度 · Esc 止める · N 次の区間`」）を追加。
- **コンパクトバー＋共通 3 段ステージ (`src/features/bass-practice/midi/PracticeView.tsx`, `src/features/bass-practice/ui/bassPractice.css`)**:
  - **上の帯（「判定」のチップ）**: `<StageTools>` 内の `Popover`（`data-testid="midi-judge-conditions"`, label=`"判定の決まり"`）に、タイミングの許し（きびしい ±50ms / ふつう ±70ms / ゆるい ±100ms）・オクターブ違いを合いにする・音のずれの補正 自動・この区間の記録（最大 5 件）・注意文を収容。チップ表示は `判定 ふつう ±70ms` 等。
  - **1 行の曲バー＋20px 全体帯**: 左に曲名（14px 太字）・「{totalBars} 小節 · {BPM} BPM」、右に 区間（`‹` / `開始小節` / `›`）・長さ（1 / 2 / 4 / 8 / 全部）・テンポ（60% / 80% / 100%）・`☆` お気に入り・`一覧へ` を 1 行（`.bass-midi-bar`）で配置し、その直下に高さ 20px の `.bass-midi-overview` を維持。`1280×720` でも 1 行に収まる幅に調整。
  - **1 聴く → 2 弾く → 3 結果**:
    - 段 1: `StageLane`（`wide`, `minBeatPx` 48 / `弦とフレット` 時は 64, `song.chordLabels` がある時はコード段つき, お手本音名・自分の段）→ 再生行（`お手本 入/切`・伴奏あり時は `伴奏 入/切`・▶ `MidiBassPlayback`・`クリック 入/切`）→ ボタン（`弦とフレット`・`● 録って弾く R`）。60 秒超・音無し時はボタンを無効化し理由を 1 行表示。
    - 段 2/3: `useJudgedTake`（`mode: "midi-bassline"`, `pitchRule: octaveCountsAsCorrect ? "octave" : "exact"`, `judge: { timingToleranceMs, autoLatencyCorrection }`, `accompaniment`, `click`）で録音・判定し、クリック時のユーザージェスチャ内で `Tone.start()` を起動。完了後は従前と同じ試行を `song.attempts` に追加（`MIDI_BASS_FEEDBACK_QUALIFIED` が false の時は判定を出さず警告文）。
    - 段 3: `StageResultHead`（`n / m`「音が合いました」・合った/音が違う/早い・遅い/抜け/余分・タイミング平均・`ずれの補正`）、レーン（お手本＋`takeNotes`）、ボタン（`▶ お手本`・`▶ 自分`・`▶ 重ねて`・`録音を残す` ｜ `● もう一度 R`・`次の区間 N`）、直近 2 件の記録（4 択評価なし）。
    - キー: `Space`（聴く・止める / 段 3 はお手本）・`R`（録って弾く / もう一度）・`N`（次の区間）・`Esc`（止める）。

### 確かめたこと・置き換えたテスト

- 追加・拡張チェック (`e2e/p23-62-bass-stage.spec.ts`):
  - **S7 形**: `1440×900`・`1280×720`・`960×1032` で `midi` の段 1・段 3 を追加検証（横溢れ 0、デスクトップでフレーム内完結、ボタンと足元の配置確認）。なお `test.use({ launchOptions })` で `playwright.config.ts` の `--disable-audio-output` が上書きされないよう同フラグを明示維持。
- 新しい舞台へ合わせ直した E2E（中身は維持・削除や skip なし）:

| テストファイル | 変更前（旧画面の前提） | 変更後（新舞台の同じ確かめ） |
|---|---|---|
| `e2e/helpers/bass-ui.ts` | `● 録って弾く（R）` | `● 録って弾く` |
| `e2e/bass-recording-integrity.spec.ts` | `余分な音 0` も常時テキスト確認 | `mistakes` 時は `余分な音 1`、`clean` 時は `counts.extra === 0`＋`余分な音` 非表示を確認 |
| `e2e/p23-25-bass-practice.spec.ts` | `midi` を旧バッジ付き画面として検証 | `STAGE_MODES` に `midi` を追加（上帯バッジ無し、曲一覧から舞台へ入る導線を維持） |
| `e2e/p23-28-bass-frame.spec.ts` | `midi` を旧上帯（バッジ＋説明＋`⚙`＋汎用 `?` 行）として検証 | `midi` を舞台化済み（バッジ無し・説明空・`?` の MIDI キー行・右欄無し）として検証（一覧初期表示も維持） |
| `e2e/phase13-bass-practice.spec.ts` | 旧 `.bass-midi-content`/`.bass-midi-actions`/右欄 `.bass-echo-rail`/`record-keep`/`● 録って弾く（R）` を参照 | `.bp-frame-scroll`/`.bp-actions`/`bp-fretboard`/`midi-judge-conditions`/`midi-keep-take`（録音を残す→残しました）と `data-stage-step`・キャンセル時未保存を検証 |
| `e2e/phase13-1-bass-ui.spec.ts` | 旧 `record-compare:visible` 右欄・`.bass-midi-task`/`.bass-midi-lanes`/`.bass-midi-actions`・`伴奏` を参照 | 上帯 `bass-input-chip` ダイアログ（チャンネル・無通信）・`.bass-midi-bar`/`.bp-lane`/`.bp-actions`/`.bp-lane-beats`・`midi-keep-take`・権限拒否からの再試行・`CONDITION_CHIPS`（`midi-judge-conditions`）での `Select` 色トークンを検証 |
| `e2e/p23-06b-bass-global-bpm.spec.ts` (`E3`, `E4`) | `コード進行のベース` の `chord-context-effective-bpm`・`bassline-progression-select` を画面直下で参照 | 上帯 `bassline-conditions` を開いてから同じ共通 BPM とプリセット切替を検証 |
| `e2e/p23-37-bass-home-motion-color.spec.ts` | `bassline` と `midi` に旧 `.bass-mode-badge` が残る前提 | 全 5 練習で上帯バッジ無し・4 練習の 3 段階・`midi` の一覧導線（ホームの紫色選択とカード動作は不変）を検証 |

- 報告用写真（`docs/reports/p23-64-assets/`）:
  - [`midi-1-listen-1440.png`](p23-64-assets/midi-1-listen-1440.png) / [`midi-1-listen-1280.png`](p23-64-assets/midi-1-listen-1280.png)
  - [`midi-2-record-1440.png`](p23-64-assets/midi-2-record-1440.png) / [`midi-2-record-1280.png`](p23-64-assets/midi-2-record-1280.png)
  - [`midi-3-result-1440.png`](p23-64-assets/midi-3-result-1440.png) / [`midi-3-result-1280.png`](p23-64-assets/midi-3-result-1280.png)
  - [`midi-fret-1440.png`](p23-64-assets/midi-fret-1440.png) / [`midi-fret-1280.png`](p23-64-assets/midi-fret-1280.png)
  - [`midi-judge-1440.png`](p23-64-assets/midi-judge-1440.png) / [`midi-judge-1280.png`](p23-64-assets/midi-judge-1280.png)
  - 見本 `handoff/mocks/p23-62/midi-1-listen.png` と `midi-3-result-{1440,1280}.png` に対し、3 段進行・バーの 1 行収まり（`1280×720` でも折り返し無し）・20px 全体帯・レーン直下のボタン・足元キー行・`判定` ポップオーバー（チェックボックス横並び）の一致を目視確認。

### ゲート（P23-64 コミット前）

| 何を | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run typecheck:e2e` | PASS |
| `npm run lint` (`eslint`, `lint:classes`, `lint:source-contracts`) | PASS |
| `npx vitest run src/features/bass-practice` | **PASS**（67 files, 547 tests） |
| 対象 E2E 7 本（`p23-62-bass-stage`, `p23-25`, `p23-28`, `phase13-bass-practice`, `phase13-1-bass-ui`, `bass-recording-integrity`, `visual`） | **PASS**（53/53、`visual.spec.ts` 6/6 差分なし） |

---

## 全体通しゲート（`npm run test:full:all` @ `b46d409a`）

| 項目 | 結果 | 所要 |
|---|---|---|
| Source contracts / AI handoff / Phase docs / Class lint / Runner contracts / Privacy scan / E2E TypeScript | **PASS**（Runner contracts 44/44） | — |
| Production build / Repository ESLint / App TypeScript | **PASS** | — |
| `Vitest full` | **PASS**（7132/7134） | 80.6s |
| `Gallery excluded` | **PASS** | 0.1s |
| `Playwright full (all light)` | **PASS**（1224/1226、既存・条件付き skip 2） | 998.4s |
| `Playwright heavy pass` | **PASS**（134/134、`phase13-1-bass-ui` `.bp-note` 溢れ修正・3/3 単体確認含む） | 452.6s |
| `goto の開き直り` | **0 回** | — |
| `Git diff check` / `Tracked PNG check` | **PASS** | — |
| **総合 (`FULL-ALL`)** | **PASS** | **1556.8s** |

- 基準写真（`e2e/visual.spec.ts`）: 更新 0 枚（既存 6/6 全 PASS）。
- 調整した旧 E2E 追従: `d77f3eea` で `.bass-midi-shell .bp-note` の余白（`padding-inline: 5px; gap: 4px; font-size: 12px`）と `fitLaneNote` により、負荷時の合成録音タイミングゆらぎでもピル内横溢れが起きないように修正（`phase13-1-bass-ui` 単体 3/3 PASS、`p23-64-assets/*.png` 再撮影確認済み）。
