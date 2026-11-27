# Phase 5.13-06: UI再監査

監査日: 2026-07-30  
基準: Vercel Web Interface Guidelines `main/command.md`（2026-07-30取得）  
補助基準: ui-ux-pro-max（Accessibility / Keyboard / Focus / Error）

## 結果

- P0: 0件
- P1: 6件を修正
- P2: 3件を継続課題として記録
- P3: 今回は対象外

## 修正済み

### `src/App.tsx`

- `src/App.tsx:148` - 設定言語を `document.documentElement.lang` へ同期。
- `src/App.tsx:400` - skip linkを維持。
- `src/App.tsx:411` - skip先へプログラム的にフォーカスした場合も輪郭を表示。

### `src/views/VaultView.tsx`

- `src/views/VaultView.tsx:39` - 50件超で仮想化し、大量データ時のDOM量を抑制。
- `src/views/VaultView.tsx:480` - クリック動作を非セマンティックな行`div`から除去。
- `src/views/VaultView.tsx:489` - 選択操作をネイティブ`button`へ移動。

### `src/components/Modal.tsx`

- `src/components/Modal.tsx:147` - backdropのoverscrollを閉じ込め。
- `src/components/Modal.tsx:163` - dialog panelのoverscrollを閉じ込め。

### フォーム

- `src/components/SaveProgressionPopover.tsx:250` - 保存フォームへ`name`と`autocomplete`を追加。
- `src/components/progression-advisor/LlmSettingsSection.tsx:122` - Local/OpenAI設定へ`name`、`autocomplete`、`spellcheck`、数値`inputmode`を追加。
- `src/components/ProgressionTagsEditor.tsx:57` - タグ入力へアクセシブル名、`name`、`autocomplete`を追加。

### 表記と操作領域

- `src/components/pre-analysis/PreAnalysisWorkspace.tsx:953` - loading表記を`…`へ統一。
- `src/components/voicing/VoicingPanel.tsx:207` - pending表記を`…`へ統一。
- `src/components/ProgressionTagsEditor.tsx` - 追加・削除操作のクリック領域を40pxへ拡張。

## 既に適合

- `src/styles.css:8` - `color-scheme: dark`。
- `src/styles.css:24` - 全ネイティブ操作に共通`focus-visible`。
- `src/styles.css:172` - `prefers-reduced-motion`。
- `index.html:5` - zoomを禁止しないviewport設定。
- `index.html:6` -背景と一致する`theme-color`。
- `src/components/Modal.tsx` - focus trap、Escape、focus restore、modal stack。
- `src/components/Toast.tsx` - success/errorのlive regionと閉じる操作。
- `src/views/VaultView.tsx` - 日付は`Intl.DateTimeFormat`を使用。
- `src/App.tsx` / `src/views/ProgressionDetailView.tsx` - 未保存変更の離脱防止。

## 一部修正

- 40px操作領域: 主要導線と高頻度操作は修正済み。MIDI境界編集など高密度ツール内には36px以下の補助操作が残る。
- 画面状態のURL同期: Tauriの単一ウィンドウ内状態であり、ブラウザ履歴・外部deep linkは未実装。既存ナビゲーション方式を維持。
- loading: 主要な解析・保存・接続は状態表示あり。300ms未満で終わる同期処理にはskeletonを追加していない。

## 未修正・今回対象外

- 初期JavaScript bundleが約1.3MB。画面単位code splitは構造変更が大きいためP2として継続。
- light themeは未提供。Loop Vaultの既存dark desktop方針を維持。
- すべての専門編集コントロールを44pxへ拡張すると情報密度と操作可能範囲へ影響するため、Playwright実測後の個別判断とする。

## 検証

- TypeScript: PASS
- 対象Vitest: 35件 PASS
- lint: PASS
- Playwright / axe / viewport matrix: P5.13-07で実施
