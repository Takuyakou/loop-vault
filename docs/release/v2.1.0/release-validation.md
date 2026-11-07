# Loop Vault v2.1.0 — 検証記録

- 対象ブランチ: `release/v2.1.0`(起点 `master` `6b112c12`)
- 公開の形: `65593f75` の上に **1 コミットだけ**(`public/v2.1.0`)。理由は §1
- この記録は、最後の FULL を通した HEAD を §5 に書きます

## 1. 公開の形と、途中の履歴を公開しない理由

R-03 §4 の履歴監査で、**公開される範囲(328 コミット)の途中に、開発用の作業フォルダの絶対パスが残っている**ことが分かりました(16 ファイル・51 か所。詳しくは [STOP-1](STOP-1-history-privacy.md))。利用者の判断で履歴の書き換えは行わず、**公開は「v2.1.0 を 1 つのコミットにまとめる」方式**にしました。

- 公開用コミット `public/v2.1.0` の親は `65593f75` のみ。途中の 328 コミットは公開しません
- 手元の `master` と `release/v2.1.0` の履歴はそのまま残します
- 公開ツリーからは、該当 47 ファイルのパスを `<作業フォルダ>` に置き換えました(`831bb677` の 16 ファイル + `5b9a78aa` の 31 ファイル)。**ツリー全体のスキャンは 0 件**(テスト用の架空パス 3 件のみ許可)
- 公開用の 1 コミットは、**最後の FULL を通した `release/v2.1.0` のツリーと同じツリー ID**で作ります(§5・§6)

## 2. 依存

### 2.1 Rust(R-02 の結果を写す)

| 分け方 | 内容 | 結果 |
|---|---|---|
| 直った版に更新した | quinn-proto 0.11.16→0.11.19、rustls 0.23.45→0.23.46、rustls-webpki 0.103.15→0.103.16、webpki-roots 1.0.9→1.0.11、tokio 1.52.3→1.54.1、event-listener 5.4.1→5.4.2、async-executor 1.14.0→1.14.1、chacha20 0.10.1→0.10.2 | RUSTSEC 脆弱性 11 件 + 警告 4 件を解消 |
| Windows 版に入らない | glib 0.18.5、proc-macro-error 1.0.4、zbus_names 4.3.2、zvariant 5.12.0、zvariant_derive 5.12.0(`cargo tree --target x86_64-pc-windows-msvc -i` が **nothing to print**) | 警告のみ。Windows ビルドに含まれない |
| 入っているが、危険を受け入れる | unic-char-property / unic-char-range / unic-common / unic-ucd-ident / unic-ucd-version(urlpattern → tauri-utils。手入れ終了の知らせだけ) | 警告のみ。remote ケーパビリティを使わない |
| 直っていない脆弱性 | **0 件** | — |

- 確認:`cargo audit --file src-tauri/Cargo.lock`(一番上、ignore 込み)= 終了コード 0・0 件 / `src-tauri` で `cargo audit --file Cargo.lock`(ignore なし)= **脆弱性 0・警告 10**(R-02 と同じ)。`cargo test --manifest-path src-tauri/Cargo.toml --locked` = 70 passed。
- v2.0.0 は警告を残す方針でしたが、今回は**理由と見直す時を書いて ignore** にしています(`.cargo/audit.toml`)。

### 2.2 npm — **「High/Critical 0」は満たしていません(本番 high 1 件: zod。理由をつけて受け入れ)**

`npm run security:audit`:

| 範囲 | 結果 |
|---|---|
| 全部 | 17 件(critical 2・high 3・moderate 12) |
| 本番(`--omit=dev`) | **high 1 件** のみ = **zod** |

#### 受け入れる理由(GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404)

- 内容: **長さの上限が無い配列のスキーマ**で、大量の要素を渡すと、**不合格の要素ごとにエラー(issue)を溜め続け**、メモリを使い切る。影響は**アプリが落ちること(可用性)だけ**で、データの読み出し・改ざん・外部送信はない(CVSS 7.5、`C:I/I:N/A:H`)
- 直る版:**zod 4.6.6 以降**(現在 3.25.76)。3.x に修正版は無い
- **v2.0.0 も同じ zod 3 系**(`^3.25.0`)で出している。今回のリリースで**悪くなってはいない**

#### このアプリで zod が外から来たデータを読む所と、その手前の上限

