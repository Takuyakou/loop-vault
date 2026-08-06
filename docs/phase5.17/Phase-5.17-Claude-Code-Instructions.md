# Phase 5.17 — Record & Compare

## Claude Code 実装指示書

> Bass Practiceで、ユーザー自身のベース演奏を録音し、採点や分析を行わず、TargetとMy Takeを聴き比べてから自己評価できるようにする。
>
> 本指示書は、初回だけ長文を渡し、以後は `AGENTS.md`、対象Phaseの単一入口 `README.md`、`execution-state.json` を正本として再開するワークフローを前提とする。

---

# 1. 最終目標

Phase 5.17の最終成果は次の状態です。

- Degree Echo、Rhythm Echo、Bassline Echoの3モードで録音できる
- 録音した自分の演奏をTargetと交互に聴き比べられる
- 録音結果を自動採点・自動分析しない
- 録音は既定で一時データとして破棄される
- ユーザーが明示的に `Keep Take` を選んだ録音だけローカル保存できる
- 保存した録音をPractice Historyから再生・削除できる
- 録音権限拒否、デバイス切断、保存失敗が起きてもBass Practice本体を利用できる
- 実ベースやMOTU M4を使わずに、主要な回帰テストを自動実行できる
- 実機確認前の最終判定は `READY FOR HARDWARE ACCEPTANCE — Record & Compare`
- 人間によるMOTU M4実機確認前にmasterへmergeしない

品質、安全性、再現性を優先してください。解析時間やテスト時間が増えても、壊れやすい近道は採用しないでください。

---

# 2. 現在の前提

P5.16では、少なくとも以下がローカルmasterへ統合済みです。

- Degree Echo
- Rhythm Echo
- Bassline Echo
- production defaultで3モードが有効
- FreePats Bass Guitar YR
  - Degree Echo：Finger Bass
  - Rhythm Echo：Picked Bass
  - Bassline Echo：Finger Bass
- Practice History
- 自己評価
- 4弦／5弦表示
- 右利き／左利き表示
- feature flag rollback経路

期待するP5.16統合commit：

```text
ffa2d909907ae9343b5b3596eaf873bba18e7aae
```

このcommit、またはこのcommitを祖先に含むcleanなローカルmasterを開始点としてください。

`origin/master`がローカルmasterより古くても、勝手にrebase、reset、force pushを行わないでください。ローカルmasterの実態を優先し、差異を報告してください。

---

# 3. 採用するPhase運用ワークフロー

## 3.1 正本の三層構造

### 第1層：ルート `AGENTS.md`

全Phase共通の安全規則だけを保持します。

### 第2層：`docs/phase5.17/README.md`

P5.17の単一入口です。Claude Codeは毎回このREADMEを最初に読み、ここに記載された順番で必須ファイルを読みます。

### 第3層：Phase詳細成果物

```text
docs/phase5.17/
├─ README.md
├─ work-instructions.md
├─ execution-state.json
├─ audit/
├─ contracts/
├─ reports/
└─ evidence/
```

- `work-instructions.md`：本Phaseの詳細仕様
- `execution-state.json`：現在Stage、完了Stage、Gate結果、次の一手
- `audit/`：事前監査
- `contracts/`：UX、storage、privacy、state machineなどの契約
- `reports/`：各Stageと最終報告
- `evidence/`：コミット可能な非個人・非生成物の検証証拠だけ

`docs/CURRENT_STATE.md`は復活させないでください。

## 3.2 初回だけ行うワークフロー導入確認

最初に以下を監査してください。

- `AGENTS.md`
- `CLAUDE.md`
- `docs/phase-workflow/`
- Phase template
- `execution-state`用JSON Schema
- `npm run validate:phase-docs`
- validatorの自動テスト

### 既に共通ワークフローが存在する場合

- 既存templateから `docs/phase5.17/` を生成する
- 既存validatorを使用する
- 同じ役割のファイルやscriptを重複作成しない

### 共通ワークフローが未導入の場合

