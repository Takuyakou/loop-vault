# Loop Vault 作業報告書: UI言語切替

## 対象ブランチ

- 作業ブランチ: `feature/ui-language-toggle`
- ベースブランチ: `fix/window-close-exit`
- 位置づけ: PR #2 のウィンドウ終了修正の上に積むスタック作業

## 実装概要

Loop Vault の設定画面から UI 言語を `日本語` / `English` で切り替えられるようにした。言語設定は `data.json` の `settings.language` に保存され、自動保存の既存経路 `applyVaultChange()` 経由で永続化される。

主な変更点:

- `settings.language: "ja" | "en"` をデータモデルに追加
- 旧 `data.json` に `settings.language` が無い場合は `ja` をデフォルト補完
- Zustand store に `setLanguage(language)` を追加
- UI文言辞書 `src/i18n.ts` を追加
- Settings画面に言語セレクタを追加
- ナビ、保存状態、Settings、Home、Library、Capture、Detail、Create、Startup/EmptyState の主要文言を言語設定に接続

## 変更ファイル

- `src/domain/types.ts`
  - `AppLanguage` 型を追加
  - `VaultFile.settings` に `language` を追加
- `src/domain/schema.ts`
  - `appLanguageSchema` を追加
  - `vaultSettingsSchema.language` に `.default("ja")` を設定
  - zod default に合わせて `vaultFileSchema` の input 型を `unknown` に調整
- `src/domain/repository.ts`
  - `createEmptyVault()` の初期設定に `language: "ja"` を追加
- `src/store/vaultStore.ts`
  - `VaultStoreState.setLanguage(language)` を追加
  - `applyVaultChange()` 経由で保存されるよう実装
- `src/i18n.ts`
  - 日本語/英語のUI文言辞書を追加
- `src/App.tsx`
  - `settings.language` から `copy = appCopy[language]` を選択
  - SettingsDialog に言語セレクタを追加
  - 主要UI文言を `copy` 経由に置換
- `src/domain/schema.test.ts`
  - 旧settingsに `language` が無い場合 `ja` になるテストを追加
- `src/store/vaultStore.test.ts`
  - `setLanguage("en")` がstoreと保存データへ反映されるテストを追加
- `src/store/closeGuard.test.ts`
  - `VaultStoreState` fixture に `setLanguage` を追加

## データ互換性

- `fileVersion` は `1` のまま
- 新フィールド `settings.language` は zod default により後方互換
- 既存 `data.json` は `settings: { monthlyGoal: 1 }` のままでも読み込み可能
- 保存後は `settings: { monthlyGoal, language }` の形で書き出される

## UI動作

Settings画面に `言語 / Language` セクションを追加した。

- `日本語` を選ぶと主要UIが日本語表示になる
- `English` を選ぶと主要UIが英語表示になる
- 切替は即時反映
- 切替操作は自動保存対象

完全にすべての自由入力・解析結果・ユーザーデータを翻訳するものではない。Idea名、メモ、MIDI由来のコード名、エラー本文などは元データをそのまま表示する。

## 検証結果

実行済み:

- `npm.cmd run lint`: passed
- `npm.cmd test`: passed
  - 15 files
  - 67 tests
- `npm.cmd run build`: passed

追加テスト:

- `parseVaultFileJson()` が legacy settings の `language` 欠落を `ja` に補完する
- `setLanguage("en")` がstore stateと保存対象vaultに反映される

## 既知の制約

- 今回は主要画面のUI文言を対象にした。全ての細かい確認ダイアログ文・一部の英語固定ドメイン用語・ブラウザ/OS由来の文言までは完全翻訳していない
- Chord label、BPM、Key、Genre、Mood、ユーザー入力メモは翻訳対象外
- 言語切替はアプリ内設定として保存されるが、OSロケール自動判定は実装していない

## Claudeさんへの補足

この作業では、ドメイン層にUI辞書を入れていない。翻訳辞書は `src/i18n.ts` に限定し、`src/domain/*` の React/Zustand/Tauri 非依存ルールは維持している。

今後UIをコンポーネント分割する場合は、`AppCopy` をpropsで渡すか、React contextで `language/copy` を提供すると拡張しやすい。現在は単一 `App.tsx` が大きいため、次のUI拡張では `views/` 分割と同時にi18nの受け渡しを整理するとよい。
