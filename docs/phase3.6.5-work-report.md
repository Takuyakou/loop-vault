# Loop Vault Phase 3.6.5 作業報告書

作成日: 2026-07-16
対象: Voice-Aware MIDI Chord Detection
実装計画: `loop-vault-phase3.6.5-voice-aware-midi-detection-plan.md`

## 1. 結論

Phase 3.6.5のStage 0、Stage A、Stage Bを実装し、Stage Cの実装可否を判定した。

- raw SMFをtrackとchannelの組み合わせでVoiceへ分解できるようにした。
- GM Program、Track Name、音域、密度、ポリフォニー等からVoice Roleを推定できるようにした。
- Voiceごとのroot、bass、quality、tension evidenceを使う`voice-aware-rerank-v1`を追加した。
- clean 100件から決定的にdirty MIDI 1,100件を生成する評価基盤を追加した。
- Top-K候補の多様化、操作ベースの修正コスト、類似区間への修正伝播を追加した。
- Analysis Mixerは計画の条件付き項目であり、実装ゲート未通過のためPhase 3.6.5.1へ延期した。
- `defaultAnalyzerMode`は`legacy`、`fileVersion`は`1`のまま維持した。

アプリの通常利用経路と既存データの読み込みを維持し、解析途中データは永続化していない。保存済み進行にはoptionalな`timeSignature`を追加したが、計画の指定どおり`fileVersion`は`1`のままである。

## 2. 実装内容

### Stage 0: 現状監査

Phase開始時点の解析器、評価データ、既定モード、永続化境界を棚卸しし、監査結果を`docs/phase3.6.5-audit.md`へ記録した。

### Stage A1: raw SMFとVoiceモデル

`src/domain/midi/rawSmf.ts`と`src/domain/midi/voices.ts`を中心に、SMFを解析ライブラリ固有型から自前型へ変換する経路を追加した。

- Voice IDは`${trackIndex}:${channel}`。
- Note On時点のProgram Changeを各ノートへ付与する。
- 明示Program 0と、Program Change欠落時の暗黙Program 0を区別する。
- channel 9（GM channel 10）はpercussionとしてコード判定証拠から除外する。
- Type 0とType 1を同じVoice構造へ変換する。
- tempo変更列を保持し、拍子は時系列上の最初の値を採用する。
- track終端tickを保持して解析結果へ公開するのではなく、dangling Note Onを決定的に閉じる処理に使う。
- format 2とSMPTE time divisionは明示的に非対応エラーとする。

主な型は`src/domain/midi/types.ts`に置かれている。domain層はReact、Zustand、Tauri APIをimportしない。

### Stage A2: Voice RoleとEvidence Profile

`src/domain/midi/gmRoles.ts`、`src/domain/midi/voiceRoles.ts`、`src/domain/midi/voiceProfiles.ts`に実装した。

- Role: `bass` / `harmony` / `pad` / `melody` / `percussion` / `mixed`
- 証拠: channel hard rule、明示GM Program、Track Name、実測特徴量
- 実測特徴量: pitch range、median pitch、duration、density、polyphony、同時発音率、最低音/最高音占有率、stepwise motion、repeated pitch class、sustain
- 低信頼時は無理に単一役割へ固定せず`mixed`へ落とす。
- role overrideとenabled Voiceを受け取る`AnalysisInput`を追加した。
- bass、harmony、pad、melodyごとにroot/bass/quality/tensionへの寄与率を分離した。

### Stage A3: dirty MIDI評価コーパス

`src/domain/midi/evaluation/degrade.ts`と`scripts/generate-dirty-midi-corpus.ts`に、seed固定の劣化生成器を追加した。

clean 100件から次の劣化を生成し、合計1,100件を評価対象にした。

1. Type 0 merge
2. GM drums overlay
3. lead melody overlay
4. track name removal
5. program change removal
6. all program 0
7. sustain extension
8. timing jitter
9. piano left-hand bass overlay
10. same-channel melody overlay
11. combined degradation

同じ入力とseedからbyte-identicalなMIDIを生成する。EOTを維持し、clean/dirtyを別集計する。

評価成果物: `artifacts/phase3.6.5-dirty-baseline/`

### Stage A4: Voice-aware reranker

`src/domain/midi/voiceAwareReranker.ts`に`voice-aware-rerank-v1`を追加した。

- legacyの区間境界を固定する。
- 区間内でVoice-aware evidenceを使ってTop-8候補を再採点する。
- legacy候補を候補集合に必ず残す。
- Voice-aware候補が明確に優位な場合だけ主候補を置換する。
- 同じMIDI bytesと同じ`AnalysisInput`から同じ結果を返す。

