# v3.2.0 の検証

比較元は公開 v3.1.0 `3b2e309e`。リリース候補の元はローカル `master` `4707d1c8`。公開コミットは比較元を親とする 1 コミットで作り、全体テストにかけた候補ツリーと同一のツリーを使います。

## 版と保存データ

版は `package.json`、`package-lock.json` の 2 か所、Tauri 設定、`Cargo.toml` と `Cargo.lock` で 3.2.0 に統一しました。設定の「アプリ版」は `src/buildInfo.test.ts` で確かめています(2 件 PASS)。

| 保存先・形式 | v3.1.0 → v3.2.0 | 根拠 |
|---|---|---|
| Vault `loopvault/txt-jazz-v3/data.json` | 2 → 2。書き出しの拡張形式は 3 → 3 | `src/domain/schema.ts`、`src/storage/jazzVaultStorage.ts` |
| テキスト進行の `textSource` | 1 → 1。標準の既存データでは省略可 | `src/domain/textSource.ts`、`src/domain/schema.ts` |
| Chord Dojo `chord-dojo-v1.json` | 4 → 4 | `src/domain/chordDojo/store.ts`、`src-tauri/src/chord_dojo_storage.rs` |
| 練習記録 `loopvault/practice-v1.json` | 2 → 2 | `src/features/bass-practice/infra/repository/practiceRepository.ts` |
| ガイド基礎・上級 `guided-course-v1.json`、`guided-course-advanced-v1.json` | 共に 1 → 1 | 各ガイドの `store.ts` |
| ボイシングドリルと設定 | 保存先・設定キーの変更なし | `voicingDrillRecords.ts`、`practice_storage.rs`、`src/domain/schema.ts`、`src/liveMidi/connectionPreferences.ts` |

`src/domain/voicing/compatibility.ts`・`src/domain/practiceCompatibility.ts`・`src/domain/vault.ts` は公開 v3.1.0 から変えていません(`git diff` 空)。Vault の保存境界の変更は、手で直した音(`manual`)を受け入れる**追加**だけで、古い `text-style-v1:` のスナップショットは今までどおり `isUsablePracticeVoicing` を通ります。v3.2.0 で保存する `text-shape-v1:` のスナップショットは、v3.1.0 の同じ関数(変更なし)で読める形です。

準備段階の対象テストは 9 ファイル・131 件すべて成功しました。対象は `textProgressionVoicing`(保存した出どころで分類する)、`textCardSound`(古い `text-style-v1:` の読み)、`sampleProgressions`(各コードの保存した音をそのまま保つ)、`vaultStore`、`voicingShapes/shapes`(K7:今の id の読み)、`txtJazzVoicing`、`textProgressionDraft`、`zodMigration.golden`(全スキーマの移行)、`extendedTextFullChartAcceptance`(古い形のスナップショットを保存しても作り直さない)です。個人の AppData は使いません。

## 依存の監査

- npm:`npm run security:audit`(全依存と本番依存)とも **0 件**。
- Rust:`cargo audit --file src-tauri/Cargo.lock`(リポジトリの一番上、`.cargo/audit.toml` の理由つき ignore 込み)で **脆弱性 0 件**(484 クレート)。`cookie` は 0.18.1 → **0.18.3**(RUSTSEC-2026-0594、`cargo update -p cookie --precise 0.18.3`。ほかの依存は変えていません)。`quinn-udp` はもう入っていません(M4 で `reqwest` を外したため)。`rustix` は **1.1.6**。ignore は 11 件で、すべて Tauri 2.11 系・tauri-plugin-opener 由来の unmaintained / unsound の警告です(理由は `.cargo/audit.toml`)。

公開側との差と個人情報の確認は [公開内容の確認](release-inclusion-audit.md) に記録します。最終候補の全体テストと Rust テストの実行値は公開前確認と公開後の作業報告に記録します。検証と配布が同一のツリーになるよう、最終コミット ID と実行後の数値は検証対象の外に置きます。
