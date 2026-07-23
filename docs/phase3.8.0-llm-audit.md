# Loop Vault Phase 3.8.0 LLM実装監査

更新日: 2026-07-22  
対象コミット: `eae713c0e471d73e0d8e99d9df08ec8da083618f`

## 1. 監査目的

Phase 3.8.0 Progression Advisorを、既存のコード進行編集・保存・分類・再生機構を壊さず追加するため、実装前の境界と利用可能な既存資産を確認した。本文は計画上の理想ではなく、対象コミット時点のコードを根拠にしている。

## 2. 現行の入口と保存経路

- コード進行詳細・編集画面の入口は `src/views/ProgressionDetailView.tsx`。`SavedProgressionBlock`を`createEditableProgression()`で編集用状態へ変換し、明示的な保存操作で`updateProgressionBlock()`を呼ぶ。
- 画面へのストアアクション注入は`src/App.tsx`が担当する。Advisorもこの境界から必要なアクションを受け取り、repositoryを直接呼ばない。
- `src/store/vaultStore.ts`には、既存ブロック更新の`updateProgressionBlock()`、別ブロック追加の`appendBlockToIdea()`、新規Idea生成の`createIdeaFromDraft()`がある。いずれも内部の`applyVaultChange()`を通り、既存のautosaveへ接続される。
- 永続化対象はユーザーが明示操作で採用した結果だけとする。LLMのrequest、response、候補、API keyは`VaultFile`へ追加しない。

## 3. 再利用できるドメイン資産

- 編集用進行とUndo/Redo: `src/domain/progressionEditing/*`
- コード表記の構造化・解析: `src/domain/midi/chords.ts`および既存の`ChordSymbol`
- 保存済み進行: `SavedProgressionBlock`と`ProgressionBlockCandidate`（`src/domain/types.ts`）
- 進行分類ID・日英ラベル: `src/domain/progressionClassification/taxonomy.ts`
- 検索・類似参照に利用できるインデックス: `src/domain/progressionClassification/index.ts`
- 作者参照データ生成: `src/domain/progressionEditing/styleCandidates.ts`

`src/domain/*`はReact、Zustand、Tauri APIをimportしない純粋層として維持されている。Advisorの型、正規化、検証、既存進行への変換、文脈選択はこの層へ置き、現在時刻・HTTP・keychain・UI状態へ依存させない。

## 4. Provider境界

### 4.1 配置

Rust側に`src-tauri/src/llm/`を追加し、次を分離する。

- `provider.rs`: Local/OpenAIで共通の非同期Provider trait
- `types.rs`: frontendとのinvoke payload、Providerの結果、利用量メタデータ
- `errors.rs`: UIで分類可能なエラーコード
- `commands.rs`: Tauri command、request ID単位のキャンセル、keychain操作
- `local.rs`: Ollama互換ローカルProvider
- `openai.rs`: OpenAI Responses API Provider
- `retry.rs`: timeout、最大2回のretry、`Retry-After`処理

frontendは`src/llm/bridge.ts`だけからTauri invokeを呼ぶ。domain層からinvokeしない。

### 4.2 Local Provider

- 初期接続先: `http://127.0.0.1:11434`
- モデル一覧: `GET /api/tags`
- 生成: `POST /api/chat`
- `stream: false`
- `format`へ完全なJSON Schemaを渡す。schemaをpromptにも含め、temperatureは低く固定する。
- 構造化出力が不正な場合は、同一request内で修復promptを1回だけ実行する。
- 仕様根拠: [Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)

### 4.3 OpenAI Provider

- API: `POST https://api.openai.com/v1/responses`
- `store: false`
- Structured Outputsは`text.format`の`json_schema`を使用し、`strict: true`とする。
- `output[*].content[*].output_text`を連結してJSONとして検証する。`refusal`は通常エラーと分離してUIへ返す。
- token利用量は`usage.input_tokens`、`usage.output_tokens`、`usage.total_tokens`だけを返す。prompt/response本文はログへ出さない。
- 仕様根拠: [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)、[OpenAI endpoint data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)

### 4.4 共通契約

- Providerは同じ`AdvisorRequest`から、厳密に3件の`AdvisorSuggestion`を返す。
- strategyは`close_development`、`contrast`、`experimental`を1件ずつ。
- 各候補は8小節、4/4、全小節を埋め、構造化`ChordSymbol`へ変換可能であることをfrontend domainで再検証する。
- frontendのrequest IDと進行fingerprintでstale responseを破棄する。
- cancel commandはrequest IDに対応するRustのCancellationTokenを停止する。