評価成果物: `artifacts/phase3.6.5-voice-aware/`

### Stage B1: 候補の多様化

`src/domain/midi/candidateDiversity.ts`に、スコア順だけではなく仮説の種類を残す候補選定を追加した。

- global top score
- different root
- same root / different quality
- bass-root hypothesis
- equivalent pitch-set hypothesis

UIへ渡す候補は主候補と最大4件のalternative、合計最大5件に絞る。内部Top-8は維持する。

評価成果物: `artifacts/phase3.6.5-candidate-diversity/`

### Stage B2: 操作ベースの修正コスト

`src/domain/midi/correctionCost.ts`に0〜4の修正コストを追加した。

| コスト | 意味 |
|---:|---|
| 0 | Top-1が正解 |
| 1 | 候補選択または同値操作で正解へ到達 |
| 2 | Root / Quality / Bass編集で到達 |
| 3 | コード名の手入力が必要 |
| 4 | 正解候補が生成されていない |

mean、median、P90をclean/dirty/category/analyzer別に集計する。既存feedback schemaは維持し、structure editor由来の操作を判別可能にした。

評価成果物: `artifacts/phase3.6.5-correction-cost/`

### Stage B3: 修正伝播

`src/domain/progressionEditing/similarSegments.ts`とProgression Editing Workspaceに、修正済みコードを類似区間へ提案する機能を追加した。

- weighted PCP、bass profile、root、chord family、duration、metric position、key context、前後コード、enabled Voice、role profileの11要素で類似度を計算する。
- 自動適用せず、候補をチェックボックスでユーザーへ提示する。
- 候補ごとに試聴できる。
- 選択区間への一括適用は1回のUndoで戻せる。
- 表示、採用、拒否、threshold、analyzer versionをfeedbackへ記録する。
- feedbackの保存はVault保存成功後だけ行う。
- 現在編集中の進行候補内だけを対象とし、別候補や別SongIdeaには伝播しない。

### Stage C: Analysis Mixer判定

判定書は`docs/phase3.6.5-analysis-mixer-gate.md`。

Stage Cは実装せず、Phase 3.6.5.1へ延期した。理由は次のとおり。

- Real MIDIのGold / Silver / Bronze / Unlabeledがすべて0件。
- `all_instruments.mid`が評価入力に存在しない。
- dirty strict guardがFAILED。
- Voice選択あり/なしのpaired ablationが0件。
- 正解Role付きVoice、Role誤分類率、手動Voice選択による補正コスト改善、実利用観察が未計測。

UIを先に追加すると効果未検証の操作を増やし、同期解析の再実行やdirty state管理も複雑にするため、計測条件を満たすまで延期する判断とした。

### 最終レビュー後の修正

最終コードレビューで検出した問題は、機能PRへ混ぜ戻さず、独立した積み上げPRとして修正した。

- dirty strict guardで`drums`と`type0`の改善を必須化し、Real Gold guardへExact@1非退行を追加した（`scripts/evaluate-voice-aware-reranker.ts`、`src/domain/midi/realEvaluation/guards.ts`）。
- Voiceごとの配列コピーとノート単位の全ノート走査を廃止し、共有sweepで最低音・最高音境界を前計算した（`src/domain/midi/voices.ts`）。
- Format 1のProgram Changeをtrack-localではなく、全trackをマージしたchannel時系列としてNote Onへ付与した（`src/domain/midi/rawSmf.ts`）。
- Program状態はchannel全体で共有しつつ、同一channel/pitchのNote On/Offはtrack単位で対応させた（`src/domain/midi/rawSmf.ts`）。
- 修正伝播後に候補カードを折りたたんでも、保存時までaccepted/rejected feedbackを保持するようにした（`src/views/CaptureView.tsx`）。
- 通常の補正ログは従来どおり`eventType`なしで出力し、現行reader側で`chord-correction`へ正規化することで旧promotion consumerとの互換を維持した（`src/domain/midi/feedback.ts`）。
- dirty strict guardをカテゴリ集約だけでなく、`drums`と`type0`それぞれのRoot / Quality / Exact @1/@3と2種類の修正コストで個別判定するようにした（`scripts/evaluate-voice-aware-reranker.ts`）。
- Real MIDI JSONL破損は行番号付きエラーにし、登録済みsourceの欠損は評価失敗にした（`scripts/evaluate-real-midi.ts`、`src/domain/midi/realEvaluation/jsonl.ts`）。
- 3分MIDI benchmarkへ`voice-aware-rerank-v1`を追加した（`scripts/benchmark-midi-analysis.ts`）。

