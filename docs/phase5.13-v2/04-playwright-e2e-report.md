# Phase 5.13 v2 Playwright E2E Report

## 実行

```text
npx playwright test
```

結果: **28 passed / 28**, 32.4秒。

## Project / Viewport

- `chromium-desktop`: 1280x720、主要フロー、Axe、視覚回帰
- `chromium-keyboard`: キーボード専用操作
- `chromium-narrow`: 1024x720、1280x720、1366x768、1440x900、1920x1080
- `chromium-reduced-motion`: motion低減

## 確認したフロー

- MIDI drag and drop、11 Voice、複数MIDI、破損MIDI、解析
- 未保存コード編集を残した候補切替とキャンセル復帰
- 解析結果の保存、Vault検索・フィルター・並び替え
- Detail選択・編集・試聴・保存・Practiceへの遷移
- Sidebar、Settings、Dialog、skip linkのキーボード操作
- 長いタイトル、小さい画面、reduced motion
- Home / Capture / Vault / Detail / Practice / Live MIDI / History / Settings の視覚証跡

## Accessibility

Home、Capture空状態、解析前、解析結果、Vault、Detail、Settings、Dialogで Axe を実行した。`critical` と `serious` は **0件**。

## 制約

- ブラウザE2Eは実MIDIデバイスを開けないため、Live MIDIの実機接続は対象外。Web非対応状態はPlaywright、接続・採集ロジックはVitest / Rustで確認した。
- FL StudioへのOS間ドラッグは自動化していない。既存機能は変更していない。
