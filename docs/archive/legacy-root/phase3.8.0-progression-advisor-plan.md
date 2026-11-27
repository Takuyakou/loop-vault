# Loop Vault Phase 3.8.0 Codex作業指示書
## Progression Advisor — ローカルLLM標準・OpenAI API任意対応
### 試聴機能を含めず、コード進行の展開案・分析・タグ候補を生成する

---

## 0. 結論

Phase 3.8.0では、Loop VaultへLLMを組み込み、保存済みコード進行に対する「展開案」「短い分析」「タグ候補」を生成できるProgression Advisorを実装する。

標準プロバイダーは、呼び出しごとのAPI料金が発生しないローカルLLMとする。

```text
標準:
Local LLM Provider
→ ユーザーPC上のローカルLLMサーバーを利用

任意:
OpenAI Provider
→ ユーザー自身のAPIキーを利用するBYOK方式
→ 従量課金が発生することをUIで明示
```

今回、**AI提案の試聴機能は実装しない**。

実装する導線は次のとおり。

```text
Progression Detailを開く
↓
「AIで展開案」を押す
↓
任意の指示を入力
↓
3つの構造化された展開案を取得
↓
コード進行と説明を確認
↓
現在の進行の後ろへ追加
または
新しい進行として保存
または
コード進行をコピー
```

Phase 3.8.0のテーマ:

**「決定的な編集基盤を壊さず、発想と説明だけをLLMへ任せる」**

---

# 1. 前提

現行Loop Vaultには以下が存在する。

- React
- TypeScript
- Vite
- Tauri v2
- Zustand
- Zod
- Windowsデスクトップ向け
- Progression Detail
- Quick Chord Editor
- Smooth候補
- Style候補
- Smart Library
- Progression Index
- Taxonomy v1
- `SavedProgressionBlock`
- `ChordSymbol`
- コード名parser
- 拍・小節を含むイベント構造
- 既存store action
- `applyVaultChange()`
- autosave
- Undo / Redo
- Backup / Import / Export
- OSローカル設定
- Live MIDI
- PlaybackController

本Phaseは、既存のMIDI解析、Smooth、Style、Quick Editor、Live MIDI、PlaybackControllerを変更しない。

---

# 2. Progression Advisorの役割

## 2.1 LLMへ任せるもの

- 元進行の特徴を短く説明する
- 8小節の展開案を3種類提案する
- ユーザーの自然言語指示を解釈する
- 近い展開、対照的な展開、実験的な展開を考える
- Taxonomy内のMood / Use候補を提示する
- 各案の意図を1〜2文で説明する

## 2.2 既存ドメインへ任せるもの

- MIDIファイル解析
- コード名parser
- 小節・拍・duration検証
- Smooth判定
- Style判定
- 重複除去
- Taxonomyの確定的Feature分類
- 保存
- Undo / Redo
- Backup
- Import / Export

## 2.3 LLMへ任せないもの

- 保存済み進行の自動上書き
- 自動保存
- MIDIファイルの再解析
- オーディオ解析
- Live MIDI解析
- Moodタグの強制適用
- Gold / Verifiedの自動付与
- ユーザー確認なしのStyle学習
- 試聴
- 音源再生
- PlaybackController操作

---

# 3. スコープ

## 3.1 実装するもの

- Provider抽象化
- Local LLM Provider
- OpenAI Provider
- BYOK
- APIキーのOSキーチェーン保存
- プロバイダー設定
- 接続テスト
- モデル選択
- Progression Advisor request / response schema
- 構造化出力
- Rust側deserialization
- TypeScript側音楽ドメイン検証
- 3つの展開案
- 分析文
- Taxonomy内のタグ候補
- ユーザーの任意指示
- 現在の後ろへ追加
- 新しい進行として保存
- コード進行のコピー
- キャンセル
- timeout
- retry
- rate limit / refusal / invalid outputのエラー分類
- 使用量・応答時間のローカル集計
- Evals
- 日本語 / English
- lint / test / typecheck / build / Tauri build

## 3.2 条件付き

