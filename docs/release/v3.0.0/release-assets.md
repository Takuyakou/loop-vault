# v3.0.0 の配布物

Status: **ビルド済み・公開の前**(公開は利用者が行います)。

## 配布ファイル

| ファイル | 形式 | 使い方 |
|---|---|---|
| `Loop.Vault_3.0.0_x64-setup.exe` | NSIS のインストーラー | 通常はこちら |
| `Loop.Vault_3.0.0_x64_en-US.msi` | MSI(Windows Installer) | Windows Installer 形式を使いたい場合 |
| `loop-vault.exe` | 単体の実行ファイル | インストールせず起動したい場合 |
| `SHA256SUMS` | UTF-8 のチェックサム | 上の 3 つの SHA-256 |

- 名前の「`Loop.Vault_…`」の `.` は、生成されたインストーラーの名前の空白(`Loop Vault_…`)を、GitHub に上げるときの名前にそろえたものです(バイトは変わりません)。README の「ダウンロードするファイル」の表と同じ名前です。
- **大きさ・SHA-256・作った時刻**は、この文書に書くとツリーが変わるため、`docs/reports/rel-02-release.md` と、リリースに上げる `SHA256SUMS` に書きます(`docs/release/v3.0.0/release-validation.md` §5)。
- 配布物はコミットしません(Git 管理外)。

## ビルドの由来

- ビルドしたブランチ: `release/v3.0.0`(公開用は `public/v3.0.0` の 1 コミット。同じツリー)。最後の FULL を通した HEAD でビルドしました
- `npx tauri build`: production のフロントエンドの再ビルド、Windows x64 の最適化ビルド、NSIS と MSI
- 版:`package.json`・`package-lock.json`・`tauri.conf.json`・`Cargo.toml`・`Cargo.lock`・アプリの「アプリ版」は **3.0.0**
- 署名なしの慣習を維持しています(Authenticode は `NotSigned`)
- **ソースのパスを残さない**:`CARGO_ENCODED_RUSTFLAGS` の `--remap-path-prefix` で、作業フォルダ・`%USERPROFILE%\.cargo`・`%USERPROFILE%` を置き換え、MSVC のリンカーに `/PDBALTPATH:%_PDB%` を渡しました。3 つの配布物に、作業フォルダのパス・`C:\Users\<名前>`・ユーザー名の文字列が無いことを、ASCII と UTF-16 の両方で検索して確かめました(結果は `docs/reports/rel-02-release.md`)。PDB は配布しません

## 起動の確認

- 配布物は**起動していません**(利用者のデータ(AppData)に触れないため)。
- 利用者は、先に Vault のバックアップ(設定 → データ)を取ってから、試してください。
- 画面の確認は、本番のフロントエンドを使った FULL のテスト(ホーム・取り込む・Vault・Voicing Loop・Chord Dojo・Bass Practice)で行っています。

## 公開(未実施)

push・タグ・GitHub のリリース・アップロードは、利用者が行います。手順は `docs/reports/rel-02-release.md` の最後に書きました。この段階では何も公開していません。
