# Phase 5.12 Piano Roll Preset / Scroll Follow-up

実施日: 2026-07-30

## 変更内容

### 解析プリセットとの同期

ピアノロールの既定表示を`解析対象`にした
(`src/components/pre-analysis/PreAnalysisPianoRoll.tsx`,
`src/components/pre-analysis/PreAnalysisWorkspace.tsx`)。

- preset変更で`voice.included`が変わると、Canvas上のnoteも即時再抽出する。
- `伴奏のみ`ならharmony、`和声＋ベース`ならharmony / bass、
  `全パート`ならdrumsを除く全pitched Voiceを表示する。
- manual role / include変更にも同じ経路で追従する。
- `全Voice`へ切り替えると、解析除外Voiceを含む読込全体を再確認できる。
- source / Voiceの表示設定は従来どおり独立して適用する。
- Muteは試聴状態なので表示filterには使用しない。

### 時間スクロール

Canvas直下に`PreAnalysisTimeScrollbar`を追加した
(`src/components/pre-analysis/PreAnalysisTimeScrollbar.tsx`)。

- thumb幅は現在表示している時間範囲 / MIDI全長を表す。
- thumb dragで表示区間を連続移動する。
- track clickでその位置へ移動する。
- Arrow Left / Right、Shift + Arrow、Page Up / Down、Home / Endに対応する。
- `role="scrollbar"`、現在小節の`aria-valuetext`を持つ。
- zoom変更時は表示可能な範囲へ`viewportStartBeat`をclampする。
- Canvasとscrollbarは同じ`viewportStartBeat`を使用する。

## 実画面結果

生成した64小節 / 4 Voice / SMF Format 0 fixtureをChromeでdropした。

- zoom 4x
- preset `伴奏のみ`
- note表示数: 320件からharmony 192件へ変更
- scrollbar drag後: beat 190.58、表示は48〜64小節
- Canvas ruler: 49〜64小節
- desktop 1280×900: overlapなし
- mobile 390×844: `scrollWidth = clientWidth = 390`

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `artifacts/phase5.12.1/preset-filtered-and-scrolled.png` | 132,078 | `ba1fa4fb55ace6e9be5d8e1471d17c71bada1445735e1fb81d549ab7b2e74b58` |
| `artifacts/phase5.12.1/preset-scroll-mobile.png` | 108,738 | `77259c26d10b1438b05cae8fd2105f8a7e852fac94476f04759b59114bb0c9ac` |

個人MIDIは使用していない。

## Verification

| Command / Gate | Result |
|---|---|
| 関連test | 3 files / 17 tests PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | 235 files / 1,821 tests PASS |
| `cargo test` | 24 tests PASS |
| `npm run build` | PASS、3,079 modules |
| `npm run tauri build` | PASS、EXE / MSI / NSIS |
| desktop / mobile visual | PASS |

## Production Artifacts

Source commit: `b856406`

| Artifact | Size | SHA-256 |
|---|---:|---|
| `src-tauri/target/release/loop-vault.exe` | 14.107 MiB | `33ee729d44d295d97c1048da0ab31f3e09ceecf9c2ec90b233dfba082122c5ad` |
| `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi` | 4.883 MiB | `413ec18bb4f57ed767088f679106b8f134ae56e15a5cc2a5ee65b9ca0b45377b` |
| `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe` | 3.437 MiB | `39bfd0c5ac2a936f48258ca4f1bb5da6eec6d0f19d7e3a0d647ec57f01738769` |

## Unchanged

- MIDI解析、Voice role推定、候補生成、ranking
- Analyzer mode
- Vault schema / `fileVersion`
- Live MIDI / Chord Dojo
- PlaybackController
- Phase 5.2 / Phase 6