- Progression Indexを使ったローカル類似進行検索
- Author Reference Indexの文脈投入
- Chord Dripへ渡すexport導線
- OpenAI利用時の概算コスト表示

## 3.3 対象外

- 試聴ボタン
- AI提案の自動再生
- PlaybackController連携
- MIDI生成
- Audio生成
- Embeddings
- Vector DB
- SQLite
- Fine-tuning
- AI Agent
- Tool callingによる自動編集
- Claude API
- Bedrock
- ローカルモデル自動ダウンロード
- 自前クラウドBackend
- 開発者の共通OpenAI APIキー埋め込み
- APIキーのVault `data.json`保存
- 生prompt / 生responseの通常ログ保存

---

# 4. Provider設計

## 4.1 方針

Providerを交換可能にする。

```rust
#[async_trait]
pub trait LlmProvider {
    async fn suggest_progression(
        &self,
        request: AdvisorRequest,
        cancellation: CancellationToken,
    ) -> Result<AdvisorResponse, LlmError>;

    async fn test_connection(
        &self,
    ) -> Result<ProviderHealth, LlmError>;
}
```

Providerの差異をUIへ漏らしすぎない。

## 4.2 Provider種別

```ts
export type LlmProviderId =
  | "local"
  | "openai";
```

## 4.3 Local LLM Provider

用途:

- 標準プロバイダー
- API従量課金なし
- オフライン利用
- 個人利用
- 日常的な展開案生成

前提:

- ユーザーがローカルLLMサーバーを別途起動している
- Loop Vaultは既存サーバーへHTTP接続する
- Loop Vaultがモデルを自動ダウンロードしない
- 利用可能モデルを列挙または手入力で選択する

```ts
export interface LocalLlmSettings {
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}
```

Local ProviderのStructured Output対応が不十分な場合:

```text
JSON Schema付きprompt
↓
JSON抽出
↓
Rust deserialize
↓
TypeScript domain validation
↓
失敗時は1回だけrepair request
↓
再失敗ならユーザー向けエラー
```

## 4.4 OpenAI Provider

用途:

- 高品質オプション
- BYOK
- ユーザーが明示選択した場合だけ利用
- 従量課金が発生する

要件:

- OpenAI Responses API adapterとして隔離
- Structured Outputsを利用
- `store: false`
- APIキーはOSキーチェーンから取得
- フロントエンドへAPIキーを返さない
- リポジトリ、設定JSON、ログへ出さない
- 開発用のみ環境変数fallbackを許可
- 共通キーをexeへ埋め込まない

## 4.5 Provider設定

```text
AIプロバイダー

● ローカルLLM
○ OpenAI API
```

OpenAI選択時:

```text
OpenAI APIは従量課金です。
利用料金はOpenAIアカウントへ請求されます。
```

OpenAIの実行前に毎回確認を出すかは設定可能にする。初期値は確認あり。

---

# 5. 秘密情報と設定

## 5.1 APIキー

OpenAI APIキーはOSキーチェーンへ保存する。

禁止:

- localStorage
- `data.json`
- app preferences JSON
- `.env`の配布
- ログ
- frontend state
- Tauri event payload
- crash report

## 5.2 非秘密設定

```ts
export interface LlmPreferences {
  provider: LlmProviderId;

  local?: {
    baseUrl: string;
    model: string;
  };

  openai?: {
    model: string;
    confirmBeforePaidRequest: boolean;
  };

  language: "ja" | "en";
}
```

Vault `data.json`へ保存しない。

## 5.3 APIキー操作

設定画面:

- APIキー登録
- APIキー更新
- APIキー削除
- 接続テスト
- 登録済み / 未登録表示
- APIキー本文は再表示しない

---

# 6. Requestデータモデル