P5.17機能実装へ直接進まず、最初に専用branchで共通ワークフローを導入してください。

Branch：

```text
chore/phase-docs-workflow
```

最低限、以下を作成または整備してください。

```text
AGENTS.md
docs/phase-workflow/README.md
docs/phase-workflow/CODEX-START-PROMPT.md
docs/phase-workflow/execution-state.schema.json
docs/phase-workflow/phase-template/README.md
docs/phase-workflow/phase-template/work-instructions.md
docs/phase-workflow/phase-template/execution-state.json
docs/phase-workflow/phase-template/reports/README.md
scripts/phase-docs/...
```

package script：

```bash
npm run validate:phase-docs
```

最低限のvalidator項目：

- Phase ID一致
- 必須ファイル存在
- required reading orderの参照先存在
- README内相対リンク切れ
- JSON Schema適合
- active Stageとcompleted Stagesの矛盾
- Stage ID重複
- 必須見出し欠落
- completedなのに必須Gateが未実行または失敗
- blocked状態とblocker reasonの矛盾
- Windows個人絶対path
- `.local-evaluation`の成果物参照
- raw/private MIDIまたは録音のcommit指示
- 廃止済み`docs/CURRENT_STATE.md`参照
- main/masterへの無断merge・push指示

正常fixtureと異常fixtureによるvalidator自動テストを追加してください。

共通ワークフローのGateがPASSした場合だけ、cleanなmasterへ `--no-ff` mergeしてください。pushは行わないでください。その後、更新されたmasterからP5.17を開始してください。

## 3.3 以後の再開方法

初回bootstrap後は、この長文を毎回読み直す必要はありません。

Claude Codeは毎回、次の順で再開してください。

1. ルート`AGENTS.md`を読む
2. `docs/phase5.17/README.md`を読む
3. READMEのrequired reading orderに従う
4. branch、worktree、HEAD、PR、`git status`を監査する
5. `execution-state.json`とGitの実態を照合する
6. 差異がある場合はGitの実態を優先してreportへ記録する
7. 最初の未完了Stageまたは未完了Gateから再開する
8. 指定外Stage、次Phase、merge、pushへ自動で進まない

各Stage終了時に、必ず次を更新してください。

- `README.md`のStatus / Active Stage / Completed Stages / Next action
- `execution-state.json`
- Stage report
- 検証結果
- commit hash

---

# 4. 共通安全規則

`AGENTS.md`に既に同等以上の規則がある場合は重複記述せず、その正本を参照してください。

最低限、以下を遵守してください。

- 未コミット変更を勝手にreset、stash、破棄しない
- 作業対象外のファイルを変更しない
- `git add -A`と`git add .`を使用しない
- 確認済みpathだけを明示的にstageする
- commit前にstaged diffとpath一覧を確認する
- test未実行をPASS扱いしない
- 過去HEADのtest結果を現在HEADの結果として流用しない
- main/masterへのmergeとpushを勝手に行わない
- 個人MIDI、外部corpus、`.local-evaluation`、実録音、個人絶対pathをcommitしない
- raw/private音声をreportへ記録しない
- worktree間で`node_modules`を共有しない
- junction、symlink、reparse point削除前に種別とtargetをread-only確認する
- Windows junctionへPowerShellの再帰削除を使用しない
- conflictを`ours`または`theirs`の一括適用で解消しない
- 指定されたStageより先へ自動的に進まない
- 意図不明な変更、依存、migrationが見つかったら停止して報告する

---

# 5. 開始前監査

最初に以下を確認してください。

- 現在のbranch
- 現在のHEAD
- `git status --short`
- merge、rebase、cherry-pick進行有無
- worktree一覧
- `ffa2d909`がmasterの祖先であること
- P5.15の凍結commitがmasterへ混入していないこと
- `docs/CURRENT_STATE.md`が存在しないこと
- P5.17が未着手であること
- docs workflowが導入済みか

masterがdirtyな場合は停止してください。reset、stash、破棄は行わないでください。

