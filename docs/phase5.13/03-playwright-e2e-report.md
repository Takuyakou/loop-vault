# Phase 5.13 Playwright E2E報告

## 実行経路

```bash
npm run playwright:install
npm run typecheck:e2e
npm run test:e2e
```

Playwright: 1.57.0

Browser: Chromium 143.0.7499.4

baseURL: `http://127.0.0.1:4174`

Codex Playwright kernelはasset初期化時に`os error 3`で失敗した。ブラウザ起動前の
kernel固有エラーであり、リポジトリローカルCLIは同じ端末で安定して通るため、CLIを正とした。

## Project

|Project|Viewport / 条件|ケース|
|---|---|---|
|chromium-desktop|1280x720|Capture、Vault、visual、axe|
|chromium-keyboard|1280x720|keyboard-only|
|chromium-narrow|1024x720|narrow + viewport matrix|
|chromium-reduced-motion|1280x720 / reduced|motion抑止|

## 検証フロー

- MIDI DnD → 3 Voice確認 → Analyze → candidate選択。
- 11 Voice + Drums表示。
- 複数MIDI追加。
- 壊れたMIDIのinline errorと再試行。
- Web file pickerのデスクトップ案内。
- コード修正 → 別候補 → 未保存確認 → cancel復帰。
- candidate保存 → Vault検索 → progression detail → Dojo。
- 空Vault、長いtitle/file name、filter/sort。
- skip link、dialog focus trap / Escape / focus return。
- preset、Solo、role、Analyze、candidateをkeyboard-only操作。
- 1024x720〜1920x1080の横overflow。

## Tauri固有境界

Web E2EではTauri file picker、OS MIDI input、window closeをmock/fallback状態として検証する。
Rust commandと実ウィンドウは`cargo test`、`npm run tauri build`、生成exeで別Gateとする。

## 失敗artifact

意図的に失敗させた確認で、次が`test-results/`へ生成されることを確認した。

- screenshot
- video
- trace
- error-context
- HTML report (`playwright-report/`)

これらは実行生成物のためGit管理しない。

## 最終結果

- Playwright: 27 / 27 PASS。
- keyboard-only: 4 / 4 PASS。
- responsive / viewport: 6 / 6 PASS。
- reduced motion: 1 / 1 PASS。
- accessibility: 3 / 3 PASS。
- visual evidence: 4 / 4 PASS（16状態撮影、5画面pixel diff）。
