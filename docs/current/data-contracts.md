# データの約束(v3.2.0 から)

アプリが保存する物は、**Vault**(曲と進行の正本)と、**その PC の中だけの記録・設定**(練習の記録、続きから、音の設定)に分かれます。Vault だけが持ち運べる正本で、それ以外はこの PC のための物です。

## Vault v2(`fileVersion` 2)

Vault は `loopvault/txt-jazz-v3/data.json`(Tauri の AppData)に 1 ファイルで保存します(`src/storage/jazzVaultStorage.ts`)。移行前のバイト列は同じフォルダの `legacy-import.json` に残し、バックアップは `backups/` に 20 個まで取ります(`src/domain/repository.ts:13-17`)。

| フィールド | 中身 | 決まり |
|---|---|---|
| `app` | `"loopvault"` | 固定。変えない |
| `fileVersion` | `2` | 書き込みは 2 のまま。altered(変化記号付き)の分類を含む時だけ、書き出しの JSON が 3 になる(`src/domain/repository.ts:321-326`) |
| `settings` | `monthlyGoal`(1 以上)・`language`(`"ja"`/`"en"`)・`showRomanNumerals` | キーを変えない。値は読むだけで書き換えない |
| `ideas[]` | `SongIdea` の配列 | 各項目の必須キーを変えない |

型は `src/domain/types.ts:237-242` にあります。

**読む時の版**

- 1・2・3 を受け付けます(`src/domain/schema.ts:379-386`)。4 以上は `future-version` として読み取り専用にし、書き込みません(`src/domain/schema.ts:446-449`、`src/store/vaultStore.ts:428-443`)。
- v1 は読み込みの時に 2 へ上げます(`src/domain/schema.ts:482-488`)。保存し直す時も 2 です。
- 3 は読み込みのためだけの版ではなく、altered を含む Vault を古い読み手に渡さないための書き出し版です(`src/domain/repository.ts:321-326`)。

**変えてはいけない物**

- `app`、`fileVersion`(書き込みは 2)、`settings` の 3 キー、`ideas[]` の必須キー — `id`(uuid)・`title`・`moods`・`status`・`nextAction`・`chordMemo`・`references`・`assets`・`statusHistory`・`createdAt`・`updatedAt`(`src/domain/schema.ts:334-368`)。
- スキーマは `.strict()` です。知らないキーがあると、その Idea は隔離されます(`src/domain/schema.ts:462-480`)。項目を足す時は任意(optional)にして、同じ版でスキーマに足します。既存の名前・型・意味を変えると、古い Vault はそのままでは読めません。
- 画面から外した項目も、保存された値は書き換えません。これは P8.9 の保持の契約です(`docs/contracts/phase8.9/P8.9-data-retention.md:5`、同 `:9-18`)。
- 1 ファイル 16 MiB まで(`src/security/intakeBudgets.ts:13`)。超える保存は `vault-too-large` で止まります(`src/domain/repository.ts:343-350`)。
- 隔離が出た Vault は、書き出し・取り込み・復元・統合をしません(`src/domain/repository.ts:295-305`)。

**スキーマと検証の場所**

| 場所 | 役割 |
|---|---|
| `src/domain/types.ts` | `VaultFile`・`SongIdea` の型 |
| `src/domain/schema.ts` | `songIdeaSchema`・`vaultSettingsSchema`・`vaultFileSchema`・`parseVaultFileJson`。隔離もここ |
| `src/domain/repository.ts` | `createEmptyVault`・`serializeVault`・`canonicalVaultJson`・16 MiB の上限・隔離の扱い |
| `src/store/vaultStore.ts` | 実行時の読み書きと、`future-version` の読み取り専用 |
| `src/storage/jazzVaultStorage.ts` | 保存先と、旧 `loopvault/data.json` からの移行 |

## 主なストア

「ストア」は 2 種類あります。Vault を持つ物(アプリ全体で 1 つ)と、その PC の記録・設定を持つ物(記録ごと・画面ごと)です。