```ts
export interface AdvisorRequest {
  schemaVersion: 1;

  progression: {
    title?: string;
    key?: string;
    mode?: string;
    bpm?: number;
    bars: number;
    timeSignature: string;

    events: AdvisorChordEvent[];

    romanNumerals?: string[];
    manualTagIds: string[];
    derivedTagIds: string[];
    origin?: string;
  };

  instruction?: string;

  output: {
    proposalCount: 3;
    barsPerProposal: 8;
    strategies: [
      "close_development",
      "contrast",
      "experimental"
    ];
  };

  context?: AdvisorReferenceContext[];
}

export interface AdvisorChordEvent {
  bar: number;
  startBeat: number;
  durationBeats: number;
  chord: string;
}
```

送信しないもの:

- Ideaの次の一手
- 参考曲URL
- 関連ファイルパス
- ユーザー名
- 絶対パス
- MIDI bytes
- Live MIDI履歴
- APIキー
- 無関係な全Vaultデータ

---

# 7. Responseデータモデル

```ts
export interface AdvisorResponse {
  schemaVersion: 1;
  analysis: string;
  suggestions: AdvisorSuggestion[];
  suggestedTagIds: string[];
}

export type AdvisorStrategy =
  | "close_development"
  | "contrast"
  | "experimental";

export interface AdvisorSuggestion {
  id: string;
  strategy: AdvisorStrategy;
  label: string;
  intent: string;
  key?: string;
  mode?: string;
  bars: 8;
  timeSignature: "4/4";
  events: AdvisorChordEvent[];
  suggestedTagIds: string[];
}
```

Structured Output制約:

- suggestionsは正確に3件
- strategyは3種類を1件ずつ
- barsは8
- `additionalProperties: false`
- tagはTaxonomy v1の既知IDのみ
- analysis / intentは最大文字数を設定
- 自由な未知フィールドを許可しない

---

# 8. 音楽ドメイン検証

Structured Output成功だけでは採用しない。

Rust側:

- JSON deserialize
- schema version
- 配列件数
- enum
- 最大文字数
- payload size

TypeScript domain側:

```text
全chordがparse可能
全eventがbar 1〜8
startBeatが有効
durationBeatsが有効
1小節の拍数を超えない
同一小節内でoverlapしない
空白区間の規則を満たす
time signatureが4/4
合計8小節
3案が同一ではない
元進行の完全コピーだけになっていない
tag IDがTaxonomy内
```

失敗時:

- AI出力を保存しない
- 自動修正しない
- エラー箇所を簡潔に表示
- Local Providerのみ1回repair可能
- OpenAIでもdomain validation失敗時は失敗扱い
- raw response本文を通常UIへ露出しない

---

# 9. UI / UX

## 9.1 入口

Progression Detail上部へ追加。

```text
[AIで展開案]
```

## 9.2 Advisor画面

右drawerを推奨。

表示:

- Provider
- Model
- 元進行の要約
- 任意指示
- 送信される項目
- OpenAIの場合は従量課金表示
- 実行
- キャンセル

## 9.3 ローディング

```text
展開案を作成しています…
```

- キャンセル可能
- 重複実行禁止
- 進行変更後の古いresponseを適用しない
- request IDを使う

## 9.4 結果カード

```text
自然な展開
close_development

| F#maj9 | C#/E# | D#m9 | G#13 |
| C#sus4 | C#7   | F#maj9 | — |

狙い:
元の浮遊感を維持しながら、後半にドミナント感を追加します。

タグ候補:
Dreamy / Warm
```

## 9.5 操作

各案:

- 現在の後ろへ追加
- 新しい進行として保存
- コード進行をコピー
- タグ候補を選択適用
- 閉じる

**試聴は実装しない。**

## 9.6 適用

AI提案を直接保存済み進行へ上書きしない。

```text
AI提案
↓
編集draftへ追加
↓
ユーザーが内容を確認
↓
既存保存操作
```

---

# 10. ローカル文脈検索

Phase 3.8.0ではEmbeddingsを使わない。

既存のProgression IndexとAuthor Reference Indexを使い、構造化された類似進行を最大3件取得する。

条件:

- 同じmode
- 近い度数列
- 同じFeature tag
- 同じMood / Use
- 過去に確認済み
- 過去に採用した修正を含む

