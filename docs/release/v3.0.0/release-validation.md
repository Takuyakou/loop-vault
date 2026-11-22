# Loop Vault v3.0.0 — 検証記録

- 対象ブランチ: `release/v3.0.0`(起点: local `master` `6a857dfb`)
- 公開の形: `origin/master`(`142b3877`)の上に **1 コミットだけ**(`public/v3.0.0`)。理由と作り方は §1
- この文書は、公開のコミットのツリーに入ります。**FULL・`cargo test`・配布物の結果と、公開のコミット ID・ツリー ID は、この文書を書き換えると ID が変わってしまうため、ここには書かず**、報告 `docs/reports/rel-02-release.md` と、配布物の `SHA256SUMS`(GitHub のリリース)に書きます(§5)

## 1. 公開の形

- 公開用コミット `public/v3.0.0` の親は `142b3877`(GitHub の `master`)のみ。途中の履歴は公開しません(v2.1.0 と同じ)。
- そのコミットのツリーは、**最後の FULL を通した `release/v3.0.0` の HEAD と同じツリー ID** です(`git commit-tree <ツリー> -p 142b3877`)。
- 公開用の注釈つきタグ `v3.0.0` も、このコミットを指します。手元の `master` と `release/v3.0.0` の履歴はそのまま残します。
- `142b3877` から push すると fast-forward になります(`git merge-base --is-ancestor 142b3877 public/v3.0.0` で確かめます)。

## 2. 依存

### 2.1 npm

| 範囲 | コマンド | 結果 |
|---|---|---|
| 全部 | `npm run security:audit`(`npm audit --audit-level=high`) | **0 件** |
| 本番 | `npm audit --omit=dev --audit-level=high` | **0 件** |

- v2.1.0 では本番の zod の high 1 件を理由をつけて受け入れていました。**DEP-01 で zod 4.6.7 へ上げて解消**しました(`npm audit` 0)。

### 2.2 Rust

| 確認 | 結果 |
|---|---|
| `cargo audit --file src-tauri/Cargo.lock`(一番上、`.cargo/audit.toml` の ignore 込み) | 終了コード 0・**脆弱性 0**・警告 0 |
| ignore なし(`--deny warnings`) | 警告のみ(下の表) |

| 警告 | 内容 | 扱い |
|---|---|---|
| RUSTSEC-2026-0543 `chrono` 0.4.45(**新しく出た**) | 手入れ終了の知らせだけ(脆弱性ではない)。`Cargo.lock` にだけ入り(`serde_with` の任意の機能)、`cargo tree -i chrono --locked --target all` は **nothing to print** = どのビルドにも入らない | **ignore に入れた**(理由と見直す時は `.cargo/audit.toml`) |
| 上記以外の 10 件(unic-*・glib・proc-macro-error・zbus 系) | v2.1.0 と同じ。理由と見直す時は `.cargo/audit.toml` に書いてあります | 受け入れ済み |

## 3. 前の版のデータを引き継げること(B4)

比べたもの: v2.1.0(`142b3877`)と `release/v3.0.0`。AppData には触れていません(コードとテストだけで確かめています)。

### 3.1 保存の場所と版

| 保存するもの | 場所 | 版(v2.1.0 → v3.0.0) | 読み書きのコード |
|---|---|---|---|
| Vault | `loopvault/txt-jazz-v3/data.json`(旧 `loopvault/data.json` から初回に写す) | `fileVersion` 2 → **2**(alt を含む書き出しだけ 3 → 3) | `src/domain/schema.ts:373`・`src/storage/jazzVaultStorage.ts` |
| Chord Dojo の記録 | `chord-dojo-v1.json`(`theme-lessons-txt-jazz-v4/`) | `fileVersion` 4 → **4** | `src/domain/chordDojo/store.ts`・`src-tauri/src/chord_dojo_storage.rs` |
| 練習の記録(Bass) | `practice-v1.json` | `fileVersion` 2 → **2** | `src/features/bass-practice/infra/repository/practiceRepository.ts:23` |
| Bass の MIDI ライブラリ | `bass-midi-library-v1.json` | 1 → **1** | `src/features/bass-practice/midi/model.ts` |
| 耳で弾く | `ear-practice-v1.json` | 1 → **1** | `src/domain/earPractice/earRecordRepository.ts` |
| Original Practice / Jazz Progressions | `original-practice-v1.json`・`jazz-progressions-v1.json` | 1 → **1** | `src/domain/chordDojo/lapRecords.ts`・`practice_storage.rs` |
| **ガイド練習**(新) | `guided-course-v1.json`・`guided-course-advanced-v1.json` | (無し) → 1 | `src/domain/chordDojo/guidedCourse/store.ts`・`advanced/store.ts` |
| **ボイシングドリル**(新) | `voicing-drill-v1.json` | (無し) → 1 | `src/domain/chordDojo/voicingDrillRecords.ts`・`practice_storage.rs` |
| 画面の小さい設定(新しい鍵) | localStorage `loop-vault:global-bpm:v1`・`dojo-recent:v1`・`practice-opens:v1`・`voicing-loop-last:v1`・`guided-course-auto-advance:v1` | (無し) → 1 | 各画面 |

