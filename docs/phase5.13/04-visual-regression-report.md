# Phase 5.13 Visual Regression報告

## 固定条件

- Chromium desktop 1280x720
- locale `ja-JP`
- timezone `Asia/Tokyo`
- dark color scheme
- Web font load完了後に撮影
- animation disabled
- deterministic synthetic MIDI fixture
- `maxDiffPixelRatio: 0.002`

## Pixel diff対象

1. Capture empty
2. Analysis result
3. Correction editor
4. Vault populated
5. Progression detail

基準画像は`e2e/visual.spec.ts-snapshots/`、監査用after画像は
`artifacts/phase5.13/after/`に保存した。基準作成後の通常実行で5画面すべてPASS。

## 監査用スクリーンショット

- capture-empty
- capture-simple-midi
- capture-all-instruments
- capture-multi-midi
- analyzing
- analysis-result
- correction-editor
- vault-empty
- vault-populated
- progression-detail
- live-midi
- chord-dojo
- settings
- dialog
- toast
- long-content

解析中表示は同期Analyzer終了直後の「候補を画面へ準備中」状態を300ms保持し、
結果画面を操作不能にせず状態変化を認識できるようにした。

## 目視結果

- 1024px幅でもglobal actionと主要navを見失わない。
- 11 Voiceはpiano rollとpart listを並列表示し、ページ全体の不必要な横scrollを作らない。
- 長い候補列は全体を縦に確認でき、sticky draft barが保存対象を示す。
- Dialog backdrop、Settings内部scroll、Live MIDI未接続状態を識別できる。

## 更新規則

`npm run test:e2e:update`は意図したUI差分をafter画像と比較した時だけ実行する。
threshold拡大、広範囲mask、失敗画像の基準化は禁止する。
