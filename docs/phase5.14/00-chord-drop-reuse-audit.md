# Phase 5.14 Chord Drip Reuse Audit

## 監査対象

| File | Git blob | Last relevant commit |
|---|---|---|
| `src/midi/export.ts` | `773809d215c452fb9a3171341736a1e2acffda57` | `9a6a7dfc82f248f78a7d6056a91b4b12bff34913` |
| `src/midi/export.test.ts` | `71edcf58d149031e44223590a76fee201678d8d8` | `9a6a7dfc82f248f78a7d6056a91b4b12bff34913` |
| `src/midi/dragOut.ts` | `1ddbaa281364d4f5e2d99b65f696c8616d23a300` | `50795f732869c57a4fffadb35657706d34c4cfc5` |
| `src/midi/dragOut.test.ts` | `d58a9dc9fc795c8713651c08c9c4ca68ae098249` | `50795f732869c57a4fffadb35657706d34c4cfc5` |
| `src-tauri/src/lib.rs` | `f263e71e391ec05a8d93dfb59250d724ac83bf70` | `7c90159099961122e80dd4514e4a7213f8ee12df` |
| `src-tauri/Cargo.toml` | `5b7fbdcfa3dc861c2eec1ab7d4c11ff8735f9e26` | `0ba8bc27229e7f619f77f6e3e41aca54fd530057` |

## MIDI生成

Chord Dripは`@tonejs/midi`を使い、`RenderedClip`の絶対tickをそのままMIDIへ出力する。

- PPQ: 480
- tempo: tick 0に1件
- meter: 4/4固定
- track: Left Hand / Right Handの2track、またはPiano 1track
- velocity: `RenderedClip`で決定済みの0〜127を0〜1へ変換
- note timing: `startTick` / `durationTick`をそのまま使用
- deterministic: 同一`RenderedClip`から同一bytes

Loop Vaultでは保存拍子、N.C.、コードmarker、イベント単位のvoicing sourceが必要なため、Chord Dripの`RenderedClip` adapterは直接コピーしない。PPQ 480と「domainでtickを確定しserializerは確定済みeventだけを書く」分離を採用する。

## Native drag

Chord DripのWindows実装はOLE `DoDragDrop`と`CF_HDROP`（format 15）を使い、実在するローカルfile pathをDAWへ渡す。

再利用するもの:

- `IDataObject` / `IDropSource`
- `DROPFILES`を格納する`HGLOBAL`
- `DROPEFFECT_COPY`
- Escapeでcancel、左ボタンreleaseでdropするlifecycle
- Tauri main threadからnative dragを開始するbridge
- frontendは準備済みtokenだけをnative commandへ渡す契約

## そのまま再利用しないもの

Chord Dripのtemp lifecycleにはPhase 5.14要件との差がある。

- `fs::write`で直接書き、atomic renameではない
- 同名fileを上書きし、content-addressed cacheではない
- `clip_hash`を保存するが再利用に使わない
- DTOのexpiryは10分だが期限cleanupを実行しない
- startup cleanupが専用directory内をmtime確認なしで全削除する
- explicit cleanupはdrag直後のfile保持契約と衝突し得る
- filename長、reserved device name、末尾dot/spaceの防御が不足

Loop Vaultではnative dragのCOM実装を移植し、temp/cache/saveは新しい安全なapplication serviceとRust commandで実装する。

## Windows / FL Studio実績

Chord Dripの`docs/CHECKLIST.md`には、書き出しMIDIがFL Studioへ正しいtempo、grid alignment、loop lengthでimportできた実績が記録されている。Native drag bridgeは2026-07-09の一連の修正でmain-thread実行とformat enumerationが追加されている。

Loop Vault側でnative bridgeを移植・統合するため、指示書の条件上、最終自動Gate後にFL Studio手動smokeを1回行う対象となる。自動検証では実在path、bytes一致、cancel、反復drag、Tauri production buildを先に確認する。

## 実行時依存

移植後のLoop VaultはChord Drip repository、型、store、schemaへ実行時依存しない。