- **上がった版はありません**。既存のファイルの版は、全部同じです。新しく足した記録は、別のファイル(別の名前)で、無ければ初めて使うときに作られます。**既存のファイルを読み換えて書き直す処理は無く、読み方の変更も要りません**。
- Vault のスキーマ(`vaultFileSchema`)は、v2.1.0 と**中身が同じ**です(`git diff 142b3877 HEAD -- src/domain/schema.ts` は、型の書き方 1 行だけ。zod 4 へ上げたため)。Chord Dojo のスキーマ(`store.ts`)も、zod 4 の書き方(`z.record` に鍵の型を付ける)だけの差です。
- 練習の記録の読み込みは、**前より広く受け入れる**向きに 1 か所直しました(`practiceRepository.ts` の署名の形。接頭辞つきの保存を受け付ける。P23-63)。前の版が書いた形は、そのまま読めます。
- Rust 側は、ボイシングドリルの保存先(`voicing-drill-storage`)を足しただけで、既存の保存先は変えていません(`src-tauri/src/practice_storage.rs`)。
- Tauri の保存の権限は `$APPDATA/loopvault/**` のままで、新しいファイルもその中です(`src-tauri/capabilities/default.json`)。

### 3.2 v2.0.0 からの引き継ぎ(v2.1.0 で入った初回の写し)も、そのまま動くこと

- 初回に新しいフォルダへ写す処理(Vault: `loopvault/data.json` → `loopvault/txt-jazz-v3/`、Chord Dojo: `theme-lessons-txt-jazz-v4`)のコードは、v2.1.0 から**変わっていません**(`git diff 142b3877 HEAD` が `src/storage/`・`src/domain/chordDojo/storage.ts`・`src-tauri/src/chord_dojo_storage.rs` で空)。
- それを確かめるテストも変わらず通ります:`src/storage/jazzVaultStorage.test.ts`・`src/domain/chordDojo/jazzStorage.test.ts`・`themePersistence.test.ts`・`txtJazzWorkflow.test.ts` ほか(保存・読み込み・復元・移行の名前に当たるテスト 35 ファイル・348 本が通過)。Rust 側の読み込み・移行のテストは §4 の `cargo test --locked` に入っています。

## 4. 版の番号とテスト

- 3.0.0 にした所: `package.json`・`package-lock.json`(一番上と `packages[""]`)・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml`・`src-tauri/Cargo.lock`(`loop-vault`)。
- `src/buildInfo.test.ts`(新):設定の「アプリ版」の元(`loopVaultBuildInfo.version`)が 3.0.0 であること、5 つのファイルの版がそろっていること。
- 全部のテスト(`npm run test:full:all`)と `cargo test --locked`(`src-tauri`)は、最後の HEAD で 1 回ずつ回しました。結果は報告 `docs/reports/rel-02-release.md` に書きます(§5)。

## 5. この文書に書かないもの(理由)

公開のコミットのツリーは、FULL を通したツリーと同じにしてあります。FULL・配布物の結果をこの文書に書き足すと、ツリーが変わってしまうため、次に分けます。

| 記録 | 置き場所 |
|---|---|
| FULL・`cargo test` の結果、FULL を通した HEAD のコミット ID とツリー ID、公開用コミット・タグの ID | `docs/reports/rel-02-release.md` |
| 配布物の大きさ・SHA-256・作った時刻 | 報告と、リリースに上げる `SHA256SUMS` |

## 6. 公開してよいかの見直し(B6)

詳しい表は [release-inclusion-audit](release-inclusion-audit.md) §3。

- 開発機の絶対パス:**43 ファイル・96 か所**を `<作業フォルダ>` に置き換え、ツリー全体の検索は **0 件**。
- ユーザー名・メールアドレス・API キー・トークン:**0 件**(`npm run security:scan` も PASS)。
- 個人の MIDI・音声・動画:**0 件**(同梱の音は、ライセンスつきの Salamander Piano と FreePats Bass のみ)。
- ほかのサイトの名前・URL:**0 件**。
- 写真:報告の写真(`docs/reports/**/*.png`)は、Playwright の合成データの画面で、実機の機器名・個人の進行名は写っていません(確かめ方は inclusion-audit の §3)。