P5.17用branchと専用worktree：

```text
feat/p517-record-and-compare
```

既存のP5.15、P5.16、docs workflow用worktreeを変更しないでください。

禁止事項：

- masterへのmerge
- push
- Phase 5.18以降への着手
- P5.15の再開
- P5.16 historical reportの書き換え

---

# 6. 実装前に読むもの

最低限、以下を確認してください。

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/phase5.17/README.md`
4. READMEに記載されたrequired reading order
5. `package.json`
6. Bass Practiceのdomain、session、repository、UI、audio実装
7. Degree Echo
8. Rhythm Echo
9. Bassline Echo
10. Practice History
11. FreePats sample engine
12. Tauriの権限、capability、window設定
13. Playwright設定
14. Practice storageのRust実装
15. P5.16 Product Acceptance report
16. P5.16 FreePats A/B report

現在の状態機械、保存境界、audio lifecycle、feature flag方式を推測で置き換えないでください。

---

# 7. Phaseの目的

P5.17の目的：

> Bass Practiceでユーザーの実際の演奏を録音し、TargetとMy Takeを聴き比べた後、従来どおりユーザー自身がReviewする。

録音結果から以下を自動判定してはいけません。

- 正しい音程か
- 正しいリズムか
- 正しい音価か
- ミュートが正しいか
- 上手いか下手か
- 正解率
- スコア
- レベル

録音は、自己評価を正確にするための鏡として扱ってください。

---

# 8. Non-goals

以下はP5.17へ入れないでください。

- ピッチ検出
- onset検出
- rhythm採点
- duration採点
- 自動スコア
- 音名推定
- オーディオからMIDIへの変換
- 汎用音声転写
- DI自動採点
- マイク自動採点
- コード伴奏
- テンポランプ
- 元MIDIベースライン教材化
- Root Motion Echo
- ポジション制約判定
- Chord Dojo合同セッション
- 五線譜
- cloud保存
- 録音共有
- リアルタイムエフェクト
- アプリ経由のリアルタイムモニタリング
- 波形編集
- ノイズ除去
- コンプレッサーやEQによる演奏音の加工

入力レベル表示、clip検知、左右チャンネル選択、mono化は録音成立に必要なため許可します。

---

# 9. 対象モード

Record & Compareは既存3モードすべてで利用可能にしてください。

- Degree Echo
- Rhythm Echo
- Bassline Echo

モードごとに録音ロジックを複製せず、共通の録音domain、controller、UI部品を利用してください。

既存のgenerator、session、review、history、FreePats playbackを壊さないでください。

---

# 10. UXフロー

基本フロー：

```text
Listen
→ Sing
→ Think
→ Record Setup
→ Count-in
→ Play / Record
→ Listen Back
→ Review
```

## 10.1 Record Setup

最低限、以下を表示してください。

- Record & Compareを使うか
- 入力デバイス
- 入力チャンネル
- 入力レベル
- clip警告
- 録音可能状態
- 権限状態
- 録音せず従来どおり続ける選択肢

入力権限はアプリ起動時やBass Practice画面表示時には要求せず、ユーザーが録音機能を有効化した時だけ要求してください。

## 10.2 入力チャンネル

MOTU M4などの複数入力オーディオインターフェースを考慮し、最低限次を選択可能にしてください。

- Auto
- Left / Input 1
- Right / Input 2
- Mono Sum

録音結果は原則monoとして扱ってください。

Autoの判定方法を明文化し、失敗時は手動選択できるようにしてください。

## 10.3 Count-in

- 既存テンポを使用
- 既存拍子を使用
- count-in後に録音開始
- Target音は録音中に再生しない
- count-inをMy Takeへ極力含めない
- 録音開始タイミングの誤差を測定・記録

Rhythm Echoで録音中メトロノームを使用できる場合は既定OFFとしてください。ONの場合はヘッドホン推奨を表示してください。

## 10.4 Listen Back

最低限、以下を提供してください。

- Hear Target
- Hear My Take
- Target → My Take
- My Take → Target
- Retake
- Discard
- Keep Take
- Reviewへ進む

TargetとMy Takeを同時再生しないでください。

My Takeを一度も聴いていない状態でReviewへ進む場合は、次のどちらかを明示させてください。

- My Takeを聴く
- 聴き返しをスキップする

強制自動再生は行わないでください。

## 10.5 Review

従来の自己評価を維持してください。

- Again
- Hard
- Good
- Easy
- 既存の弱点タグ
- 既存の自由記述がある場合は維持

録音や聴き返し回数を能力スコアへ変換しないでください。

---

# 11. 録音機能の設計

## 11.1 抽象化

UIから`navigator.mediaDevices`や`MediaRecorder`を直接呼び出さないでください。

最低限、次の境界を設計してください。

```text
PracticeRecorder
CaptureDeviceRepository
RecordingSessionController
RecordingTakeRepository
RecordingCapability
```

browser/Tauri実装とfake実装を分離し、通常testで実機マイクを要求しないでください。

## 11.2 Capability監査

実装前にtarget runtimeで以下を確認してください。

- `navigator.mediaDevices`
- `getUserMedia`
- `enumerateDevices`
- `MediaRecorder`
- `MediaRecorder.isTypeSupported`
- `AudioContext`
- `MediaStreamAudioSourceNode`
- `ChannelSplitterNode`
- `ChannelMergerNode`
- `MediaStreamAudioDestinationNode`
- `devicechange` event

必要APIが利用できない場合、巨大な独自録音エンジンを追加せず、次の判定で停止してください。

```text
BLOCKED — required recording capability unavailable in target runtime
```

## 11.3 Codec選択

単一codecを決め打ちしないでください。

- `MediaRecorder.isTypeSupported()`で確認
- 実際に録音開始できることを確認
- MIME typeをRecordingTakeへ保存
- 録音後に再生可能性も確認
- 対応codecがない場合は録音機能だけ無効化
- Bass Practice本体は利用可能なまま維持

codec選択順と採用結果をreportへ記録してください。

## 11.4 Live monitoring

入力streamをスピーカーへ接続しないでください。

アプリ経由のlive monitoringは遅延・feedbackの原因になるため対象外です。MOTU M4等のハードウェアDirect Monitorを前提とします。

level meter用AnalyserNodeはdestinationへ接続しないでください。

## 11.5 音量表示

- RMSまたは同等の安定したlevel表示
- peak表示
- clip warning
- 色だけで状態を伝えない
- 更新頻度を制限
- 非表示時や録音終了時に処理停止
- level値を保存・送信しない
- 採点と誤認させない

---

# 12. 録音状態機械

明示的な状態機械として実装してください。

最低限：

```text
unavailable
idle
requesting-permission
permission-denied
device-missing
ready
counting-in
starting
recording
stopping
recorded
playing-target
playing-take
saving
saved
discarded
error
```

禁止遷移を定義してください。

以下に耐える必要があります。

- 録音開始連打
- 録音停止連打
- 録音開始直後のStop
- count-in中のCancel
- 録音中のtab変更
- 録音中のroute変更
- 録音中のwindow close
- device切断
- 権限取消
- MediaRecorder error
- Blob生成失敗
- 再生中のRetake
- 保存中の削除
- モード切替
- feature flag OFFへの切替

録音失敗によってPractice session全体をabandonedにしないでください。録音機能だけを安全に無効化し、従来の自己評価へ戻れるようにしてください。

---

# 13. Resource lifecycle

以下を必ず解放してください。

- MediaStreamTrack
- MediaRecorder callback
- AudioContext node
- AnalyserNode
- ChannelSplitter / ChannelMerger
- MediaStreamDestination
- interval
- timeout
- animation frame
- event listener
- Blob URL

次の場合に停止・解放してください。

- Discard
- Retake
- Review完了
- mode変更
- tab変更
- route leave
- component unmount
- application close
- permission失効
- device切断
- feature flag OFF

複数回録り直してもstream、node、Blob URLが増え続けないようにしてください。

---

# 14. 録音データの扱い

## 14.1 既定動作

録音は既定で一時データです。

以下で破棄してください。

- Review完了
- Discard
- Retake後の旧take
- route leave時の確認後
- app終了
- session破棄

録音しただけで永続保存しないでください。

## 14.2 Keep Take

ユーザーが明示的に`Keep Take`を選択した場合だけローカルへ保存してください。

保存先要件：

- Vaultとは別
- Vault schemaを変更しない
- Practice JSONへbase64を埋め込まない
- `localStorage`へ音声Blobを保存しない
- cloudへ送信しない
- 個人絶対pathをmetadataへ記録しない
- opaque IDで管理
- binary-safe
- version管理
- 削除可能
- quota有限
- 自動的に古いtakeを削除しない

既存Tauri practice storageの拡張かIndexedDB等かを監査して決定してください。新dependencyやTauri pluginが必要なら、必要性、代替案、権限増加をauditへ記録してください。

## 14.3 保存metadata

最低限：

- recording ID
- Practice session ID
- exercise IDまたは安定したexercise signature
- mode
- createdAt
- duration
- MIME type
- byte size
- channel mode
- input deviceの非識別的な表示名
- schema version

保存禁止：

- OS絶対path
- report内の生device ID
- ユーザー名
- 個人MIDI path
- 音声分析結果
- 推測音名
- 推測精度

## 14.4 保存上限

- 1 takeの最大時間を有限化
- 現在の最大exercise長＋安全余裕から決定
- 全保存takeの合計quotaを有限化
- quota値と根拠をreportへ記録
- quota超過時に自動削除しない
- 保存だけ失敗させ、一時take再生は維持
- 保存管理画面から容量と削除操作を提供

---

# 15. History統合

保存takeはPractice Historyから再生・削除できるようにしてください。

表示可能な事実：

- Recording retained
- Duration
- Date
- Mode
- File size
- Input channel
- Played back before reviewか
- Review結果

表示禁止：

- Accuracy
- Pitch score
- Rhythm score
- Performance level
- 自動的な上手い／下手判定

録音ファイル欠落・破損時もHistory全体を壊さないでください。

- History entryは読める
- `Recording unavailable`を表示
- entry削除可能
- 他の履歴は正常

孤立binaryと孤立metadataを安全に検出・整理できるようにしてください。

---

# 16. Settings / Feature flag

Practice Settingsへ最低限追加：

- Record & Compare：ON / OFF
- Input device
- Input channel
- Input level test
- Keep Takeの既定：OFF固定
- 録音保存容量
- 保存take管理
- 権限状態
- 再取得操作

独立feature flag：

```text
enableBassPracticeRecordCompare
```

最終production defaultは`true`とします。

明示的なlocal `false`で即時無効化できるrollback経路を維持してください。既存3モードのflagとは独立させてください。

production-default E2Eではtestからflagを`true`へ注入しないでください。

---

# 17. Accessibility

最低限：

- キーボードだけで全操作可能
- 録音開始・停止のfocus維持
- permission errorをscreen readerへ通知
- recording状態をARIA liveで通知
- level meterにtext代替
- clip状態を色だけで伝えない
- 録音時間を読み上げ可能
- Retake / Discard / Keepの意味を明確化
- destructive deleteに確認
- reduced motion時にmeter animationを抑制
- focus trapを作らない
- permission dialog後のfocus復帰
- 200% scale対応
- 320px幅で主要操作を維持

---

# 18. Privacy

UIとdocsで以下を明示してください。

- 録音はローカルだけ
- cloud送信なし
- 自動分析なし
- 自動採点なし
- 既定では保存しない
- Keep Take時だけ保存
- 保存takeは削除可能
- Vaultとは分離
- feature OFFでも保存takeを勝手に削除しない

ログ、report、test artifactへ出力禁止：

- 実録音音声
- 生device ID
- 個人絶対path
- ユーザー名
- 個人MIDI
- 入力音声から推測した内容

---

# 19. Stage構成

## P5.17-00 — Workflow / Audit / Contract / Baseline

### 目的

Phase workflowを適用し、実装前提と契約を固定する。

### 実施内容

- docs workflow導入確認
- `docs/phase5.17/`生成
- runtime recording capability
- Tauri permission設定
- device enumeration
- codec
- channel routing
- Practice state machine
- History storage
- resource lifecycle
- feature flag
- test automation方法
- privacy boundary
- production bundle実現可否

### 成果物

- repository audit
- architecture decision
- UX contract
- storage contract
- privacy contract
- state machine contract
- test plan
- baseline test結果
- README更新
- execution-state更新

このStageではproduction機能を実装しないでください。

Commit例：

```text
P5.17-00: Record & Compare監査と契約を固定
```

## P5.17-01 — Capture Foundation

### 実装範囲

- capability adapter
- device repository
- permission state
- codec negotiation
- input channel routing
- mono capture
- input meter
- clip warning
- recorder state machine
- resource cleanup
- fake implementation

UIはdiagnostic harnessまたはSettings最小接続までに留め、3モード統合は次Stageとしてください。

Commit例：

```text
P5.17-01: Practice録音基盤を実装
```

## P5.17-02 — Session Flow Integration

### 実装範囲

- Degree Echo統合
- Rhythm Echo統合
- Bassline Echo統合
- count-in
- Play / Record
- Listen Back
- Target / My Take
- Retake
- Skip recording
- Review継続
- mode / tab / route lifecycle

Commit例：

```text
P5.17-02: Record & Compareを3モードへ統合
```

## P5.17-03 — Persistence / History

### 実装範囲

- ephemeral default
- Keep Take
- binary storage
- metadata
- quota
- History playback
- delete
- corruption耐性
- orphan cleanup
- migration
- privacy UI

Commit例：

```text
P5.17-03: 保存takeとHistoryを実装
```

## P5.17-04 — Product Hardening

### 実装範囲

- production-default feature flag
- permission denied
- no device
- device disconnect
- unsupported codec
- storage denial
- quota exceeded
- route leave
- repeated retake
- accessibility
- viewport
- resource leak
- build identity
- Tauri smoke

Commit例：

```text
P5.17-04: Record & Compareを製品品質へ強化
```

## P5.17-05 — Release Gates / Acceptance

全自動Gate、direct executable、setup、Product Acceptance reportを作成してください。

masterへmergeせず、人間の実機確認待ちで停止してください。

Commit例：

```text
P5.17-05: Record & Compare release gatesを完了
```

---

# 20. execution-state.jsonの最低要件

少なくとも次を保持してください。

```json
{
  "schemaVersion": 1,
  "phaseId": "5.17",
  "status": "planned",
  "activeStage": "P5.17-00",
  "completedStages": [],
  "blocked": false,
  "blockerReason": null,
  "baseCommit": "",
  "lastVerifiedCommit": "",
  "currentBranch": "feat/p517-record-and-compare",
  "requiredGates": {},
  "gateResults": {},
  "nextAction": "Run repository audit",
  "updatedAt": ""
}
```

`updatedAt`は補助情報であり、Gitの実態より優先しません。

Stageを完了扱いにする前に、そのStageの必須Gateとcommit hashが記録されている必要があります。

---

# 21. 自動テスト

実ベースやMOTU M4を通常testの前提にしないでください。

## 21.1 Unit / component tests

最低限：

- capability available / unavailable
- permission prompt
- permission denied
- no device
- device list
- devicechange
- codec選択
- codecなし
- left channel
- right channel
- mono sum
- input meter
- clip warning
- state遷移
- 禁止遷移
- double start
- double stop
- cancel during count-in
- stop immediately after start
- recorder error
- Blob error
- Retake
- Discard
- Keep Take
- route leave
- tab leave
- mode change
- unmount
- feature flag OFF
- track stop
- Blob URL revoke
- timer cleanup
- event listener cleanup
- quota exceeded
- storage failure
- corrupt metadata
- missing binary
- orphan binary
- future storage version
- History playback
- History delete
- no Vault mutation

## 21.2 Deterministic fake input

スクリプトで決定的に生成してください。

- mono sine
- stereo left-only
- stereo right-only
- silence
- clipped signal
- short impulse
- fixed bass-like harmonic signal

実ユーザー音声をfixtureにしないでください。

生成一時音声はignored directoryへ置き、commitしないでください。

## 21.3 Playwright

可能な限りfake media deviceを使用してください。

最低限：

1. production defaultでRecord & Compare表示
2. feature flag true注入なし
3. permission allowed
4. permission denied
5. device選択
6. right channel入力
7. Degree Echo録音
8. Rhythm Echo録音
9. Bassline Echo録音
10. My Take再生
11. Target再生
12. Retake
13. Discard
14. Review保存
15. Keep Take
16. restart後History再生
17. saved take削除
18. explicit feature flag false
19. keyboard only
20. screen reader labels
21. reduced motion
22. 200% scale
23. 320px viewport

## 21.4 Tauri

最低限：

- production release build
- direct executable起動
- microphone capability
- permission拒否時にクラッシュしない
- deviceなしでもPractice利用可能
- app close時にstream解放
- app data保存
- 保存take再読込
- 保存take削除

OS permission dialogの完全自動化が困難な場合は制約を明記してください。Web側だけの確認をTauri対応済みと表現しないでください。

---

# 22. Resource / performance Gate

最低限、以下を測定してください。

- 20回連続Retake
- 20回Start / Stop
- 3モード連続切替
- route leave / return
- 保存／削除繰り返し
- permission拒否／再試行
- device disconnect相当

確認項目：

- active MediaStreamTrack 0
- retained recorder 0
- retained Blob URL 0
- retained AudioNode増加なし
- active timer増加なし
- active event listener増加なし
- stuck output sound 0
- memoryが無制限に増加しない
- History load時間の著しい退行なし
- Bass Practice既存benchmarkの退行なし

---

# 23. 全体Gate

P5.17-05では最低限、以下を実行してください。

- `npm run validate:phase-docs`
- phase docs validator tests
- `npm run lint`
- app TypeScript typecheck
- E2E TypeScript typecheck
- Bass Practice全Vitest
- Record & Compare全test
- full Vitest
- Rust full test
- production-default Playwright
- full Playwright
- accessibility
- keyboard
- reduced motion
- viewport
- Web production build
- Tauri release build
- P5.16 release benchmark
- P5.17 resource benchmark
- `git diff --check`

Privacy / protected surfaces：

- tracked MIDI 0
- tracked `.local-evaluation` 0
- tracked実録音0
- personal absolute path 0
- P5.15差分0
- Vault schema差分0
- Vault mutation 0
- Analyzer差分0
- MIDI Exporter差分0
- Chord Dojo非退行
- Live MIDI非退行
- FreePats playback非退行
- feature flag OFF非退行
- `docs/CURRENT_STATE.md`未復活

P5.15外部fixture等の既知例外が存在する場合は、P5.17固有Gateとリポジトリ全体Gateを分離し、事実を正確に報告してください。既知例外を理由にP5.17固有の失敗を隠さないでください。

---

# 24. Product Acceptance build

全自動GateがPASSしたら、次を生成してください。

- direct executable
- NSIS setup
- MSI

reportへ記録：

- file name
- repository-relative path
- byte size
- SHA-256
- build commit
- app version
- build date
- production feature flag値
- codec
- storage方式
- quota
- Tauri permission設定

生成物はcommitしないでください。

---

# 25. 人間による最終確認

自動Gate完了後、次の判定で停止してください。

```text
READY FOR HARDWARE ACCEPTANCE — Record & Compare
```

masterへmergeしないでください。

Product Acceptance reportに、ユーザーの実機確認手順を記載してください。

最低限：

1. MOTU M4を選択
2. ベースを接続したinput channelを選択
3. input meter確認
4. clipしないことを確認
5. Degree Echoを録音
6. TargetとMy Takeを比較
7. Retake
8. Rhythm Echoを録音
9. Bassline Echoを録音
10. Keep Take
11. アプリ再起動
12. Historyから再生
13. 保存take削除
14. 録音中にtab変更
15. 録音中にStop
16. stuck soundがない
17. streamが解放される
18. Vaultが変更されていない

人間確認後のmerge指示は別途行います。

---

# 26. Commit規則

各Stageを独立commitにしてください。

禁止：

- `git add -A`
- `git add .`
- 無関係ファイルのstage
- generated録音のcommit
- test artifactのcommit
- personal pathのcommit
- executableのcommit
- 自動merge
- push

各commit前：

- `git status --short`
- `git diff`
- `git diff --check`
- 明示path一覧
- staged diff
- staged name-status
- generated artifact 0
- phase docs validator

各commit後：

- commit hash
- commit path一覧
- `git status --short`
- README更新
- execution-state更新
- Stage report更新
- 次Stageの開始条件

---

# 27. 停止条件

以下の場合は安全に停止してください。

- target runtimeで録音APIが利用できない
- microphone permissionを構成できない
- production Tauriだけ録音不能
- 録音のためにP5.15を取り込む必要がある
- Vault schema変更が必要
- Practice Historyを破壊するmigrationが必要
- 実録音がGitへ入る
- 個人音声がreportへ入る
- device IDや絶対pathが漏れる
- resource leakを解消できない
- 録音失敗がPractice全体を壊す
- 既存3モードに退行が起きる
- 自動採点なしでは成立しない設計になる
- docs workflowの正本が複数できる
- `execution-state`とGit実態の不整合を解消できない

停止時にreset、stash、破棄、無関係なrollbackを行わないでください。

---

# 28. 最終報告

最終報告には以下を含めてください。

- Final determination
- Branch
- HEAD
- base master commit
- Stage commit chain
- workflow導入状況
- README単一入口
- execution-state最終状態
- phase docs validator結果
- repository audit
- 録音architecture
- capability結果
- codec
- permission方式
- channel routing
- 状態機械
- 各モード統合結果
- 保存方式
- quota
- privacy
- accessibility
- Unit / component test結果
- Playwright結果
- Rust結果
- Web / Tauri build結果
- resource benchmark
- protected surfaces
- direct executable
- NSIS
- MSI
- SHA-256
- `git status --short`
- master未merge
- push未実行
- Phase 5.18未着手
- 人間実機確認項目

最終判定は次のいずれかにしてください。

```text
READY FOR HARDWARE ACCEPTANCE — Record & Compare
BLOCKED — recording capability unavailable
FAIL — Record & Compare is not production-safe
```

報告後に停止してください。

---

# 29. 次回以降にClaude Codeへ貼る短い再開文

以下を `docs/phase-workflow/CODEX-START-PROMPT.md` または `docs/phase5.17/README.md` から参照できるように保存してください。

```text
最初にリポジトリルートのAGENTS.mdと、対象Phaseの単一入口であるdocs/phase5.17/README.mdを全文読んでください。

READMEに記載されたrequired reading orderに従って必要ファイルを確認してください。

その後、branch、worktree、HEAD、PR、git statusとexecution-state.jsonを照合してください。記録と実態が異なる場合はGitの実態を優先し、差異をreportへ記録してください。

最初の未完了Stageまたは未完了Gateから再開し、README、work-instructions、execution-stateに定義された順序、禁止事項、完了条件を省略しないでください。

各Stage完了時にREADME、execution-state、Stage report、検証結果、commit hashを更新してください。

指定外Stage、次Phase、masterへのmerge、pushには進まず、停止条件に該当した場合は変更を破棄せず報告して停止してください。
```