| 読み込む所 | コード | zod に渡す前の上限 |
|---|---|---|
| Vault(`data.json`)の読み込み | `src/domain/repository.ts:112` → `parseLoadedVault` | **読み込み時点では上限なし**。解析**後**に 16 MiB 判定(`repository.ts:279-285`、`MAX_EXTERNAL_VAULT_BYTES` = `src/security/intakeBudgets.ts:13`) |
| バックアップからの復元 | `repository.ts:218` | 同上(復元はアプリが作ったバックアップのみ。書き込み時に 16 MiB 以内) |
| Vault の読み込み(外部ファイル) | `repository.ts:160`(`{external:true}`) | **あり**:`tauriVaultStorage.ts:38-45` が `metadata.size` と読み込み後の UTF-8 バイト数を 16 MiB で判定 |
| 設定の読み込み | Vault の `settings`(同じ `data.json`) | 同上 |
| Chord Dojo の記録 | `src-tauri/src/chord_dojo_storage.rs:585,596` → `parseDojoStore` | **あり**:読み込みが `read_bounded_utf8(path, MAX_PRACTICE_BYTES)`、`MAX_PRACTICE_BYTES = 16 MiB`(`chord_dojo_storage.rs:22`) |
| Bass Practice などの練習記録 | `src-tauri/src/practice_storage.rs:630`(`read_bounded_utf8`) | **あり**:`MAX_PRACTICE_BYTES = 16 MiB`(`practice_storage.rs:21`) |
| 耳で弾く・Original・Jazz の記録 | 同じ `practice_storage`(ブラウザではメモリ) | 同上。ブラウザでは同一オリジンの localStorage のみ |
| テキスト取り込み(標準・拡張) | `extendedTextBudgets.ts:2-13` | **あり**:入力 65,536 文字・256 小節・4,096 トークン・512 セクションなど |
| MIDI 取り込み | `src/security/intakeBudgets.ts:1-11` | **あり**:16 ファイル・1 ファイル 16 MiB・合計 64 MiB・50 万イベント |
| Live MIDI の設定 | `src/liveMidi/preferences.ts`(zod) | localStorage のみ(アプリ自身が書く。外部ファイルを読まない) |
| Progression Advisor(LLM) | `src/domain/progressionAdvisor/schema.ts` | 画面から外している(P8.9)。通常の使い方では通らない。ネットワーク応答の大きさに上限は無い |

**上限が無い所**(直すかどうかは利用者の判断。今回は直していません):

1. `repository.ts:112` の Vault 本体と `:218` のバックアップ復元 — **zod に渡す前**のバイト上限が無い(解析後に 16 MiB を判定)。アプリ自身が書くファイルは 16 MiB 以内だが、**手で置き換えた・壊れたファイル**では解析が先に走る
2. `repository.ts` のブラウザ保存(メモリ)と、`liveMidi/preferences.ts` などの localStorage — 同一オリジンのアプリ自身が書く値のみで、外部から持ち込む経路が無い
3. Progression Advisor の応答(画面から外している)

- 上の 1 は、**通常の使い方**(アプリが保存した Vault・バックアップを開く)では起きません。異常に大きいファイルを手で置いた場合だけです。
- 見直し: **DEP-01**(v2.1.0 公開後)で zod 4 へ移行し、開発用ツール(vitest 5・eslint 9 系)も更新します。

#### 開発用の 17 件は配布物に入らない

`npm ls --omit=dev` の本番依存は次の 12 だけです(vitest・vite・eslint・typescript-eslint は入りません):

```text
@tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs,
@tauri-apps/plugin-opener, @tonejs/midi, lucide-react, midi-file,
react, react-dom, tone, zod@3.25.76, zustand
```

## 3. データの互換

**データの形は変わりません(Vault の `fileVersion` は 2 のまま)。変わるのは保存するフォルダで、初回起動でこれまでの記録を新しいフォルダへ写して使います。**

