# v2.1.0 の配布物

Status: BUILT / NOT PUBLISHED(R-04 で利用者が決めます)。

## ビルドの由来

- ビルドしたブランチ: `release/v2.1.0`(公開用は `public/v2.1.0` の 1 コミット。同じツリー)
- `npm run tauri -- build`: PASS(production のフロントエンド再ビルド、Windows x64 の最適化ビルド、NSIS と MSI)
- 生成されたインストーラーの名前に空白が入るため、公開用の写しはドットに置き換えています(バイトは変わりません)
- 版:`package.json`・`package-lock.json`・`tauri.conf.json`・`Cargo.toml`・`Cargo.lock`・アプリの「このアプリについて」は **2.1.0**。EXE と NSIS の FileVersion/ProductVersion は 2.1.0
- 署名なしの慣習を維持。EXE と NSIS の Authenticode は `NotSigned`
- **ソースのパスを残さない**:`CARGO_ENCODED_RUSTFLAGS` で `--remap-path-prefix` を、作業フォルダ・`%USERPROFILE%\.cargo`・`%USERPROFILE%` の3つに指定し、MSVC のリンカーに `/PDBALTPATH:%_PDB%` を渡しました
- 個人パスの確認:3 つの配布物のどれにも、作業フォルダのパス(`D:\<dev-root>` / `D:/<dev-root>`)・`C:\Users\<name>`・ユーザー名の文字列は **0 件**(ASCII と UTF-16 の両方で検索)。PDB は配布しません
  - 最初のビルドでは、依存クレートの panic 位置として `C:\Users\<user>\.cargo\<registry>` が EXE に残っていたため、上記の remap を足して作り直しました

## 配布ファイル

ローカルの写しと `SHA256SUMS` は Git 管理外の `p89-generated/release-v2.1.0/` に置いています。実行ファイル・インストーラー・チェックサムはコミットしません。

| ファイル | バイト | 形式 | SHA-256 |
|---|---:|---|---|
| `loop-vault.exe` | 24,943,104 | PE x64 | `11e9cecf7a356bc902f1d531382c3f086168ca4223f91b6ed5a5012b86905838` |
| `Loop.Vault_2.1.0_x64-setup.exe` | 13,454,781 | MZ/NSIS | `8b4e4d6883b3df6ad943d41e89df4c3afde3ed81b78ecd67503b45720fa4cc53` |
| `Loop.Vault_2.1.0_x64_en-US.msi` | 14,983,168 | MSI/CFB | `14df4db9cdfd0350587a66536e6f73a3ccb0cf548de5d9040c444e42a32196da` |
| `SHA256SUMS` | 275 | UTF-8 のチェックサム | `98db8f9a82d8cc62e627cf5fbdec87100728713dfb2089f9774f70dd98df1eac` |

## 起動の確認

- 本番ビルド(フロントエンド)を `vite preview` で起動し、ホーム・取り込む・Vault・Voicing Loop・Chord Dojo・Bass Practice の各画面が表示され、JS のエラーが出ないことを確認します(§5 の FULL と同じ回で記録)
- 実際の Vault・実機の MIDI・インストーラーでの入れ替えは行っていません
- 実機で試すときは、先に Vault のバックアップ(設定 → データ)を取ってください

## 公開(未実施)

push・タグ・GitHub Release・アップロードは R-04 で利用者が決めます。この段階では何も公開していません。
