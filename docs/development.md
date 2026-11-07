# 開発者向けの情報

ビルドとテストの方法です。製品の使い方は [README](../README.md) と [使い方ガイド](guide.md) を見てください。

## 技術と前提条件

Tauri 2 / Rust、React 18 / TypeScript、Vite 7 を使用しています。音声再生は Tone.js、状態管理は Zustand、データ検証は Zod です。

- [Node.js](https://nodejs.org/en/download) 22 系(CI の使用バージョン)と npm
- [Rust / Cargo](https://rustup.rs/)(Windows は MSVC toolchain)
- [Tauri 2 の前提条件](https://v2.tauri.app/start/prerequisites/):Windows の C++ Build Tools と WebView2 など

## Setup

```bash
npm ci
npm run dev
```

ブラウザの開発画面は `http://localhost:1420` です。Vault はブラウザではメモリ内にあり、再読み込みで消えます。
デスクトップ版を開発起動する場合は、次を使います。

```bash
npm run tauri -- dev
```

## テストと品質

単体・統合テスト(Vitest)、Playwright による画面・操作・アクセシビリティのテスト、プライバシー・セキュリティ検査、Rust のテスト、production build を使います。

```bash
npm run lint
npm test
npm run playwright:install
npm run test:e2e
npm run security:scan
npm run security:audit
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

### 実行レベル

作業の大きさに合わせて、4 つのレベルを使い分けます([test-dx](test-dx/README.md))。

```bash
npm run test:fast -- <変更したパス>     # 変更・関係する単体 + 型 + source contract
npm run test:feature -- <パス>         # 機能単位の単体 + 代表的な画面
npm run test:ui -- <パス>              # 変更した画面を所有する Playwright
npm run test:full                      # リポジトリ全体(マージ候補用)
```

- `test:full` は**結果を使い回しません**(PASS のキャッシュを使わない)。FULL は毎回すべての手順を実行します
- ログ・実行時間・キャッシュは `.local-evaluation/`(Git 管理外)に置きます
- 失敗した実行はキャッシュしません。retry・skip・スナップショットの自動更新で緑にすることはありません

### その他の確認

- `npm run validate:phase-docs` / `npm run validate:ai-handoff`:ドキュメントの検証
- `npm run security:audit`:npm の監査(v2.1.0 時点で本番 high 1 件 = zod。理由と見直しは [release-validation](release/v2.1.0/release-validation.md) §2.2)
- `cargo audit --file src-tauri/Cargo.lock`:Rust の監査(理由つきの ignore は `.cargo/audit.toml`)
- `npm run typecheck:e2e`:Playwright の型検査

## ビルド

```bash
npm run build
npm run tauri -- build
```

`npm run build` は Web フロントエンドを、Tauri build は Windows 実行ファイルと配布物を生成します。
インストーラーを作らず実行ファイルだけビルドする場合は `npm run tauri -- build --no-bundle` を使います。

## リリース

- 変更の記録:[CHANGELOG](../CHANGELOG.md)
- v2.1.0 の記録:[含めるもの](release/v2.1.0/release-inclusion-audit.md)・[検証](release/v2.1.0/release-validation.md)・[配布物](release/v2.1.0/release-assets.md)・[リリースノート](release/v2.1.0/release-notes.md)
- v2.0.0 の記録:[docs/release/v2.0.0/](release/v2.0.0/)
- リポジトリの安全規則:[AGENTS.md](../AGENTS.md)。フェーズの進め方:[docs/phase-workflow/](../phase-workflow/README.md)

研究・比較中の未採用機能は、正式機能として含めていません。

## ライセンス

**本リポジトリはオープンソースではありません。** ソースコードは閲覧・評価目的で公開されています。
利用・実行・改変・再配布等の許諾条件は [LICENSE](../LICENSE) を確認してください。著作権者の書面による許可なく、商用利用・改変・再配布はできません。

同梱する FreePats のベース音色は CC0-1.0 です。第三者の音源・依存ライブラリにはそれぞれのライセンスが適用されます。