| 項目 | v2.0.0 | v2.1.0 | 判定 |
|---|---|---|---|
| Vault の形 | `fileVersion: 2` | **同じ**(ファイルの中身の形は変えない) | 形は互換 |
| Vault の保存場所 | `loopvault/data.json` | `loopvault/txt-jazz-v3/data.json`(初回起動で旧ファイルから写す) | **場所が変わる** |
| 旧ファイルの扱い | — | 旧 `loopvault/data.json` の生バイトを `loopvault/txt-jazz-v3/legacy-import.json` として永久に残す。旧 `loopvault/data.json` とそのバックアップは**変更しない** | 元は残る |
| 書き出すときの版 | 2 | alt を含まなければ **2**、含めば **`fileVersion: 3`** | alt のときだけ 3 |
| Vault のブロックのスキーマ | `textSource`・`sourceBassline`・`practice` などを含む `.strict()` | 同じ項目 + 追加の任意項目 | v2.0.0 のデータはそのまま読める(§3.1)。v2.1.0 で増えた項目を v2.0.0 が読むと、**その項目を持つ進行だけ**が検証に落ちる可能性 |
| Chord Dojo の記録 | v2.0.0 の Dojo の保存場所 | `theme-lessons-txt-jazz-v4`。以前の場所(`theme-lessons-ranges-v4` → `theme-lessons-v4` → `theme-lessons`)から**一度だけ読み取り専用で写す** | 別の保存場所 |
| 練習の記録 | v2.0.0 の記録 | `original-practice-v1`・`jazz-progressions-v1`・`ear-practice` など専用の置き場所(版 1) | v2.0.0 は読まない |
| `identifier` / `productName` | `com.takuyakou.loopvault` / `Loop Vault` | 同じ | **変わらない**。MSI の UpgradeCode・NSIS も同じ設定 |

### 3.1 v2.0.0 のデータを v2.1.0 で開く(合成データで確認)

- 方法: v2.0.0 の形の Vault(`fileVersion: 2`、追加項目を持たない進行 1 件・コード 2 枚)を作り、現在の `parseVaultFileJson` に通した
- 結果: **`fileVersion: 2`・進行 1 件・コード 2 枚のまま読み込め、quarantine 0**。再シリアライズも通る(2,108 バイト)
- 実際の Vault は使っていません(`.local-evaluation/r03/compat-v200.ts`、未追跡)

### 3.1.1 写す仕組み(コードのとおり)

- **Vault**:`loopvault/txt-jazz-v3/data.json` が無いとき、旧 `loopvault/data.json`(v1/v2、隔離なし)を読んで検証し、`loopvault/txt-jazz-v3/legacy-import.json` に**生バイトのまま**書き、続けて `loopvault/txt-jazz-v3/data.json` を書く(一時ファイル → rename)。旧 `loopvault/data.json` と `loopvault/backups/` には書きません(`src/storage/jazzVaultStorage.ts`)
- **Chord Dojo**:`theme-lessons-txt-jazz-v4` を初めて使うとき、以前の場所から**一度だけ読み取り専用で**写します。壊れた・未来の版・不完全なときは、空で初期化せずに拒否して元を残します(`src-tauri/src/chord_dojo_storage.rs` の `THEME_DIR` と `import_previous` 系)
- **根拠のテスト**(いずれも FULL / `cargo test` で通過):
  - `src/storage/jazzVaultStorage.test.ts` …「persists altered symbols and exact registered notes through save reload export and import」「preserves the permanent migration copy and blocks a partial-write retry」「preserves new data when an old repository saves or restores its separate namespace」「points legacy-import.json at the place the restore reads it from (no doubled folder), and restores from it as before」
  - `src-tauri/src/chord_dojo_storage.rs` …`jazz_namespace_imports_range_bytes_read_only_and_survives_old_save_and_rollback`、`jazz_incomplete_namespace_refuses_empty_fallback_and_preserves_artifacts`、`jazz_import_refuses_invalid_or_future_range_before_earlier_theme`、`theme_namespace_preserves_legacy_bytes_and_backups`
  - `src/domain/txtJazzWorkflow.test.ts` …「preserves snapshots/identity while denying unsupported generation and Context entry」「rejects parser errors before saving either dialect, including partially valid input」

### 3.2 v2.1.0 のデータを v2.0.0 で開くと

- Vault(`fileVersion: 2`、通常の進行):読める見込み。ただし v2.1.0 で増えた任意項目を含む進行は、v2.0.0 の `.strict()` で**その進行だけ**が検証に落ち、隔離・復旧の表示になる可能性
- Chord Dojo・練習の記録:別の保存場所・別の版なので、v2.0.0 では**見えない**(消えはしない)
- alt を含む書き出し(`fileVersion: 3`):v2.0.0 では**開けない**
- したがって、リリースノートと README に「**移ったあとは v2.0.0 を使わない**(v2.1.0 の変更は v2.0.0 に反映されない)」と書きます