```ts
export interface AdvisorReferenceContext {
  title?: string;
  key?: string;
  mode?: string;
  romanNumerals: string[];
  chordLabels: string[];
  tagIds: string[];
  verified: boolean;
}
```

Phase 3.8.1で以下を比較する。

```text
構造検索
Embedding検索
Hybrid検索
```

---

# 11. エラー設計

```rust
pub enum LlmError {
    ProviderNotConfigured,
    ApiKeyMissing,
    LocalServerUnavailable,
    ModelUnavailable,
    AuthenticationFailed,
    RateLimited,
    Timeout,
    Cancelled,
    Network,
    Provider5xx,
    Refused,
    EmptyResponse,
    InvalidStructuredOutput,
    DomainValidationFailed,
    ResponseTooLarge,
}
```

リトライ:

Local:
- network failure: 1回
- invalid JSON: repair 1回
- model unavailable: retryなし

OpenAI:
- 429: Retry-After尊重
- 5xx: 指数バックオフ
- 最大2回
- authentication / refusal / domain validation: retryなし

timeout:

```text
既定30秒
```

---

# 12. コスト制御

OpenAIのみ。

- 小型モデルを初期候補にする
- モデルは設定から変更
- 送信進行は1件
- contextは最大3件
- 3案固定
- 出力文字数上限
- 同じ入力の連打防止
- 使用tokenを記録
- OpenAI実行前の有料確認
- モデル価格をコードへ固定しない

表示:

```text
OpenAI APIを使用します。
この操作にはAPI利用料金が発生します。
```

---

# 13. ログ・プライバシー

通常ログへ保存可:

- requestId
- provider
- model
- latency
- retry count
- input token
- output token
- status
- error category
- schema validation結果

通常ログへ保存しない:

- APIキー
- 生prompt
- 生response
- Idea memo全文
- 絶対パス
- MIDI bytes
- 関連ファイル

デバッグログはユーザー明示ON時のみ。

---

# 14. Feedback / 評価

```ts
export interface AdvisorSelectionMetadata {
  provider: LlmProviderId;
  model: string;
  strategy: AdvisorStrategy;
  requestId: string;
}
```

記録条件:

- 表示だけでは採用扱いにしない
- コピーだけでは保存採用扱いにしない
- 追加後に保存成功した場合に採用
- 新規進行保存成功時に採用
- Undoで除去された場合は別event
- AI提案をVerified / Goldへ自動昇格しない

---

# 15. Evals

固定評価セットを20〜30件用意する。

自動指標:

- response schema成功率
- suggestions 3件成功率
- chord parse成功率
- 8小節成立率
- event overlap失敗率
- taxonomy tag適合率
- 重複提案率
- 元進行完全コピー率
- Local provider latency
- OpenAI provider latency
- token usage
- retry率

製品指標:

- AIボタン実行率
- 提案の追加率
- 新規保存率
- コピー率
- タグ適用率
- 保存後Undo率
- invalid response率
- provider別成功率

**試聴率は計測しない。**

---

# 16. ファイル構成候補

```text
src-tauri/src/llm/
  mod.rs
  commands.rs
  provider.rs
  errors.rs
  types.rs
  local_provider.rs
  openai_provider.rs
  keychain.rs
  retry.rs

src/domain/progressionAdvisor/
  types.ts
  schema.ts
  validateAdvisorResponse.ts
  normalizeAdvisorResponse.ts
  advisorDraft.ts
  evaluation.ts
  index.ts

src/llm/
  bridge.ts
  advisorService.ts
  preferences.ts
  cancellation.ts

src/components/progression-advisor/
  ProgressionAdvisorButton.tsx
  ProgressionAdvisorDrawer.tsx
  AdvisorRequestForm.tsx
  AdvisorSuggestionCard.tsx
  AdvisorErrorState.tsx
  LlmSettingsSection.tsx
```

---

# 17. 実装Stage

## Stage A0 — Audit

- Progression Detail
- store action
- Taxonomy
- Progression Index
- Author Reference Index
- app preferences
- keychain候補
- local LLM接続方式
- OpenAI adapter
- Tauri ACL
- cancellation
- logging

