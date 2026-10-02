# v2.0.0 Assets

Status: PUBLISHED / PUBLIC RE-DOWNLOAD SIZE AND SHA-256 PASS.

## Build provenance

- Tested/build code HEAD: `d70623aef30c19b7fa7c92ba70dc8ab6284615b4`.
- `npm run tauri build`: PASS; production frontend rebuild, optimized Windows x64 executable, NSIS and MSI bundles. Build, target and temporary files remain on D.
- Generated installer filenames contain spaces; upload copies use dots as in the existing public release convention. Renaming does not alter their bytes.
- Existing package/Tauri/Cargo and About versions: 2.0.0. EXE and NSIS FileVersion/ProductVersion and read-only MSI ProductVersion are 2.0.0.
- Existing unsigned distribution convention retained; EXE/NSIS Authenticode status is `NotSigned`. No signing credential or installer deployment was introduced.
- Rust source paths use `--remap-path-prefix`; MSVC linker uses `/PDBALTPATH:%_PDB%` so the binary contains only a PDB filename. See [Microsoft linker documentation](https://learn.microsoft.com/en-us/cpp/build/reference/pdbaltpath-use-alternate-pdb-path?view=msvc-170).
- Privacy scans: personal ASCII/UTF-16 paths 0; actual workspace path 0; readable absolute build-drive paths 0 for each distribution binary. A loose three-byte drive pattern encountered random binary bytes; printable path syntax and the exact known workspace path distinguish that false positive. No binary was edited to hide a finding. PDB is not distributed.

## Distribution files

| Filename | Bytes | Basic validity | SHA-256 |
| --- | ---: | --- | --- |
| `loop-vault.exe` | 24,728,064 | PE x64 | `a28bd30156bd4d5b3d0c85ad96e5a0de1de03f63885f80af740e11a7c16a6325` |
| `Loop.Vault_2.0.0_x64-setup.exe` | 13,282,030 | MZ/NSIS | `7addf3a6119b33da43e3e7928d05013c74d765626efb8ab1cd1c9607bf397d1b` |
| `Loop.Vault_2.0.0_x64_en-US.msi` | 14,794,752 | MSI/CFB | `39c9efe871585d4f8cb411d7a85f94e5367f53020312a1f39a68a3027a7f4cb0` |
| `SHA256SUMS` | 275 | UTF-8 checksum manifest | `3ba0ada32c8bf01f67765bf339469a8555d93c19bcca801beffa22064248f9e9` |

Local upload copies and SHA256SUMS are under the ignored release assets directory. No executable, installer, checksum-generated file or private artifact is staged in Git; the values above are public release metadata.

## Public verification

- Upload: PASS; all four assets uploaded before public publication.
- GitHub Release: [Loop Vault v2.0.0](https://github.com/Takuyakou/loop-vault/releases/tag/v2.0.0), published 2026-10-02T16:29:23Z (2026-10-03 Asia/Tokyo); public, non-draft, non-prerelease.
- Public re-download / size / SHA-256 comparison: PASS 4/4. Each downloaded file equals the local build size and SHA-256; GitHub digest also matches. Downloaded SHA256SUMS equals the original manifest byte-for-byte.
- Release page and direct EXE link: unauthenticated HTTP 200.
- Annotated `v2.0.0` tag target: `9b64095fc45d43dfdf2ea277c0ff403a380fa48b`. The later master closeout commit records publication only and does not retarget the tag.
- Raw EXE launch against the real native Vault and installer install/upgrade were not performed. Binary metadata/architecture and production browser startup were checked without reading or changing real Vault data.

### Public download links

- [loop-vault.exe](https://github.com/Takuyakou/loop-vault/releases/download/v2.0.0/loop-vault.exe) — size/SHA-256 PASS.
- [Loop.Vault_2.0.0_x64-setup.exe](https://github.com/Takuyakou/loop-vault/releases/download/v2.0.0/Loop.Vault_2.0.0_x64-setup.exe) — size/SHA-256 PASS.
- [Loop.Vault_2.0.0_x64_en-US.msi](https://github.com/Takuyakou/loop-vault/releases/download/v2.0.0/Loop.Vault_2.0.0_x64_en-US.msi) — size/SHA-256 PASS.
- [SHA256SUMS](https://github.com/Takuyakou/loop-vault/releases/download/v2.0.0/SHA256SUMS) — size/SHA-256 PASS.
