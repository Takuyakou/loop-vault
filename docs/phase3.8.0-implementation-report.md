# Loop Vault Phase 3.8.0 実装報告書

作成日: 2026-07-22

対象: Progression Advisor（Local LLM標準、OpenAI API任意）

基準コミット: `eae713c`
実装ブランチ: `test/p3-8-0-a7-evaluation-qa`

## 1. 実装結果

保存済みコード進行から、8小節の展開案を3種類生成するProgression Advisorを実装した。

- 標準ProviderはローカルLLM。Ollama互換の `/api/tags` と `/api/chat` を利用する（`src-tauri/src/llm/local_provider.rs`）。
- 任意ProviderとしてOpenAI Responses APIを実装した。ユーザー自身のAPIキーを使うBYOK方式で、`store: false` と厳格JSON Schemaを指定する（`src-tauri/src/llm/openai_provider.rs`）。
- Progression Detailから右drawerを開き、任意指示とMood / Useを指定して3案を生成できる（`src/components/progression-advisor/ProgressionAdvisorDrawer.tsx`、`src/views/ProgressionDetailView.tsx`）。
- 各案は「下書きへ追加」「新しい進行として保存」「コピー」「タグ適用」ができる。
- AI案には試聴・自動再生を実装していない。PlaybackControllerも変更していない（`src/components/progression-advisor/advisorBoundary.test.ts`）。
- AI案は自動でVerified / Goldにならず、新規保存時も `userVerified: false` になる。

## 2. Providerと実行境界

Rust側に交換可能な `LlmProvider` trait、共通request / response、エラー分類、timeout、retry、request ID単位のcancelを追加した。

主要ファイル:

- `src-tauri/src/llm/provider.rs`: Provider traitとMock Provider
- `src-tauri/src/llm/errors.rs`: UIへ返す安全なエラー分類
- `src-tauri/src/llm/retry.rs`: timeout、cancel、retry policy
- `src-tauri/src/llm/commands.rs`: Tauri commandとrequest lifecycle
- `src-tauri/src/llm/types.rs`: Rustの厳格な送受信型
- `src/llm/bridge.ts`: frontendからTauri commandを呼ぶ境界
- `src/llm/advisorService.ts`: provider結果にTypeScript domain validationを適用するサービス

Local Providerの実態:

- `localhost`、`127.0.0.1`、`::1` のloopback URLだけを許可する。
- モデル列挙はOllama互換 `/api/tags`。
- 生成はOllama互換 `/api/chat`、`stream: false`。
- JSON Schemaを `format` に渡す。
- fenced JSONや先頭説明文からJSONを抽出できる。
- 不正JSON時のrepairは最大1回、transport retryは最大1回。

OpenAI Providerの実態:

- endpointは `https://api.openai.com/v1/responses` 固定。
- `text.format.type = json_schema`、`strict = true`、`store = false`。
- 429と5xxだけ最大2回retryし、`Retry-After`を上限付きで尊重する。
- authentication、refusal、empty output、usageを分類・抽出する。
- APIキーはRust内で読み、frontendへ返さない。

## 3. 設定と秘密情報

設定画面へ日本語 / English対応のAIプロバイダー設定を追加した（`src/components/progression-advisor/LlmSettingsSection.tsx`）。

- Local URL、モデル、timeoutを設定できる。
- Localモデル一覧取得と接続テストができる。
- OpenAIモデル、有料実行前の毎回確認を設定できる。初期値は確認あり。
- OpenAI APIキーの登録、更新、削除、登録状態確認、接続テストができる。
- 非秘密設定だけを `loop-vault:llm-preferences:v1` としてlocalStorageへ保存する（`src/llm/preferences.ts`）。
- APIキーはWindows Credential Managerへ保存する。serviceは `com.takuyakou.loopvault`、accountは `openai-api-key`（`src-tauri/src/llm/keychain.rs`）。
- APIキー本文を返すcommandは存在しない。`data.json`、Vault schema、通常ログへも追加していない。

## 4. 構造化出力と音楽検証

型と検証は `src/domain/progressionAdvisor/` に置き、React、Zustand、Tauri API、現在時刻へ依存させていない。

検証内容:

- responseは正確に3案。
- strategyは `close_development`、`contrast`、`experimental` を1件ずつ。
- 各案は8小節、4/4。
- unknown fieldを拒否。
- analysis、intent、配列、文字列の上限をZodで検証。
- Taxonomy v1に存在しないtag IDを拒否。
- 既存コードparserで解釈できないコードを拒否。
- bar、startBeat、duration、bar跨ぎ、gap、overlap、8小節の完全coverageを検証。
- 3案のコードイベントが同一なら拒否。
- 元進行の完全コピー案を拒否。
- OpenAI strict schemaがoptional値を `null` で返した場合は `undefined` へ正規化し、空プロパティを除去。
- event順とtag重複を決定的に正規化。

受理済み案は `ProgressionBlockCandidate` へ変換するが、`confidence: 0`、warning `ai-generated-unverified` として扱う（`src/domain/progressionAdvisor/advisorDraft.ts`）。