### 3.3 入れ替え(アップグレード)

- `identifier`・`productName` は v2.0.0 と同じ。データの置き場所の決め方(`loopvault/` 配下)も同じ
- 初回起動で、v2.0.0 の Vault が `loopvault/data.json` から **`loopvault/txt-jazz-v3/` へ写されて使われ、元は `legacy-import.json` として残る**。旧 `loopvault/data.json` とそのバックアップは変えない。Chord Dojo も `theme-lessons-txt-jazz-v4` へ一度だけ読み取り専用で写す(§3.1.1)
- 写したあとは v2.0.0 の変更を読まない(逆も同じ)
- **実際のインストーラーでの入れ替えは行っていません**(切り離した Windows が無く、この PC の実際の AppData を変えないため)。実機で入れ替える前に、Vault のバックアップ(設定 → データ)と、`loopvault` フォルダの写しを取るよう案内します

## 4. 公開してよいかの確認

| 確認 | 結果 |
|---|---|
| `npm run security:scan` | **PASS** |
| 公開される範囲の履歴(328 コミット・3,605 blob) | 個人の絶対パスが **16 ファイル・51 か所**(+ 過去版 64 か所)。→ **この範囲は公開しない**(§1) |
| 公開ツリー(release/v2.1.0) | **0 件**(テスト用・説明用の架空のパスは除く)。**JSON の中で円記号が2つ重なった形も照合に足して再スキャン**した(§4.2) |
| メールアドレス・秘密情報・私的な音声/MIDI/動画 | 履歴スキャンで **0 件**(メールは `@1440x900.png` のような画像名の誤検出のみ) |
| 作者 | 範囲内はすべて `Codex <codex@local>`。個人のアドレスではない |
| 追跡中の PNG 152 件 | 利用者が目視で確認済み(74 枚が合成データ)・生成元の spec も特定(§4.1) |
| 依存 | §2(本番 high 1 件は理由をつけて受け入れ) |

### 4.2 スキャンの漏れ(JSON の `\\`)と修正

- 最初のスキャンは、スラッシュと1つの円記号で書いた形を見ていましたが、**JSON の中で円記号が2つ重なった形**を見落としていました
- 2 ファイル 4 か所を `<作業フォルダ>` に置き換えました:`docs/phase4.5/11-final-report.json`(3 か所)、`docs/phase5.14/00-baseline-lock.json`(1 か所)
- **この 2 ファイルは v2.0.0 ですでに公開されていた**ものです(今回新たに漏れたものではありません)。JSON として妥当なまま置換しています
- 照合に「`\\` が2つ重なった形」を足して、**公開ツリー全体を再スキャンして 0 件**を確認しました(テスト用・説明用の架空パスは除外)

### 4.1 追跡中の画面写真(PNG)

- リポジトリ全体で追跡中の PNG は **152 件**。内訳は`docs/reports/`・`docs/images/`・`artifacts/`(旧フェーズの記録)・`e2e/visual.spec.ts-snapshots/`。音声・MIDI・動画はありません
- **目視は利用者側で完了しました**。v2.0.0 以降に増えた・変わった **74 枚**を確認し、**すべて合成データ**(実際の Vault の進行名・メモが写っていない)でした
- **今回の README 用の 4 枚**(`docs/images/v2.1-*.png`)は、`e2e/docs-images.spec.ts` が**合成フィクスチャだけで**撮ることを確認しました(通常は `p89-generated/docs-images/`、`UPDATE_REPORT_SCREENSHOTS=1` のときだけ `docs/images/` に書きます)
- 既存の PNG は、名前を e2e の spec から検索して **47 件**は書き出す spec を特定できました(`visual.spec.ts` 19・`p16-ear-records` 10・`p17-01-screens` 6 ほか)。残りは旧フェーズの `artifacts/` と `docs/` の記録で、現在の spec からは生成されません(v2.0.0 で既に公開済み)

## 5. 最後の確かめ(実行結果)

