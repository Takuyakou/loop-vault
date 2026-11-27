# 開発の手順(v3.2.0 から)

## 要る物

- **Node.js 22 系と npm**。`package.json` に `engines` は無いので、版の範囲は機械では縛っていない。前提は [README](../../README.md) の「前提条件」。
- **Rust と Cargo**(Windows は MSVC の toolchain)。Rust 側は `src-tauri/Cargo.toml` の edition 2021、`tauri` 2 系。
- **Tauri 2 の前提条件**(C++ Build Tools、WebView2)。アプリの対応 OS は Windows x64 で、WebView2 は Windows 11 に標準で入っている(README の「動作環境と気をつけること」)。
- **依存**:`npm ci`。`package-lock.json` のとおりに入れる。worktree を分けた時は `node_modules` を共有しない([AGENTS.md](../../AGENTS.md) の「Worktrees (Windows)」)。
- **Playwright のブラウザ**:ブラウザのテストを動かす時だけ、`npm run playwright:install` で chromium を入れる(`package.json`)。
- **MIDI 鍵盤は要らない**。画面だけで練習できる(README の「はじめかた」)。鍵盤の入力は Rust 側の `midir` が受ける(`src-tauri/Cargo.toml`)ので、鍵盤の確認はデスクトップの起動で行う。

## 起動

- `npm ci` で依存を入れてから始める。
- `npm run dev` — Vite の開発画面。`http://localhost:1420` を開く(README)。Vault はメモリの中だけで動く(README)。`vite.config.ts` の `server.port` は 1420 で `strictPort` なので、1420 が埋まっていると別のポートに逃げずに止まる。
- `npm run tauri -- dev` — Windows のデスクトップアプリとして起動する。Tauri が `src-tauri/tauri.conf.json` の `beforeDevCommand`(`npm run dev`)を先に走らせ、`devUrl` の 1420 を窓に読み込む。自分で `npm run dev` も立てると 1420 がぶつかるので、どちらか一方にする。
- `npm run preview` — ビルド済みの `dist/` を配って見る(`package.json`)。先に `npm run build` が要る。
- 保存・MIDI などデスクトップ側の動きは、ブラウザの `npm run dev` では確かめられない。`npm run tauri -- dev` を使う。

## ビルド

- `npm run build` — `tsc && vite build`。型検査が通ってから Vite が `dist/` を作る(`package.json`)。Tauri はこの `dist/` を読む(`src-tauri/tauri.conf.json` の `frontendDist` が `../dist`)。
- `npm run tauri -- build` — `beforeBuildCommand` の `npm run build` の後に Rust を release でビルドし、配布物を作る。`bundle.targets` が `all` なので、NSIS の `setup.exe` と MSI が出る(`src-tauri/tauri.conf.json`)。
- 出力は `src-tauri/target/` の下。exe の名前は `loop-vault`(`src-tauri/Cargo.toml` の `package.name`)、インストーラーは `target/release/bundle/` に出る。
- インストーラーを作らず exe だけ作る時は `npm run tauri -- build --no-bundle`(README の「ビルド」)。
- 出力はリポジトリに入れない。`.gitignore` が `dist/`・`target/`・`src-tauri/target/` を除外し、`npm run check:staged` も `src-tauri/target` を拒む(`scripts/check-staged-files.mjs`)。
- 配布するファイルの名前は `Loop.Vault_<version>_x64-setup.exe`・`Loop.Vault_<version>_x64_en-US.msi`・`loop-vault.exe`・`SHA256SUMS`(README の「ダウンロードするファイル」)。

## テストの組

テストは `scripts/test-dx/run.mjs` が、変えた所から必要な契約を選んで走らせる。ログは `.local-evaluation/test-logs/`、同じ状態で通った記録(PASS キャッシュ)は `.local-evaluation/gate-cache/` に置き、どちらも git に入れない(`.gitignore`)。