| 持つ物 | 置き場所 | 何を持つか |
|---|---|---|
| Vault | `src/store/vaultStore.ts`(zustand/vanilla の `createStore`。既定は `src/store/defaultVaultStore.ts`) | `ideas`・`settings`・分析中の一時状態・`loadStatus`・`quarantine`・`readonly`・`unsaved`・`saving`・`backups`(`src/store/vaultStore.ts:164-218`)。保存・読み込み・書き出し・取り込み・復元は `VaultRepository` に任せる |
| Chord Dojo の記録 | `src/domain/chordDojo/store.ts`(`DojoRepository`) | `shapes`・`voicings`・`progressions`・`master251`・`knownQualities`・`today`・`settings`。`fileVersion: 4`、revision と token で古い書き込みを弾く(`src/domain/chordDojo/store.ts:16-22,55-63`) |
| ガイド付きコース | `src/domain/chordDojo/guidedCourse/store.ts` と `.../advanced/store.ts` | 基本 Lv1–3 と上級の試行・位置・`bankVersion`。2 つは別ファイル(`.../advanced/store.ts:17-34`) |
| Bass の練習 | `src/features/bass-practice/infra/repository/practiceRepository.ts` | `settings`・`exercises`・`attempts`・`sessions`・`reviewQueue`・リズム/コード文脈/根音/元ベースラインの履歴(`:122`) |
| 完奏・耳・ドリル・MIDI 曲庫 | `src/domain/chordDojo/jazzRecords.ts`・`originalRecords.ts`・`src/domain/earPractice/earRecordRepository.ts`・`src/domain/chordDojo/voicingDrillRecords.ts`・`src/features/bass-practice/midi/library.ts` | 記録ごとの別ファイル。`jazz-progressions`・`original-practice`・`ear-practice`・`voicing-drill`・`bass-midi-library` の名前で分かれる |
| 続きから・今日のループ・開いた回数 | `src/views/chord-dojo/dojoRecent.ts`(zustand)・`src/views/home/todayLoop.ts`・`src/views/home/practiceOpens.ts`・`src/voicingPractice/lastPractice.ts`・`src/voicingPractice/recentProgressions.ts` | 画面の案内に使う小さな記憶だけ。練習の記録ではない |
| 音と表示の設定 | `src/audio/`・`src/storage/`・`src/voicingPractice/`・`src/liveMidi/`・`src/llm/`・`src/components/shell/` | 設定。関数の集まりで、置き場所は `localStorage`(下の節) |
| 画面の中だけの状態 | 各 view の `useState`、`sessionStorage`(`loop-vault.vault-library:v1`: `src/views/vault/useVaultLibraryFilters.ts:16`) | 保存しない。閉じると消える |

- 記録の置き場所は、Tauri では AppData のファイル、ブラウザ(Vitest・e2e・`vite dev`)では同じ中身を `localStorage` の `loop-vault:<namespace>-v1:data` に置きます(`src/features/bass-practice/infra/repository/practiceStorage.ts:192-194`、`src/domain/chordDojo/storage.ts:183-186`)。
- どの記録も「読めない物は隔離する・勝手に空にしない」で揃えています(`src/domain/chordDojo/store.ts:27-53`、`src/domain/chordDojo/guidedCourse/store.ts:14-21`)。

## `localStorage` のキーの一覧

記録ファイルの行は、`...:data`(本体)・`...:tmp`(書きかけ)・`...:backup:<token>`(直前の版)・`...:corrupt:<token>`(隔離した物)をまとめて 1 行にしています(ガイド付きコースの 2 つは backup を持ちません)。`sessionStorage` は含めません(画面を閉じると消える物: `loop-vault.vault-library:v1`、e2e 用の `p20-home-read-delay`)。

