# v3.2.0 の配布ファイル

FULL を通した `release/v3.2.0` の HEAD から `npx tauri build` で作り、GitHub に上げる名前で `D:\dev\lv-handoff\release\v3.2.0\` に置きます。配布物は起動しません。大きさ・SHA-256・作った時刻は、v3.1.0 と同じく公開前確認(P-1)と公開後の作業報告に記録し、このファイルには測った値を持ち込みません(検証したツリーと配布したツリーを同じにするため)。

| GitHub に上げる名前 | 中身 |
|---|---|
| `Loop.Vault_3.2.0_x64-setup.exe` | NSIS のインストーラー(おすすめ) |
| `Loop.Vault_3.2.0_x64_en-US.msi` | MSI 形式のインストーラー |
| `loop-vault.exe` | インストールせずに使える版 |
| `SHA256SUMS` | 上の 3 つの SHA-256 |

- 署名はしません(今までと同じ)。PDB は配布しません。
- ソースのパスを残さないため、`CARGO_ENCODED_RUSTFLAGS` の `--remap-path-prefix` で作業フォルダ・`%USERPROFILE%\.cargo`・`%USERPROFILE%` を置き換え、MSVC のリンカーに `/PDBALTPATH:%_PDB%` を渡します(B9 で確かめる)。