| コマンド | 何をするか | いつ使うか |
|---|---|---|
| `npm test` | `vitest run`。ユニットと部品の全件(E2E は含まない。`vite.config.ts` の `test.exclude`)。 | 手早く全部を見たい時。 |
| `npm run test:watch` | `vitest`。ファイルを変えると走り直す。 | 1 ファイルを直している間。 |
| `npm run test:fast` | 変えた所の Vitest と、その持ち主の小さな確認。アプリの型検査と source-contract の lint も入る。 | 1 回の編集ごと。 |
| `npm run test:feature` | 領域の区切り。依存の関係する Vitest と領域の契約、画面が変わるなら持ち主のブラウザの spec。 | 機能の区切り。パスか分岐の差分が要る(どちらも無いと失敗する)。 |
| `npm run test:ui` | 変えた画面を持つ Playwright の spec。パスが無ければ決まった 9 本(`scripts/test-dx/selection.mjs` の `criticalUiSpecs`)。 | 画面の見た目や操作を変えた時。 |
| `npm run test:full` | merge candidate 用。型検査・lint・docs/AI/privacy・production build・Vitest 全件・Playwright の core を、キャッシュを使わず新しい状態で全部。 | 統合の前。 |
| `npm run test:full:all` | FULL に extended の E2E も足す(light 全件と heavy の 2 回)。 | 時間をかけて全部見る時。 |
| `npm run test:e2e:extended` | extended の E2E だけ(archive/sweep の light と heavy)。 | FULL の後に重い所だけ確かめる時。 |

パスはリポジトリからの相対で、複数渡せる。

```bash
npm run test:fast -- src/components/capture/textCaptureStatus.ts
npm run test:feature -- src/styles/text-intake.css
npm run test:ui -- e2e/voicing-loop-v2.spec.ts
```

- パスを渡さない FAST と FEATURE は、`master...HEAD` と作業ツリーの差分から選ぶ(`scripts/test-dx/run.mjs` の `changedFiles`)。
- UI はパスが無ければ決まった 9 本。`--changed` を付けると差分から選ぶ(`run.mjs`)。
- `--explain` で、どのファイルを持ち主の契約として選んだかを全部出す。
- `--fresh` で PASS キャッシュを使わない。FULL・FULL-ALL・extended は初めからキャッシュを使わない(`scripts/test-dx/cache.mjs` の `cacheEnabled`)。
- FULL は、ESLint・class と source の lint・アプリと E2E の型検査・phase docs と AI handoff と docs layout と privacy の検査・production build・ランナーの Node テストを並べ、その後に Vitest 全件、Playwright の core、`git diff --check`、追跡 PNG の検査を行う(`run.mjs` の `runFull`)。0 件で通ることはない(`finishStep`)。

ブラウザのテスト(`scripts/run-playwright-visual-tests.mjs`)は、アプリの型検査 → fixture の `vite build` → Playwright の順に走る。

| コマンド | 何をするか |
|---|---|
| `npm run test:e2e` | 全 spec の Playwright。 |
| `npm run test:e2e:update-baselines` | 画面の基準画像を今の状態で書き直す。 |
| `npm run test:e2e:update` | `test:e2e:update-baselines` の別名。 |
| `npm run test:e2e:settings-visual` | Settings の基準画像だけを確かめる。 |
| `npm run test:e2e:settings-visual:update-baseline` | Settings の基準画像だけを書き直す。 |
| `npm run test:e2e:capture-results-visual` | 取り込みの状態と修正の流れの基準画像を確かめる。 |
| `npm run test:e2e:capture-results-visual:update-baseline` | その基準画像の、変わった物だけを書き直す(`--update-snapshots=changed`)。 |
| `npm run test:e2e:report` | Playwright のレポートを開く。 |
| `npm run test:playwright-visual-runner` | ランナー自身の Node テスト。 |
| `npm run test:security-scripts` | `scripts/security/` の Node テスト。 |

基準画像の書き直しは、意図して画面を変えた時だけ、差分を見てから使う。FAST・FEATURE・UI・FULL は基準画像を受け入れない(`docs/archive/phases/test-dx/README.md`)。

## 検査

