# v3.1.0 の検証

比較元は公開 v3.0.0 `57368f7c`。リリース候補の元はローカル `master` `4c4097a2`。公開コミットは比較元を親とする1コミットで作り、全体テストにかけた候補ツリーと同一のツリーを使います。

## 版と保存データ

版は package.json、package-lock.json の2か所、Tauri設定、Cargo.toml と Cargo.lock で3.1.0に統一。設定の「アプリ版」は `src/buildInfo.test.ts` で検証します。

| 保存先・形式 | v3.0.0 → v3.1.0 | 根拠 |
|---|---|---|
| Vault `loopvault/txt-jazz-v3/data.json` | 2 → 2。書き出しの拡張形式は3 → 3 | `src/domain/schema.ts`、`src/storage/jazzVaultStorage.ts` |
| テキスト進行の `textSource` | 1 → 1。標準の既存データでは省略可 | `src/domain/textSource.ts`、`src/domain/schema.ts` |
| Chord Dojo `chord-dojo-v1.json` | 4 → 4 | `src/domain/chordDojo/store.ts`、`src-tauri/src/chord_dojo_storage.rs` |
| 練習記録 `loopvault/practice-v1.json` | 2 → 2 | `src/features/bass-practice/infra/repository/practiceRepository.ts` |
| ガイド基礎・上級 `guided-course-v1.json`、`guided-course-advanced-v1.json` | 共に1 → 1。基礎の教材・方針・ペアIDを維持 | 各ガイドの `store.ts`、基礎の `bank.json` |
| ボイシングドリルと設定 | 保存先・設定キーの変更なし。Vault設定は同じVault形式 | `voicingDrillRecords.ts`、`practice_storage.rs`、`src/domain/schema.ts`、`src/liveMidi/connectionPreferences.ts` |

P24-02 I-4は新規の耳回答を採点する規則の変更です。保存済みのLv1・Lv2の合否は試行記録から読み、採点し直しません。P24-03のサンプル進行は通常のVault v2進行として保存されます。標準・拡張の旧保存形状の再読み込み、保存済みガイド合否、サンプル追加を対象テストで確認します。個人のAppDataは使いません。準備段階の対象テストは6ファイル・32件すべて成功しました。対象は buildInfo、textAttackSave、guidedCourse/review、domain と store の sampleProgressions、extendedTextFullChartAcceptance です。

## 依存の監査

候補の依存関係はnpmの全依存・本番依存とも0件。初回のRust監査で `url 2.5.8` の [RUSTSEC-2026-0592](https://rustsec.org/advisories/RUSTSEC-2026-0592.html) を検出して停止し、修正版2.5.9に更新しました。その依存として `form_urlencoded` は1.2.3。再監査は脆弱性0件・警告0件。監査の除外は追加していません。

公開側との差と個人情報の確認は [公開内容の確認](release-inclusion-audit.md) に記録します。最終候補の全体テストとRustテストの実行値は公開前確認と公開後の作業報告に記録します。検証と配布が同一のツリーになるよう、最終コミットIDと実行後の数値は検証対象の外に置きます。
