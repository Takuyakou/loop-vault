# Loop Vault Phase 3.6.2 作業報告書

## 1. 結論

Phase 3.6.2「Real MIDI Evaluation Flywheel」を、通常のVaultとは分離したローカル評価基盤として実装した。保存済み進行、明示修正、Legacy/Reranker差分レビューを Gold / Silver / Bronze に分け、レビュー候補の絞り込み、許容代替コード、実MIDI評価、回帰ガードまでCLIで実行できる。

ただし、2026-07-15時点の実Vaultでは保存済みブロック2件の元MIDIを解決できず、修正ログも0件だった。そのため実MIDI評価ケースは Gold 0 / Silver 0 / Bronze 0 であり、rerankerが実MIDIでlegacyを上回ったとはまだ判断できない。既定解析器は `legacy` のまま維持した (`src/domain/midi/analysis.ts`)。

## 2. 実装PR

| Stage | PR | Branch | Commit |
| --- | --- | --- | --- |
| 0: Audit | #42 | `feature/p3-6-2-00-audit` | `c7f3933` |
| 1: Stored regression | #43 | `feature/p3-6-2-01-stored-regression` | `17b264c` |
| 2: Difference review | #44 | `feature/p3-6-2-02-difference-review` | `a51dfb1` |
| 3: Correction promotion | #45 | `feature/p3-6-2-03-correction-promotion` | `a9f8dd6` |
| 4: Acceptable alternatives | #46 | `feature/p3-6-2-04-acceptable-alternatives` | `1234bd8` |
| 5: Active review queue | #47 | `feature/p3-6-2-05-active-review-queue` | `09fe611` |
| 6: Real MIDI evaluation | #48 | `feature/p3-6-2-06-real-midi-evaluation` | `4c97aa4` |
| 7: Capture / Settings | #49 | `feature/p3-6-2-07-capture-settings-integration` | `e21df42` |

すべて前段ブランチをbaseにしたstacked PRであり、未マージ。下から順にマージする必要がある。

## 3. データモデルと分類

実MIDI評価ケース、差分レビュー、source index、許容代替コードの型とstrictなZod schemaを追加した (`src/domain/midi/realEvaluation/types.ts`, `src/domain/midi/realEvaluation/schema.ts`)。

- Gold: 明示修正、差分レビュー、人手確認済み保存のみ。accuracyとhard guardに使用。
- Silver: 編集済み保存ブロック。保存ラベルとのagreementに使用し、公式accuracyにはしない。
- Bronze: 無編集保存。解析器agreement、confidence分布、レビュー需要だけに使用。
- Unlabeled: 別枠。現時点では0件。

`SavedProgressionBlock`にはすべてoptionalで次を追加した。`fileVersion`は1のまま (`src/domain/types.ts`, `src/domain/schema.ts`)。

```ts
sourceFingerprint?: string;
sourceStartBeat?: number;
sourceEndBeat?: number;
sourceAnalyzerVersion?: string;
sourceWeightsVersion?: string;
userEdited?: boolean;
userVerified?: boolean;
```

旧ブロックへ値を推測補完しない。情報不足時はBronzeまたはskipになる。

## 4. 評価フライホイール

### 保存済み進行

`enumerateStoredProgressions()`、`resolveStoredProgressionRange()`、`buildStoredProgressionCase()`でVaultの保存済みブロックを列挙・分類する (`src/domain/midi/realEvaluation/storedProgressions.ts`)。元アセット、path、ファイル、範囲、コード列が不足するケースは失敗と混ぜず `missing-sources.json` へ出す。

### 差分レビュー

Legacy/Rerankerの表記を構造的に正規化し、異名同音は一致、slash bass差は不一致として扱う (`src/domain/midi/realEvaluation/differenceReview.ts`)。ローカルHTMLはSaved/Legacy/Rerankerのコード試聴、5判断、`neither`時のコード入力、localStorage保存、JSONL書き出しを備える (`scripts/review-midi-differences.ts`)。

### 修正ログ昇格

既存 `analysis-feedback.jsonl` をschema検証し、明示修正だけをGoldへ変換する (`src/domain/midi/realEvaluation/correctionPromotion.ts`)。同一訂正は重複除去し、矛盾は自動確定せずconflictへ、source不明はorphanへ残す。`live-chord-*`はfile analyzer評価から除外する。

### 許容代替コード

`deriveAcceptableAlternatives()`は純関数で、異名同音、テンション縮退、maj9/min9/13/11系縮退をStrong、slash除去や `C6 <-> Am7/C` 相当をWeakとして各最大4件生成する (`src/domain/midi/realEvaluation/acceptableAlternatives.ts`)。

### Active review

既レビューを除外し、同一MIDI最大5件、同一quality最大10件、近接区間重複除外を適用する。rootless / slash / tension / simpleを分散する (`src/domain/midi/realEvaluation/reviewQueue.ts`)。

### 実MIDI評価

Gold、Silver、Bronzeを別々に集計する (`src/domain/midi/realEvaluation/realMetrics.ts`)。GoldでRoot/Quality/Boundaryが悪化、またはCorrection costが増加した場合、`eval:real-midi`は失敗終了する。Bronzeはaccuracyとguardに入らない。

