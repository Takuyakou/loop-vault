# Phase 5.13 v2 Visual Regression Report

## Evidence

- Before: `artifacts/phase5.13-v2/before/` 13画像
- After: `artifacts/phase5.13-v2/after/` 20画像
- 厳密なPlaywright画像比較: 9基準画像

Afterには次の必須状態を含む。

```text
home
capture-empty
capture-source-selection
capture-analysis-results
vault
progression-detail-default
progression-detail-selected
progression-detail-editing
practice
live-midi
history
settings
```

追加証跡として analyzing、multi-midi、all-instruments、correction-editor、dialog、toast、vault-empty、long-content を保存した。

## Stability Controls

- `document.fonts.ready` 待機
- animation無効化
- 解析進捗と候補表示の安定待ち
- 通常画面では一時Toast消滅を待機
- 固定生成MIDI fixtureを使用
- timestampを主要比較領域から排除

## Visual Findings

- Sidebarにより画面位置とグローバル操作を分離できた。
- Detailはルート遷移後のscroll位置をリセットし、コードカードが最初に見える。
- selected / playing / editingは別状態として読める。
- Historyは空状態ではなく保存済みfixture 2件でも崩れない。
- 1024pxで主要操作が消えず、1920pxで情報が中央に狭く固まりすぎない。

## Result

最終スナップショット更新後、視覚テスト **5/5 PASS**。旧レイアウト用の未使用スナップショット3点は削除した。
