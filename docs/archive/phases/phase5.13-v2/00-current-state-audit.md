# Phase 5.13 v2 Current State Audit

## Scope

Phase 5.13 merge commit `e9ae868560e8389f432ca5994ef05b88d4ed3fbd` を基準に、
App Shell、Home、Chord Capture、Vault、Progression Detail、Practice、
Live MIDI、Settings、共通状態表示、keyboard、responsive、Playwrightを監査した。

Phase 5.13で完了した次の機能はv2でも維持する。

- 未保存離脱保護
- route変更後のmain focus移動とskip link
- Dialogのfocus trap / focus return
- visible form label
- processing中の二重実行防止
- recoverable errorとnext action
- reduced motion
- Vaultの長文表示と50件超のvirtualized list
- Toastのlive region

## Current Architecture

- `src/App.tsx`: view state、主要画面のcomposition、global dialog / toast
- `src/components/AppShell.tsx`: 上部navigationとglobal preview / volume / save status
- `src/components/ui/primitives.tsx`: Phase 5.13で追加した共有UI primitive
- `src/styles/tokens.css`: semantic token、focus、motion、z-index
- `src/views/*`: 各画面
- `src/store/*`: Zustand、autosave、close guard
- `src/domain/*`: UI framework非依存の解析・保存契約

## Findings

### P0

新規のP0は確認されなかった。Phase 5.13で導入した未保存保護、保存失敗表示、
Dialog focus、処理中lockをv2で壊さないことがGateになる。

### P1

1. **現在地とglobal toolsが同じ上部列に混在する**
   - 根拠: `src/components/AppShell.tsx`
   - 影響: 横幅が狭いとnavigationとglobal actionが二段化し、現在地が弱くなる。
   - 対応: English Sidebarへrouteを分離し、Top Barはglobal toolだけにする。

2. **Chord Capture Emptyで主操作までの視覚距離が長い**
   - 根拠: `src/views/CaptureView.tsx`
   - 影響: 3 step cardがdrop zoneより先に読まれ、MIDI選択が主役に見えにくい。
   - 対応: drop zoneをprimary surfaceにし、step説明をcompact化する。

3. **Progression Detailでコードカードよりmetadata/actionが先に並ぶ**
   - 根拠: `src/views/ProgressionDetailView.tsx`
   - 影響: 最頻操作であるコード選択・試聴・修正まで視線移動が増える。
   - 対応: App Top Bar直下をコードカードstageにする。

4. **Live MIDIとSettingsがtop navigationとは異なる画面遷移になる**
   - 根拠: `src/App.tsx`
   - 影響: Settingsはmodal、Live MIDIはfull-window modeとなり、主要routeとの関係が不明瞭。
   - 対応: Sidebarから同じnavigation契約で到達可能にする。既存機能自体は再実装しない。

5. **selected / playing / edited / warningの視覚契約が画面ごとに異なる**
   - 根拠: `src/views/ProgressionDetailView.tsx`,
     `src/views/CaptureView.tsx`, `src/views/PracticeView.tsx`
   - 影響: 同じティールが異なる意味に見える。
   - 対応: semantic state tokenとtext/icon labelを共通化する。

### P2

- HomeのToday cardでコード列が文字列中心。
- Capture loadedのmetadata cardが縦領域を消費。
- Vaultの検索、sort、length、facetが複数段へ分散。
- Practiceの設定群と現在課題の視覚的強さが近い。
- Settingsは長い単一modalでcategoryの現在地が弱い。
- 1920pxでcontentが`max-w-7xl`へ固まり、音楽ツールとして横幅を活かし切れない。

## Good Existing Decisions

- ティールのbrand、暗いsurface、情報密度は音楽制作ツールに適している。
- Lucide iconへ統一されている。
- Preview soundとmaster volumeは全画面共通で再利用できる。
- Captureのpre-analysisと100,000 note Canvasを維持できる。
- Vaultのvirtualizationは1,000件fixtureに対応している。
- Progression editor、Practice、Live MIDIのdomain logicはUIから分離されている。

## v2 Boundary

変更する:

- navigation hierarchy
- semantic tokens / shared visual primitives
- screen composition
- responsive layout
- visible state labels
- keyboard / focus / accessible name

変更しない:

- MIDI Analyzer
- candidate ranking
- Voice role
- Vault schema / payload
- autosave / backup
- Practice judgement
- Live MIDI detector
- Rust command
- MIDI Export / DAW Drag