## 5. 秘密情報と設定

- OpenAI API keyはOS keychainだけへ保存する。WindowsではRust `keyring` crateのWindows native backendを使用する。
- service: `com.takuyakou.loopvault`
- account: `openai-api-key`
- frontendへ返すのは`registered: boolean`だけ。key文字列を返すcommandは作らない。
- 通常ログ、エラー、設定JSON、`VaultFile`、localStorage、clipboardへkeyを出さない。
- keychainの実装根拠: [keyring crate](https://docs.rs/crate/keyring/3.6.3/source/README.md)
- Provider種別、local URL/model、OpenAI model、timeout、課金確認設定などの非秘密設定は、既存Live MIDI設定と同様にfrontend localStorageへ独立保存する。`data.json`と`fileVersion`は変更しない。

## 6. 送信文脈とプライバシー

送信可能なデータを次へ限定する。

- 現在編集中のコード進行（構造化コード、位置、拍子）
- ユーザーが入力したintent
- 選択したMood/Use taxonomy ID
- 類似参照は最大3件。保存済み進行のコード、Roman numeral、分類ID、検証状態などの構造化情報だけ

次は送信しない。

- MIDI bytes、音声、ファイルパス、source path、ファイル名
- Ideaの自由記述、Next Action、reference track、asset path
- API key、Vault全体、未選択の進行

送信payloadのprivacy回帰テストを追加する。

## 7. UI統合方針

- `ProgressionDetailView`上部にAdvisorボタンを追加し、右ドロワーで条件入力、処理状態、3候補、エラーを表示する。
- AI候補に試聴・再生ボタンは置かず、`PlaybackController`へ接続しない。
- 採用操作は「現在の下書きへ追加」「新しい進行として保存」「コピー」「タグを適用」。保存・更新は既存ストアアクション経由に限定する。
- 現在の下書きへ追加した変更は既存Undo/Redo履歴へ積む。AI生成だけで既存ブロックを上書きしない。
- OpenAI実行前は課金が発生し得ることを明示確認する。Local Providerでは確認を要求しない。
- 画面文言は既存`language`設定に従い日本語・英語を切り替える。

## 8. エラー分類と観測

UIへ返す代表的なエラーコード:

- `provider_unavailable`
- `authentication_failed`
- `rate_limited`
- `timeout`
- `cancelled`
- `refused`
- `invalid_structured_output`
- `invalid_progression`
- `network_error`
- `internal_error`

観測対象はProvider、model、成功/失敗、エラーコード、総遅延、retry回数、token数のみ。raw prompt/response、コード進行本文、intent、API keyは通常ログへ記録しない。

## 9. 既存仕様を維持する項目

- `fileVersion = 1`
- `defaultAnalyzerMode = legacy`
- 既存MIDI解析、長尺Candidate選定、Live MIDI、PlaybackController
- Quick Editor、Progression Library、Idea/Vault保存
- `applyVaultChange()`とautosave
- AI候補をverified/goldへ自動昇格しない

## 10. 主要リスク

- モデルごとのJSON Schema対応差。Rust側の構造検証とfrontend domain検証の二段階で防ぐ。
- ローカルモデルが長い修復を繰り返す危険。修復は1回、retryはtransport失敗時を含め最大2回に制限する。
- 画面遷移後のstale response。request IDとprogression fingerprintの両方で破棄する。
- OpenAI keyの漏えい。keychain commandをset/delete/statusだけに限定し、request payloadをdebug出力しない。
- LLM候補の誤った自動保存。候補は一時stateに保持し、ユーザーの明示操作でのみ既存ストアアクションへ渡す。
- 既存編集履歴との不整合。Advisor appendを編集domainの明示的operationとして追加し、Undo/Redoをテストする。

## 11. 実装PR構成

1. A0: 計画書取り込みと本監査
2. A1: Rust Provider基盤、共通型、cancel/timeout/retry
3. A2: 非秘密設定、keychain、接続確認UI
4. A3: Advisor domain型、厳格検証、正規化、変換
5. A4: Progression Detailドロワー、request lifecycle、採用操作
6. A5: Progression Index/作者参照を使う最大3件の構造化文脈
7. A6: OpenAI Responses Provider、課金確認、usage表示
8. A7: 固定評価、回帰テスト、最終QA、技術報告

各PRは直前のPR branchをbaseとするstacked PRにし、最終PRまで`master`へ直接マージしない。
