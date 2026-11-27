# Phase 5.13 Web Interface Guidelines 最終監査

監査日: 2026-07-30

基準:
- `web-design-guidelines` 1.0.0
- Vercel Web Interface Guidelines `main/command.md`（2026-07-30取得）
- Playwright Chromium / axe-coreによる実画面検証

## 結果

|分類|結果|根拠|
|---|---|---|
|P0|0件|主要フロー、保存、未保存離脱、dialog、keyboard、axeを実画面で確認|
|P1|修正済み 6件、一部修正 1件|共有状態、Capture階層、Toast、focus、overflow、仮想化を修正|
|P2|継続 3件|bundle分割、専門編集コントロールのhit area、light theme|

## 修正済み

- `html lang`を表示言語と同期し、skip linkから`#main-content`へ実focusを移動する。
- Dialogのfocus trap、Escape、focus return、overscroll抑止を実ブラウザで確認した。
- Captureの空・読込・解析・最終処理・結果・回復可能エラーを別状態として表示した。
- 壊れたMIDIにはinline errorと「別のMIDIを選ぶ」回復操作を残した。
- コード編集後の候補切替は確認Dialogを出し、キャンセルで編集内容を保持する。
- 選択中コードは`aria-pressed`、コード列は`role=group`で表し、nested interactive/ARIA違反を解消した。
- Vaultは50件超で仮想化し、1,000件fixtureでも全カードをDOMへ載せない。
- 1024x720から1920x1080まで主要画面のbody横overflowがない。
- reduced motion時にanimation/transition durationを実質0へする。
- selected pre-analysis panelの文字コントラストを4.5:1以上へ修正した。

## 一部修正

- 高密度の音楽編集面には40px未満の補助操作が一部残る。主要操作は40px以上に揃え、
  専門編集UIは情報密度と隣接誤操作をPlaywrightで個別確認した。

## 今回対象外

- JavaScript bundleのroute-level code splitting。
- light theme。
- MIDI Export / DAW dragの新機能化。
- Analyzer、Voice Role、候補順位、Vault schema、Tauri commandの変更。

## 自動監査

- axe対象: Home、Capture empty、11 Voice pre-analysis、analysis result、Vault、
  progression detail、Settings dialog。
- WCAG tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`。
- critical / serious violation: 0件。
- keyboard-only: navigation、Settings、dialog、preset、Solo、role、Analyze、
  candidate、save、Vault search、detail、Dojoを通過。