成果物:

```text
docs/phase3.8.0-llm-audit.md
```

## Stage A1 — Provider Foundation

- Provider trait
- request / response Rust型
- error分類
- cancellation
- timeout
- retry
- connection test
- mock provider
- tests

## Stage A2 — Settings / Secrets

- Provider選択
- Local URL / model
- OpenAI model
- keychain
- APIキー登録 / 削除
- connection test
- app preferences
- 有料表示
- tests

## Stage A3 — Structured Output / Domain Validation

- JSON Schema
- Rust deserialize
- TypeScript Zod
- chord parser
- event validation
- taxonomy validation
- duplicate validation
- Local repair
- tests

## Stage A4 — Progression Advisor UI

- AIボタン
- drawer
- instruction
- provider / model表示
- loading
- cancel
- suggestion cards
- append
- save new
- copy
- tag apply
- i18n
- accessibility

## Stage A5 — Local Structured Context

- Progression Index retrieval
- Author Reference context
- max 3
- privacy filter
- prompt context
- referenced item count
- tests

## Stage A6 — OpenAI Provider

- Responses API adapter
- Structured Outputs
- `store: false`
- usage
- 429
- 5xx
- refusal
- empty output
- BYOK
- integration tests with mocked HTTP

## Stage A7 — Evals / QA

- fixture corpus
- Local eval
- OpenAI eval
- validation report
- latency
- token usage
- app QA
- old data
- Live MIDI regression
- MIDI analysis regression
- lint
- tests
- typecheck
- build
- Tauri build
- installer
- final report

---

# 18. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.8.0を実装します。

仕様の正は
docs/phase3.8.0-progression-advisor-plan.md
です。

目的:
ローカルLLMを標準、OpenAI APIを任意オプションとして、
保存済み進行から構造化された8小節の展開案を3つ生成し、
ユーザーが確認後に追加・新規保存・コピーできる
Progression Advisorを実装する。

絶対に守ること:

1. 試聴機能を実装しない。
2. PlaybackControllerを変更しない。
3. LLMでMIDI解析を置き換えない。
4. LLMでSmooth / Styleを置き換えない。
5. 標準providerはLocal LLM。
6. OpenAIはBYOKの任意provider。
7. 開発者の共通OpenAI APIキーを埋め込まない。
8. OpenAI APIキーをfrontendへ返さない。
9. APIキーをOSキーチェーンへ保存する。
10. APIキーをdata.json、preferences JSON、ログへ保存しない。
11. Provider interfaceでLocal / OpenAIを分離する。
12. OpenAI adapterはResponses APIを使う。
13. OpenAI requestはstore=false。
14. Structured Outputを使用する。
15. Structured Output成功後もdomain validationを必ず行う。
16. chord parserを通らないコードを適用しない。
17. bar / beat / duration / overlapを検証する。
18. 3案はclose / contrast / experimentalを1件ずつ。
19. suggestionsは8小節。
20. tagはTaxonomyの既知IDだけ。
21. AI提案を保存済み進行へ直接上書きしない。
22. まず編集draftへ追加する。
23. 保存は既存store actionとapplyVaultChangeを通す。
24. repositoryへ直接書かない。
25. AI提案をVerified / Goldへ自動昇格しない。
26. 生promptと生responseを通常ログへ保存しない。
27. 送信データを現在進行と最大3件の参照文脈へ限定する。
28. MIDI bytes、絶対パス、参考曲、関連ファイルを送信しない。
29. Local providerのinvalid JSON repairは最大1回。
30. OpenAI 429 / 5xxのretryは最大2回。
31. cancellationとtimeoutを実装する。
32. request IDで古いresponseを適用しない。
33. OpenAI利用前に従量課金を明示する。
34. model価格をコードへ固定しない。
35. provider / latency / usage / statusだけを通常ログへ残す。
36. UIを日本語 / Englishで実装する。
37. MIDI解析、Live MIDI、Quick Editor、Libraryを壊さない。
38. fileVersionを上げない。
39. 新フィールドはoptionalまたは非永続。
40. 同じ入力とprovider responseから同じnormalized resultを返す。
41. 各Stageでlint / test / typecheck / buildを通す。