- `npm run lint` — `eslint .` と `lint:classes` と `lint:source-contracts` をまとめて(`package.json`)。
- `npm run lint:classes` — `src/` の Tailwind の CSS 変数ユーティリティの書き方を確かめる(`scripts/lint-tailwind-classes.mjs`)。
- `npm run lint:source-contracts` — `src/components` と `src/views` のアイコン(古いグリフ、文字の C のコピーアイコン、`lucide-react` の大きさが 16px か 20px)と、`src-tauri/src/main.rs` がリリースでコンソールを出さない属性を持つことを確かめる(`scripts/lint-source-contracts.mjs`)。
- `npm run typecheck:e2e` — Playwright 側の TypeScript(`tsc -p tsconfig.e2e.json`)。
- `npm run check:staged` — ステージしたファイルに、私物の MIDI・`.local-evaluation/`・`src-tauri/gen/`・`src-tauri/target` が無いことを確かめる。MIDI は `test/fixtures/` の合成物だけ通す(`scripts/check-staged-files.mjs`)。
- `npm run validate:phase-docs` — フェーズ文書のテンプレートと、`execution-state.json` を持つ各パッケージの形(`scripts/phase-docs/validate.mjs`)。
- `npm run validate:ai-handoff` — `docs/ai-handoff/` の文書、`HANDOFF.md` に書いた確認済みの commit が git に実在して祖先か、私物の音声が追跡されていないか(`scripts/ai-handoff/validate.mjs`)。
- `npm run validate:docs-layout` — docs の並び(`README.md` と 8 つのフォルダだけ)、リポジトリ直下の並び、コードの中の `docs/…` が実在するか、`scripts/` の相対 import が実在するか、決まった文書に個人の絶対パスと公開できない言葉が無いか(`scripts/docs-layout/validate.mjs`)。`--release` を付けると、言葉の一覧を必須にし、追跡しているテキスト全部と、渡した文(公開用コミットのメッセージ・リリースノート・About 欄)まで調べる。
- `npm run security:scan` — 追跡ファイルと、除外されない未追跡ファイルに、個人の絶対パス・秘密鍵・トークンらしい文字列・資格情報入りの URL が無いこと(`scripts/security/trackedSecurityScan.mjs`)。
- `npm run security:audit` — `npm audit --audit-level=high` を、全依存と本番の依存だけで 2 回(`package.json`)。
- `npm run hooks:install` — `core.hooksPath` を `.githooks` に向ける。pre-commit で `check:staged` が走る(`.githooks/pre-commit`)。
- `cargo test --manifest-path src-tauri/Cargo.toml --locked` — Rust 側のテスト(README の「テストと検査」)。`src-tauri/src/` にテストがある。

ゲートではない道具:`benchmark:*` は測る、`tune:*` は重みを調整する、`diagnose:*` は原因を調べる、`ablate:midi` は条件を抜いて比べる、`generate:p47:corpus` と `seed:demo` はデータを、`p89:screens` は画面の記録を、`audio:ab:freepats` は音の比較を作る(`package.json`)。必要な時だけ使う。

README のデモ GIF(`docs/images/v3-demo.gif`)を撮り直す時は、`npm run build` の後に `node scripts/demo/record-demo.mjs` を回す(合成データのみ・960px・15fps・音なし・8MB 以下)。`ffmpeg` は PATH、無ければ `FFMPEG_PATH` から取る。`package.json` の script には足していない。

## リリースの手順の場所

- リリースの記録は `docs/release/` に版ごとのフォルダで置く([docs/README.md](../README.md) の表)。v3.1.0 のフォルダが今の形:
  - `release-inclusion-audit.md` — 公開側との差、開発機のパス、画像・音源・MIDI の確認
  - `release-validation.md` — 版と保存データ、npm と Rust の監査、全体テスト
  - `release-assets.md` — 配布物の種類と SHA-256
  - `release-notes.md` — 利用者向けの説明
- 記録は、含める物 → 検証 → 配布物 → ノートの順に読める。次の版は、前の版の 4 本を雛形にする。
- 公開するツリーは、全体テストをかけた候補と同じ 1 コミットにする([v3.1.0 の検証](../release/v3.1.0/release-validation.md))。配布物はテストしたツリーから `npm run tauri -- build` で作り、ハッシュを `SHA256SUMS` に置く([v3.1.0 の配布物](../release/v3.1.0/release-assets.md))。
- 版の番号は `package.json`・`package-lock.json`(2 か所)・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml`・`src-tauri/Cargo.lock` で揃える(v3.1.0 の検証)。
- 変更の記録は [CHANGELOG.md](../../CHANGELOG.md) に版ごと 1 節。
- docs に入れるのは、リリースの時に確定した設計書だけ(`docs/designs/v3.x.0-<中身>.md`)。下書き・作業の指示・途中の記録はリポジトリの外に置く。`current/` は 5 本のまま増やさない。docs の直下と `archive/` にファイルを足さない([docs/README.md](../README.md) の「書き方の決まり」)。この決まりと docs の並びは、`npm run validate:docs-layout` が機械で確かめる。
