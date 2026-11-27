# Phase 5.13 v2 Guideline Re-Audit

対象: `web-design-guidelines` と Phase 5.13 v2 指示書。コード監査、Playwright、Axe、スクリーンショットを組み合わせて再確認した。

## 修正済み

| 項目 | 結果 | 根拠 |
| --- | --- | --- |
| 主ナビゲーションの重複 | 左サイドバーへ統合 | `src/components/AppShell.tsx` |
| 現在ルートの認識 | 視覚表示と `aria-current` を併用 | `e2e/keyboard.spec.ts` |
| ルート間のスクロール漏れ | 遷移時にメインを先頭へ戻す | `src/App.tsx` |
| 主操作の階層 | Home、Capture、Detail、Practice、Live MIDI で主面を先頭化 | 各 view |
| 非同期状態 | Loading / disabled / error / next action を明示 | `src/components/ui/primitives.tsx` |
| キーボード操作 | skip link、Sidebar、Capture、保存、Detail、Practice を通過 | `e2e/keyboard.spec.ts` |
| Dialog | focus trap、Escape、focus return を通過 | `e2e/keyboard.spec.ts` |
| Focus 表示 | `:focus-visible` を共通化 | `src/styles/tokens.css` |
| 色だけの状態表現 | ラベル、アイコン、属性を併用 | App Shell / Detail / Live MIDI |
| コントラスト | muted text を `#7f90aa` へ補正 | `src/styles/tokens.css` |
| reduced motion | 全遷移・アニメーションの実質停止を確認 | `e2e/reduced-motion.spec.ts` |
| 長文耐性 | 長いタイトルと進行で横 overflow なし | `e2e/vault-flow.spec.ts`, `e2e/visual.spec.ts` |
| アイコン規格 | Lucide 16px / 20px、accessible name | `src/components/iconSystem.test.ts` |

## 一部修正

| 項目 | 現状 | 残り |
| --- | --- | --- |
| 200% zoom | 1024〜1920pxの幅マトリクスと長文で主要操作を確認 | OS倍率込みの実機目視は未自動化 |
| Live MIDI E2E | Web環境の非対応状態、既存store/serviceテストを確認 | 実MIDIデバイスの自動接続・採集・保存はCIで再現不可 |
| Settings | カテゴリナビとフォーム階層を実装 | 独立ルートではなく既存モーダルを維持 |
| History | 永続データ由来の履歴を実装 | 専用イベントログがないため編集差分履歴は表示しない |

## 今回対象外

- MIDI解析・コード検出・候補順位の変更
- MIDI Export / DAW Drag の新規実装
- Vault schema / `fileVersion` の変更
- 新UIライブラリ、全面CSS置換、React全面書き換え
- Phase 5.14 / 5.15 / 5.2

## 優先度別結果

- P0: 新規未解決なし。保存・未保存保護・致命エラー表示の既存機能を維持。
- P1: ナビゲーション、状態認識、主操作階層、キーボード、コントラストを修正。
- P2: 情報密度、長文、小窓、Settings / History の整理を改善。
- P3: 強い影や過剰な装飾は追加せず、既存tealとPractice用indigoを維持。