| キー | 中身 | 読み書きする所 |
|---|---|---|
| `loop-vault:practice-v1:` | Bass 練習の記録(`app: "loopvault-practice"`、`fileVersion: 2`、revision・settings・exercises・attempts・sessions・reviewQueue) | `src/features/bass-practice/infra/repository/practiceStorage.ts:9-12` |
| `loop-vault:bass-midi-library-v1:` | 取り込んだ MIDI ベースの曲の一覧(`app: "loopvault-bass-midi-library"`、`fileVersion: 1`) | 同 `:14-15,33-37`、`src/features/bass-practice/midi/library.ts:30` |
| `loop-vault:ear-practice-v1:` | 耳コピ練習の記録(`app: "loopvault-ear-practice"`、`fileVersion: 1`、`records`) | `src/domain/earPractice/earRecordRepository.ts:7-16,134` |
| `loop-vault:original-practice-v1:` | Original Practice の完奏(laps)(`app: "loopvault-original-practice"`) | `src/domain/chordDojo/originalRecords.ts:9-16` |
| `loop-vault:jazz-progressions-v1:` | Jazz Progressions の完奏(laps)(`app: "loopvault-jazz-progressions"`) | `src/domain/chordDojo/jazzRecords.ts:10-16` |
| `loop-vault:voicing-drill-v1:` | ボイシングドリルの記録(`app: "loopvault-voicing-drill"`、set → 版 → キー → ①/②) | `src/domain/chordDojo/voicingDrillRecords.ts:13-16,214` |
| `loop-vault:chord-dojo-txt-jazz-v1:` | Chord Dojo の記録。いま書く方(`app: "loopvault-chord-dojo"`、`fileVersion: 4`) | `src/domain/chordDojo/storage.ts:183-186,321-325` |
| `loop-vault:chord-dojo-v1:`(読むだけ) | 旧 Dojo の記録。移行の時だけ読む | `src/domain/chordDojo/storage.ts:10-13,307` |
| `loop-vault:chord-dojo-theme-v1:`(読むだけ) | 旧 theme の記録。移行の時だけ読む | 同 `:302-307` |
| `loop-vault:chord-dojo-theme-ranges-v1:`(読むだけ) | 旧 ranges の記録。移行の時だけ読む | 同 `:312-317` |
| `loop-vault:guided-course-v1:` | ガイド付きコース Lv1–3 の記録(`app: "loopvault-guided-course"`、`fileVersion: 1`。`:data`・`:tmp`・`:corrupt:<token>`) | `src/domain/chordDojo/guidedCourse/store.ts:23-25` |
| `loop-vault:guided-course-advanced-v1:` | 上級コースの記録(`app: "loopvault-guided-course-advanced"`、`fileVersion: 1`) | `.../advanced/store.ts:27-29` |
| `loop-vault:llm-preferences:v1` | `provider`・`local`・`openai`・`language` の設定(JSON) | `src/llm/preferences.ts:34` |
| `loop-vault:live-midi-preferences:v1` | 入力機器・小窓の位置と大きさ・最前面・履歴の表示 | `src/liveMidi/preferences.ts:38` |
| `loop-vault:live-midi-connection:v1` | 起動した時に自動でつなぐ `{autoConnect}` | `src/liveMidi/connectionPreferences.ts:8` |
| `loop-vault:metronome-enabled:v1` | メトロノームの ON `{version:1,enabled}` | `src/audio/metronomePreference.ts:1` |
| `loop-vault:global-bpm:v1` | 全体の BPM `{version:1,bpm}`(30〜240) | `src/audio/globalBpmPreference.ts:1` |
| `loop-vault:master-volume:v1` | 全体の音量 `{version:1,volume}`(0〜100) | `src/audio/masterVolume.ts:3` |
| `loop-vault:preview-sound:v1` | 試聴の音色 `{version:1,sound}`(`piano`/`electric-piano`) | `src/audio/previewSoundPreference.ts:3` |
| `loop-vault:progression-midi-export-enabled:v1` | 進行の MIDI 書き出しの可否 `"true"`/`"false"`(読むだけ) | `src/midiExport/featureFlag.ts:1-19` |
| `loop-vault:bass-practice-timbre:v1` | ベースの音色 `"freepats"`/`"synth"` | `src/features/bass-practice/application/freepatsBassSettings.ts:3` |
| `loop-vault:bass-practice-record-channel:v1` | 録音の入力 `"auto"`/`"left"`/`"right"`/`"mono-sum"` | `src/features/bass-practice/recording/application/recordChannelStore.ts:11` |
| `loop-vault:bass-practice-degree-echo-enabled:v1` | 度数コピーの ON/OFF `"true"`/`"false"`(既定 ON) | `src/features/bass-practice/application/featureFlag.ts:1` |
| `loop-vault:bass-practice-rhythm-echo-enabled:v1` | リズムコピーの ON/OFF(既定 ON) | 同 `:2` |
| `loop-vault:bass-practice-bassline-echo-enabled:v1` | ベースラインコピーの ON/OFF(既定 ON) | 同 `:3` |
| `loop-vault:bass-practice-record-compare-enabled:v1` | Record & Compare の ON/OFF(既定 ON) | 同 `:5` |
| `loop-vault:bass-practice-chord-context-enabled:v1` | Chord Context の ON/OFF(既定 ON) | 同 `:7` |
| `loop-vault:bass-practice-root-motion-enabled:v1` | Root Motion の ON/OFF(既定 ON) | 同 `:9` |
| `loop-vault:bass-practice-midi-bassline-enabled:v1` | MIDI のベースラインの ON/OFF(既定 ON) | 同 `:43` |
| `loop-vault:ear-practice-settings:v1` | 耳練習の設定(level・length・tonic・bpm・表示など) | `src/views/ear-practice/earSettings.ts:49` |
| `loop-vault:practice-repeat:a` / `:c` / `:d` / `:e` | その画面の「この段階をくり返す」`"1"`/`"0"` | `src/views/chord-dojo/practiceRepeat.ts:10` |
| `loop-vault:dojo-recent:v1` | 「続きから」の 3 件 `{version:1,entries}` | `src/views/chord-dojo/dojoRecent.ts:15` |
| `loop-vault:practice-opens:v1` | 進行を練習で開いた回数(14 日・500 件まで)`{version:1,opens}` | `src/views/home/practiceOpens.ts:8` |
| `loop-vault:today-loop:v1` | 今日のループ `{version:1,shown,picks}` | `src/views/home/todayLoop.ts:4` |
| `loop-vault:voicing-loop-last:v1` | Voicing Loop の最後の練習 `{version:1,reference,at}` | `src/voicingPractice/lastPractice.ts:7` |
| `loop-vault:voicing-loop-recents:v1` | 最近練習した進行 5 件 `{version:1,references}` | `src/voicingPractice/recentProgressions.ts:5` |
| `loop-vault:voicing-loop-source:v1` | 音の出どころの記憶 `{version:1,entries}` | `src/voicingPractice/sourcePreference.ts:22` |
| `loop-vault:voicing-loop-shape:v1` | 「形 ▼」の記憶(形と部品) | `src/domain/voicingShapes/shapeIds.ts:88` |
| `loop-vault:voicing-loop-fingering-preferences:v1` | 手で直した指使い `{version:1,entries}`(256 件まで) | `src/voicingPractice/fingeringPreferences.ts:7` |
| `loop-vault:voicing-practice-preferences:v1` | Voicing Loop の設定 `{version:1,preferences}` | `src/voicingPractice/preferences.ts:6` |
| `lv-voicing-loop-play-along` | 弾き合わせの ON `"on"`/`"off"` | `src/views/voicing-loop/usePlayAlong.ts:16` |
| `lv-voicing-loop-play-along-mode` | 判定 `"chord"`/`"exact"` | 同 `:17` |
| `lv-voicing-loop-v2` | 再生の旧実装に戻す切り替え `"off"`(読むだけ。アプリは書かない) | `src/views/ProgressionVoicingPracticeView.tsx:2728` |
| `loopvault.accuracyFirstFeatures` | 解析の設定 `{version:2,profile,disabledFeatures}` | `src/storage/accuracyFirstSettings.ts:7` |
| `loopvault.preAnalysisSourceSelection` | 解析前の確認の設定 `{version:1,enablePreAnalysisSourceSelection,alwaysShowPreAnalysis}` | `src/storage/preAnalysisSettings.ts:3` |
| `loopvault.preAnalysisMemory` | 「前回と同じ設定」`{version:1,entries}`(20 件まで) | `src/storage/preAnalysisMemory.ts:11` |
| `loopvault.analysisFeedbackEnabled` | 解析フィードバックの可否 `"true"`/`"false"` | `src/storage/analysisFeedbackStorage.ts:16` |
| `loopvault.correctionMetricsEnabled` | 修正の計測の可否 `"true"`/`"false"` | `src/storage/correctionMetricsStorage.ts:10` |
| `loop-vault:standard-title-bar:v1` | 標準のタイトルバーを使う `{version:1,value}` | `src/components/shell/shellPreferences.ts:2` |
| `loop-vault:sidebar-collapsed:v1` | サイドバーを畳んだか `{version:1,value}` | 同 `:3` |
| `loop-vault:p10-card-click-audition:v1` | カードを押して鳴らす `"on"`/`"off"` | `src/storage/cardClickAuditionSettings.ts:7` |
| `loop-vault:p10-legend-visible:v1` | 凡例を出す `"on"`/`"off"` | `src/storage/workspaceLegendSettings.ts:5` |
| `loop-vault:p10-recommended-ranges-open:v2` | 「おすすめの範囲」を開いたか `"open"`/`"closed"` | `src/components/correction-workspace/WorkspaceSaveForm.tsx:171` |
| `loopvault:progression-align-notes` | 進行の音符をそろえる `"on"`/`"off"` | `src/storage/progressionWorkspaceSettings.ts:1` |