作業開始前:
- 現行Progression Detail
- 保存経路
- Provider候補
- local LLM接続仕様
- OpenAI adapter仕様
- keychain
- schema
- domain validation
- privacy boundary
- risks
を報告する。

作業終了時:
- 変更ファイル
- Local provider
- OpenAI provider
- secret管理
- response schema
- validation
- error handling
- eval結果
- latency
- usage
- manual QA
- 未解決事項
を報告する。

コミット:
P3.8.0-AX: 要約
```

---

# 19. テスト

## 19.1 Provider

- Local connection success
- Local unavailable
- Local model unavailable
- OpenAI missing key
- OpenAI authentication
- OpenAI 429
- OpenAI 5xx
- timeout
- cancel
- stale response
- retry
- refusal
- empty output

## 19.2 Secrets

- keychain save
- keychain overwrite
- keychain delete
- frontend非露出
- logs非露出
- preferences非露出
- data.json非露出

## 19.3 Schema

- valid 3 suggestions
- 2 suggestions invalid
- 4 suggestions invalid
- unknown strategy
- additional properties
- oversized text
- unknown taxonomy tag
- invalid chord
- invalid bar
- invalid beat
- invalid duration
- overlap
- incomplete 8 bars
- duplicate suggestions

## 19.4 Local repair

- markdown fenced JSON
- leading prose
- malformed JSON
- repair success
- repair failure
- max 1 retry

## 19.5 UI

- open drawer
- instruction
- provider display
- paid warning
- loading
- cancel
- error state
- append draft
- save new
- copy
- tag apply
- no preview button
- no audition button
- no PlaybackController call

## 19.6 Persistence

- AI結果の直接永続化なし
- append後の明示保存
- save new
- autosave
- Undo
- Backup
- Import / Export
- old data parse
- fileVersion 1

## 19.7 Regression

- Progression Detail
- Quick Editor
- Smooth
- Style
- Library
- Live MIDI
- MIDI file analysis
- close flush
- settings
- Japanese / English

---

# 20. 受け入れ条件

## Foundation

- Local / OpenAI provider切替
- Localが初期provider
- OpenAI BYOK
- keychain
- connection test
- timeout
- cancel
- retry
- error分類

## Output

- analysis
- 3 suggestions
- close / contrast / experimental
- 8小節
- bar / beat / duration
- Taxonomy tag IDs
- Structured Output
- domain validation

## UI

- Progression Detailから実行
- 任意指示
- loading
- cancel
- 結果カード
- 現在の後ろへ追加
- 新規進行保存
- コピー
- タグ適用
- 試聴なし

## Security / Privacy

- APIキーfrontend非露出
- APIキーlog非露出
- APIキーdata.json非露出
- 生prompt / responseを通常ログへ保存しない
- OpenAIはstore=false
- MIDI bytes / path非送信

## Persistence

- AI案を直接上書きしない
- 既存store action
- autosave
- Undo
- Backup
- fileVersion不変
- old data parse

## Quality

- fixture eval
- schema成功率
- parse成功率
- 8小節成功率
- latency
- usage
- invalid rate
- lint
- tests
- typecheck
- web build
- Tauri build
- installer

---

# 21. Phase 3.8.1バックログ

Phase 3.8.0では実装しない。

- OpenAI Embeddings
- Vector index
- SQLite
- Hybrid RAG
- Claude Provider
- Bedrock Provider
- Fine-tuning
- 自動agent
- Tool calling編集
- Audio生成
- MIDI生成
- 試聴
- AI候補の自動適用

---

# 22. 最終メッセージ

Phase 3.8.0では、LLMにLoop Vaultの主導権を渡さない。

```text
Loop Vaultの決定的ドメイン
→ 正確さ、検証、保存、Undo

LLM
→ 展開案、言語分析、自然言語指示の解釈
```

**ローカルLLMで日常的に使え、必要なときだけOpenAIを選べるProgression Advisorを完成させる。**