## 3. 評価結果

### clean 100件

| 指標 | legacy | voice-aware | 差 |
|---|---:|---:|---:|
| Root@1 | 57.76% | 58.19% | +0.43pp |
| Quality@1 | 60.83% | 61.37% | +0.54pp |
| Exact@1 | 13.69% | 13.69% | +0.00pp |
| Exact@3（B1後） | 19.67% | 21.23% | +1.56pp |

clean regression guardと決定性テストはPASSした。

### dirty 1,100件

dirty strict guardは**FAILED**。

- `type0`、`drums`、`melody`、`metadata-missing`、`sustain`、`jitter`、`same-channel-mixed`は`mixed`。
- `combined`は`regressed`。
- strict条件で`improved`と判定されたカテゴリは0。

cleanでの小幅改善だけを根拠に既定解析器を切り替えることはできないため、`defaultAnalyzerMode = "legacy"`を維持した。

### 修正コストの例

| Dataset | legacy | voice-aware | 差（voice-aware - legacy） |
|---|---:|---:|---:|
| clean | 2.7457 | 2.7060 | -0.0397 |
| same-channel-mixed | 2.8965 | 2.8459 | -0.0506 |
| sustain | 2.7457 | 2.7864 | +0.0407 |
| combined | 2.8412 | 2.9064 | +0.0652 |

改善カテゴリと退行カテゴリが混在しており、B2 strict guardもFAILEDである。

### 性能

`npm run benchmark:midi`で3分相当のsynthetic MIDIを計測した。各Analyzerをwarm-up後に5回実行し、そのmedianを採用する。下表は2026-07-16の代表1実行であり、端末負荷により変動する。

| Analyzer | 実行時間 | legacy比 |
|---|---:|---:|
| legacy | 81.3ms | 1.00x |
| hybrid-v1 | 2,289.0ms | 28.14x |
| legacy-boundary reranker | 292.4ms | 3.59x |
| voice-aware-rerank-v1 | 240.4ms | 2.96x |

legacy-boundary rerankerとvoice-aware rerankerは、このfixtureでは同期実行で1秒未満だった。ただし実ファイル`all_instruments.mid`によるUI freeze確認は未実施である。

### Real MIDI

`npm run eval:real-midi`の結果はGold / Silver / Bronzeが`0 / 0 / 0`。評価スクリプト自体は正常終了したが、精度を判定できる実データはない。

## 4. テストとビルド

2026-07-16の最終QA結果:

- `npm test -- --run`: **85 files / 516 tests PASS**
- `npm run lint`: **PASS**
- `npx tsc --noEmit`: **PASS**
- `npm run build`: **PASS**
- `npm run tauri build`: **PASS**
- `git diff --check`: **PASS**

Vite buildには約765KBのchunk size warningが残るが、ビルド失敗ではない。

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 5. UI手動確認

ローカル開発画面で次を確認した。

- 日本語のホーム、コード採集初期画面、設定モーダルが表示される。
- 設定の表示言語を日本語からEnglishへ切り替えると、ナビゲーション、コード採集、設定が英語へ切り替わる。
- 確認後は日本語へ戻した。
- 1440x900および390x844でコード採集初期画面を確認し、横スクロールとボタン内テキスト切れがない。
- ブラウザーコンソールにerror / warningはない。

ブラウザーQAではTauriネイティブのMIDIファイル選択ダイアログを操作していない。MIDI解析、候補多様化、修正コスト、修正伝播はdomain/store/UIテストと評価コーパスで確認した。

## 6. PRスタック

1タスク1ブランチ1PRとして、依存順に積み上げた。各PRは日本語タイトル・日本語本文、OPEN、非Draft、mergeable状態である。