## `docs/contracts/` の各ファイル

テスト(と一部のアプリ)が実行時に読む、凍結した正解・しきい値・例です(`docs/README.md:12`)。評価用のスクリプトはここではなく `scripts/archive/` にあります。

| 入口 | 凍結している物 | 読む物 |
|---|---|---|
| `p15-02/` | P15-02 関門(テスト 8)の結果。「線で分ける」が「分けない」を上回らず、実装を止めた記録(`P15-02-gate.md`) | 人が読むだけ。このファイルはコードから読まない。数値は `src/domain/preAnalysisParts/splitGate.test.ts` が同じ条件で再現する |
| `p23-39/` | ガイド付きコース Lv1–3 の契約 v3。`README.md`・`bank-lv1-3.json`・`bank-lv1-3-v2.json`・`bank-lv1-3-v3.json`・`policy-lv1-3-v1.json`・`policy-lv1-3-v2.json`・`policy-lv1-3-v3.json`・`inventory.json`・`input-contract.md`・`bank-and-scoring.md`・`store-contract.md`・`p23-40-plan.md`・`freeze-history.md`・`freeze-manifest.json` | unit: `src/courseDesign/inventory.test.ts`・`bank.test.ts`、`src/domain/chordDojo/guidedCourse/frozenFixture.test.ts`。e2e: `p23-42` 以降の 19 本が `bank-lv1-3-v3.json` を読む |
| `phase10.0/` | 修正レビューのしきい値(`P10-review-thresholds.json`: melody・percussion・sameChordSplit) | アプリ: `src/domain/correction/reviewThresholds.ts`。unit: `src/domain/__golden__/cases.ts`(golden テストが import) |
| `phase12.3/` | 組込み進行 25 件の期待値(`P12.3-builtins-expected.json`: `count` と各 builtin の degrees・judge・layer) | unit: `src/domain/chordDojo/builtins.p12-3.test.ts`。e2e: `e2e/helpers/p12-3.ts`(6 本が使う)。`scripts/archive/p21/measure-builtins.ts` |
| `phase5.31/` | テキスト入力の `fixtures/`(`.txt` の入力と、期待を書いた `.md`) | unit: `src/domain/phase531Baseline.test.ts`・`textControlRoundtrip.test.ts`・`textScoreTokenizer.test.ts`。e2e: `e2e/phase5.31-control-timing.spec.ts`。`scripts/archive/p24-00/compare-parsers.ts` |
| `phase5.32/` | 指使いの golden(`fingering-golden-fixtures.json`) | unit: `src/domain/phase532Baseline.test.ts` |
| `phase8.5-pre/` | extended-v1 の正解コーパス(`extended-v1-canonical-v1.json`: `rawText` と `expectedTokens`) | unit: `src/domain/extendedTextProgression.test.ts` が JSON を import する。`scripts/archive/p24-00/compare-parsers.ts` |
| `phase8.8.3/` | 製品が扱うコードの表(`product-supported-matrix.json`: 行ごとの required / optional / prohibited の pitch class) | unit: `src/domain/phase883Matrix.test.ts`・`phase883Semantic.test.ts`・`phase883Practice.test.ts`・`phase883Audition.test.ts` |
| `phase8.9/` | Vault の項目を動かさない契約(`P8.9-data-retention.md`)。`fileVersion` は 2 のまま | unit: `src/domain/p89DataRetention.test.ts`(合成の Vault の往復) |
| `stage-f/` | 測る前に固定したしきい値(`03-f2r-preregistered-thresholds.json`) | `scripts/archive/evaluate-selective-root-correction.ts` だけ。アプリ側の値は `src/domain/midi/selectiveRootCorrection.ts` に別にある |
| `txt-jazz/` | TXT-JAZZ の parser の証拠(`evidence/parser-current-tokens.json`・`evidence/parser-regression-before.json`・`evidence/stage01/parser-approved-differences.json`) | unit: `src/domain/txtJazzParser.test.ts`・`txtJazzParserRegression.test.ts` |
| `voicing-shapes-p26/` | 形の正解(`golden.json`: 12 のルート × 45 のコード × 形と部品 = 4,320 件) | unit: `src/domain/voicingShapes/golden.test.ts`・`basicParts.test.ts`・`textSavePath.test.ts`。`src/domain/voicingShapes/recipe.ts` は作る側 |