## 5. CLI

```bash
npm run eval:stored-progressions
npm run eval:review-differences
npm run eval:promote-corrections
npm run eval:build-review-queue
npm run eval:real-midi
```

主な出力は `artifacts/` 配下。評価のローカル正本はAppDataの `loopvault/evaluation/` 配下に保存する。通常のVault repositoryへ書き込まず、`data.json`と元MIDIは読み取り専用で扱う。

## 6. CaptureとSettings

Captureから新規保存するブロックには、取得可能な場合だけsource fingerprint、MIDI asset、拍範囲、解析器・重みバージョン、編集・確認証跡を保存する (`src/views/CaptureView.tsx`, `src/store/vaultStore.ts`)。MIDI asset作成とブロック保存はいずれもstoreの `applyVaultChange()` と既存autosaveを通る。

「この進行を確認済みとして保存」は初期OFF。自分でコード名を確認した場合だけONにする。ブラウザFile dropは絶対pathを取得できないため、sourceAssetIdを捏造しない。

Settingsには次を追加した (`src/views/SettingsDialog.tsx`, `src/storage/realEvaluationStorage.ts`)。

- 評価保存先を開く
- source indexを再構築
- 差分レビュー履歴を削除
- 修正ログ昇格データを削除
- 実MIDI評価データを削除

## 7. Fingerprintと後方互換

純TypeScriptの決定的SHA-256を追加した (`src/domain/midi/fingerprint.ts`)。新規解析は `sha256-<64 hex>` を使う。既存FNVログを失わないため `legacyFingerprintMidiBytes()` も残し、source indexには同じMIDIのSHA-256/FNV両方を登録する。

`parseChordLabel()`は `Cmaj9` 等をテンション分離前に完全qualityとして解釈するよう修正した (`src/domain/chords.ts`)。

## 8. Privacy

絶対pathを持てるのはローカル専用 `source-index.json` だけ。以下は評価ケース・レビュー・昇格ログへ保存しない。

- MIDI bytes
- 絶対path
- Idea title
- Next Action
- user memo / block memo / tags
- reference URL

評価schemaは `source.lastKnownPath` のような余計なfieldをstrict validationで拒否する。privacy統合テストは `src/domain/midi/realEvaluation/privacy.test.ts`。

クラウド送信処理は追加していない。

## 9. 検証結果

- `npm test`: 43 test files / 141 tests passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run eval:stored-progressions`: 2 blocks / 0 resolved / 2 skipped
- `npm run eval:review-differences`: 0 review cases
- `npm run eval:promote-corrections`: 0 feedback / 0 Gold
- `npm run eval:build-review-queue`: 0 cases
- `npm run eval:real-midi`: Gold 0 / Silver 0 / Bronze 0 / guard failure 0
- in-app browser: Settingsの日本語表示と評価操作を確認、Loop Vault 1421側console error 0
- `npm run tauri build`: passed

生成物:

```text
src-tauri/target-p362/release/loop-vault.exe
src-tauri/target-p362/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi
src-tauri/target-p362/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe
```

## 10. 人間に確認してほしい点

1. デスクトップ版CaptureでMIDIを選び、未編集保存がBronze相当、コード編集保存がSilver相当、確認チェックONがGold相当として保存されること。
2. 保存後のIdeaにMIDI assetが追加され、Settingsのsource index再構築件数が増えること。
3. `eval:stored-progressions`で元MIDI解決数が増え、Legacy/Reranker差分がHTMLへ出ること。
4. HTMLで試聴・判定し、書き出したJSONLを `--import-reviews` で取り込めること。
5. Goldが蓄積した後、`eval:real-midi`の回帰ガード結果を確認すること。

## 11. 既知の制約・未解決事項

- 実MIDIケースが現在0件なので、実MIDI精度と性能は未評価。既定モード変更条件は満たしていない。
- 静的HTMLはAppDataへ直接書けないため、レビューはlocalStorageへ保存しJSONLを書き出した後、CLIの `--import-reviews` で取り込む。
- SettingsからCLIそのものは起動しない。Tauri shell pluginを追加していないため、差分生成・昇格・評価はterminalで実行する。
- 現行差分snapshotにはTop-1/Top-2の個別scoreがないため、小margin理由はpriorityへ未反映。
- `ChordSymbol`に省略音の表現がないため、「5th省略」は許容解へ自動生成していない。
- Tauri AppData操作の自動integration testは未実装。domain、schema、CLI変換はテスト済みで、Settings表示は手動確認済み。
- source index再構築でTauriの許可範囲外に移動したMIDIは読み取れず省略される。CLI再構築は通常のOS権限で読めるpathを対象にできる。

## 12. 未変更の重要事項

- `defaultAnalyzerMode`は `legacy`。
- `fileVersion`は1。
- `chordDrip?: unknown`は未変更。
- Vaultのatomic write、20世代backup、破損退避は未変更。
- 評価CLIはVault repositoryへ保存しない。