## 5. UIと保存経路

Progression Detail上部へ「AIで展開案」ボタンを追加した。

drawerの実装:

- 任意指示、Mood / Use、Provider、参照件数を表示。
- 「AIへ送る内容」を展開すると、送信するデータ種別と現在のコード列を確認できる。
- 実行中は重複実行を禁止し、cancelできる。
- request IDと進行fingerprintで、進行変更後の古いresponseを捨てる。
- OpenAI実行前は従量課金確認dialogを表示する。
- 生成後はmodel、latency、retry countを表示する。

適用経路:

- 「下書きへ追加」は既存の編集draftへ `advisor-append` operationとして追加し、Undo可能。
- この時点ではVaultを保存しない。
- 「新しい進行として保存」は既存store action `appendBlockToIdea()` を通す。
- タグ適用は既存 `updateProgressionBlock()` を通す。
- 保存・タグ更新に失敗した場合、成功toastで上書きしない。
- repositoryへの直接書き込みは追加していない。

## 6. ローカル参照文脈とプライバシー

`src/domain/progressionAdvisor/referenceContext.ts` でProgression Indexから最大3件を決定的に選ぶ。

- 対象はverified、user edited、pinnedのいずれかを満たす進行。
- key / mode、tag、Roman numeralの一致を使って順位付けする。
- LLMへ渡すのはtitle（存在時）、key、mode、Roman numeral、コードlabel、既知tag、verifiedだけ。
- path、MIDI bytes、fingerprint、memo、asset、APIキー、無関係なVaultデータを送らないことをテストしている。

## 7. 運用メトリクスと評価

運用メトリクスは `src/llm/advisorMetrics.ts` に実装した。

- request ID、provider、model、latency、retry count、token usage、status、error categoryだけを最大100件localStorageへ保持する。
- prompt、response、APIキー、進行本文は保存しない。
- success / failure、平均latency、token、retryを集計できる。

固定評価は `src/domain/progressionAdvisor/evaluationFixtures.ts` と `scripts/evaluate-progression-advisor.ts` に追加した。

```text
fixture: 24件
期待valid: 12件
期待invalid: 12件
判定一致: 24 / 24
mismatch: 0件
```

invalid fixtureには、案数、未知strategy、additional property、長文、未知tag、不正chord、不正bar / duration、overlap、coverage不足、案重複を含む。

## 8. 検証結果

最終コミット前の実測:

| 項目 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS（123 files / 675 tests） |
| `npx tsc --noEmit` | PASS |
| `cargo test` | PASS（17 tests） |
| `npm run eval:advisor` | PASS（24 / 24） |
| `npm run build` | PASS |
| `npm run tauri build` | PASS（exe / MSI / NSISを再生成） |
| `git diff --check` | PASS |

既存回帰ではProgression Detail、Quick Editor、Smooth / Style、Library、Live MIDI、MIDI file analysis、close guard、設定、日英UIを含む全テストが通過した。

## 9. 生成物

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 10. 変更していない境界

- `defaultAnalyzerMode` は `legacy` のまま。
- `fileVersion` は1のまま。
- `SavedProgressionBlock`、Vault永続化schema、`data.json`形式にAI専用フィールドを追加していない。
- MIDI解析、Live MIDI detector、Smooth、Style、Quick Editor、PlaybackControllerを変更していない。
- AI案の試聴、MIDI生成、audio生成、embedding、vector DB、agent、tool callingは実装していない。

## 11. 未実施・既知の制約

- 実際のLocal LLMサーバーとOpenAI APIキーはこの作業環境へ設定していないため、外部モデルを使ったlive生成、実測latency、実token usageは未実施。adapter、mock、schema fixture、HTTP request構築のテストまでは実施済み。
- Local Providerは現時点でOllama互換API専用。OpenAI互換の任意ローカルサーバーには対応していない。
- Author Reference Index専用データは投入していない。参照文脈は既存Progression Indexから選ぶ。
- OpenAI概算金額は表示しない。モデル価格を固定しない方針を優先し、有料であることだけを設定画面と実行確認で明示する。
- Chord Drip export導線は条件付き項目のため未実装。
- proposal追加率、保存率、コピー率、タグ適用率、保存後Undo率などの製品分析イベントは未実装。provider実行の安全な運用メトリクスだけを保存する。
- Web buildには既存の500 kB超chunk警告が残る。最終build時のmain JSは888.12 kB（gzip 253.99 kB）。
- `src-tauri/gen/` はTauri build生成物で未追跡のまま。Gitへ追加しない。

## 12. Stacked PR

依存順:

1. `#139` A0 Audit
2. `#140` A1 Provider Foundation
3. `#141` A2 Settings / Secrets
4. `#142` A3 Structured Output / Domain Validation
5. `#143` A4 Advisor UI / Local Provider
6. `#144` A5 Local Structured Context
7. `#145` A6 OpenAI Provider
8. `#146` A7 Evals / QA（本報告書と最終評価）

各PRは直前Stageのbranchをbaseにする。mainへのmergeはこの報告書作成時点では行っていない。