- **確かめた HEAD**:`release/v2.1.0` の **`2e0a9c2b`**。ツリー ID は **`a9f23c4c0addb58940f970fd9cc49afa635b43e2`**
- **`node scripts/test-dx/run.mjs full --fresh`:PASS — 888.7s**(PASS のキャッシュなし)
  - ESLint・class lint・source contracts・E2E TypeScript・phase docs・AI handoff・privacy scan・app TypeScript・production build・gallery excluded:PASS
  - Runner contracts **39/39**
  - **Vitest 6,281 / 6,283**(既存スキップ 2)
  - **Playwright 主パス 806 / 808**(既存/条件付きスキップ 2)・**heavy パス 47/47**
  - `goto` の開き直り 0 回・Git 差分チェック PASS・追跡 PNG 変化なし
  - ログ:`.local-evaluation/test-logs/2026-11-07T09-58-15-813Z-full.log`(Git 管理外)
- **`cargo test --manifest-path src-tauri/Cargo.toml --locked`**:70 passed / 0 failed
- 本番ビルドの起動:上の FULL の Playwright が**production build を `vite preview` で配信して**全画面を操作しており、そこで JS エラーは検出されていません。加えて、配布物の EXE は `src-tauri/target/release/loop-vault.exe` に生成済みです(実際の Vault では起動していません)
- **この記録の追記(この節と §4.2・§6 の文面)は、FULL を通したツリーのあとの docs だけの変更**です。公開用コミットは、FULL を通したツリーから **docs/ の中の文書だけ**を直したツリーで作ります(コード・テスト・設定の差はありません)

## 6. 公開用コミットの確認

- 公開用コミットは `git commit-tree` で作り、**親は `65593f75` だけ**、作者・コミッターは `Takuyakou <53846387+Takuyakou@users.noreply.github.com>` です
- ツリーは、**FULL を通したツリー**(§5)から **docs/ の中の文書だけ**を直したものです。直したのは §3(保存場所)・§4.1(目視)・§4.2(JSON の `\\` の修正)・この記録・[release-notes](release-notes.md)・[release-assets](release-assets.md) で、**コード・テスト・設定の差はありません**(`git diff --name-only` で docs/ 以外が出ないことを確認)
- `65593f75..public/v2.1.0` のスキャンは **0 件**(個人パス・メール・秘密情報・私的なメディアなし)。`git merge-base --is-ancestor` で **fast-forward できる**ことを確認済み(force push は不要)
- 確認した**公開用ツリーとコミットの ID**、および docs だけの差分の一覧は、公開後にリリースブランチのこの記録へ追記します(この公開スナップショットには含まれません)
- push・タグ・GitHub Release は**していません**(R-04 で利用者が決める)

### 公開用コミットの確定値(公開スナップショットのあとに追記)

| 確認 | 結果 |
|---|---|
| 公開用コミット | `public/v2.1.0` = **`dbf3cfada6bc55f36436dd69bd411ef9c66ebfd7`** |
| 親 | **`65593f75` のみ**(1 コミット) |
| ツリー | **`0e0924e72740d2bda83a716b9a0dc01ab59ee8b0`** |
| FULL を通したツリー(`2e0a9c2b` / `a9f23c4c…`)との差 | **docs の 4 ファイルだけ**:`docs/phase4.5/11-final-report.json`・`docs/phase5.14/00-baseline-lock.json`・`docs/release/v2.1.0/release-notes.md`・`docs/release/v2.1.0/release-validation.md`。**docs/ 以外の差は 0**(コード・テスト・設定は同じ) |
| 作者・コミッター | `Takuyakou <53846387+Takuyakou@users.noreply.github.com>` |
| `65593f75..public/v2.1.0` のスキャン | **1 コミット・984 blob・0 件**(テスト用の架空パス 2 件のみ許可) |
| fast-forward | **可能**(`git merge-base --is-ancestor`)。force push は不要。`origin/master` から **1 コミット** |

- この「確定値」は、公開用コミットを作った**あとの docs だけの追記**です(公開ツリーは `0e0924e7…` のまま)

## 7. 配布物

`npm run tauri -- build` で EXE・NSIS・MSI を作り、大きさと SHA-256・`SHA256SUMS` を [release-assets](release-assets.md) に記録しました。配布物は Git で追跡しない場所(`src-tauri/target/release/` と `p89-generated/release-v2.1.0/`)に置いています。3 つのバイナリに個人のパスが無いことも確認済みです(§release-assets)。