| PR | Branch | 内容 |
|---:|---|---|
| [#85](https://github.com/Takuyakou/loop-vault/pull/85) | `docs/p3-6-5-00-audit` | 現状監査 |
| [#86](https://github.com/Takuyakou/loop-vault/pull/86) | `feature/p3-6-5-01-voice-model` | raw SMF / Voiceモデル |
| [#87](https://github.com/Takuyakou/loop-vault/pull/87) | `feature/p3-6-5-02-role-profiles` | Role推定 / Evidence Profile |
| [#88](https://github.com/Takuyakou/loop-vault/pull/88) | `feature/p3-6-5-03-dirty-corpus` | dirty MIDI評価コーパス |
| [#89](https://github.com/Takuyakou/loop-vault/pull/89) | `feature/p3-6-5-04-voice-aware-reranker` | Voice-aware reranker |
| [#90](https://github.com/Takuyakou/loop-vault/pull/90) | `feature/p3-6-5-05-candidate-diversity` | 候補多様化 |
| [#91](https://github.com/Takuyakou/loop-vault/pull/91) | `feature/p3-6-5-06-correction-cost` | 操作ベース修正コスト |
| [#92](https://github.com/Takuyakou/loop-vault/pull/92) | `feature/p3-6-5-07-correction-propagation` | 修正伝播UI |
| [#93](https://github.com/Takuyakou/loop-vault/pull/93) | `docs/p3-6-5-08-analysis-mixer-gate` | Analysis Mixer実装ゲート判定 |
| [#94](https://github.com/Takuyakou/loop-vault/pull/94) | `fix/p3-6-5-09-evaluation-guards` | dirty / Real Gold評価ゲート修正 |
| [#95](https://github.com/Takuyakou/loop-vault/pull/95) | `fix/p3-6-5-10-voice-build-performance` | Voice構築の二乗計算解消 |
| [#96](https://github.com/Takuyakou/loop-vault/pull/96) | `fix/p3-6-5-11-global-program-chronology` | 全track Program時系列 |
| [#97](https://github.com/Takuyakou/loop-vault/pull/97) | `fix/p3-6-5-12-propagation-feedback` | 折りたたみ後の伝播feedback保持 |
| [#98](https://github.com/Takuyakou/loop-vault/pull/98) | `fix/p3-6-5-13-feedback-compat` | 通常補正ログの旧形式互換 |
| [#99](https://github.com/Takuyakou/loop-vault/pull/99) | `fix/p3-6-5-14-track-local-note-pairing` | track単位のNote On/Off対応 |
| [#100](https://github.com/Takuyakou/loop-vault/pull/100) | `fix/p3-6-5-15-dirty-metric-guards` | dirty指標別guard |
| [#101](https://github.com/Takuyakou/loop-vault/pull/101) | `fix/p3-6-5-16-real-midi-input-guard` | Real MIDI入力健全性guard |
| [#102](https://github.com/Takuyakou/loop-vault/pull/102) | `test/p3-6-5-17-voice-aware-benchmark` | Voice-aware性能計測 |
| [#103](https://github.com/Takuyakou/loop-vault/pull/103) | `data/p3-6-5-18-final-evaluation` | 最終評価artifact更新 |

最終QAと本報告書は`docs/p3-6-5-19-final-report`から、#103をbaseにした最終PRとして追加する。

## 7. 既知の課題と次の条件

- dirty strict guardが未通過。特に`combined`がregressedしている。
- Real MIDIの全tierが0件で、実データ上の精度、Role誤分類、操作時間を評価できない。
- `all_instruments.mid`がなく、計画で指定された代表ファイルの性能確認ができない。
- Stage CのVoice Mixer、Mute / Solo、role override UI、200ms debounce再解析、latest-only制御、Worker/Tauri command化は未実装。
- 修正伝播は現在の進行候補内だけで、別候補や別SongIdeaを横断しない。
- 既定解析器は引き続き`legacy`。Voice-awareは評価・比較用の追加モードである。
- 現行アプリはPhase前の旧`data.json`を読める。一方、optionalな`timeSignature`を含む新しい保存済み進行をPhase前の古いexeで読むダウングレード互換は、旧schemaがstrictなため保証できない。計画の指定に従い`fileVersion`は上げていない。
- `correction-propagation`はPhase 3.6.5で追加した新イベントであり、Phase前の旧promotion処理は認識しない。通常のchord correctionは従来形式を維持した。

Stage Cを再開するPhase 3.6.5.1では、判定書に定義した最低条件を先に満たす必要がある。特に実MIDI 30件以上、Gold 20件以上、Role正解ラベル付きVoice 200件以上、Voice選択paired ablation 100区間以上、10回以上の実利用観察を優先する。

## 8. リポジトリ衛生

- Phase 3.6.5のPR差分に絶対パス、ユーザー固有パス、秘密情報パターンはない。
- `.local-evaluation/`はgitignore対象。
- 作業開始前から存在する未追跡の`docs/loop-vault-phase3-final-uiux-refresh-work-plan.md`と`src-tauri/gen/`は、本Phaseのcommitへ含めていない。
