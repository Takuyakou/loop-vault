# Phase 4.2.1 Primary Range Selection Surface 実装報告

## 目的

Phase 4.2で実装済みのDraft編集基盤は維持したまま、「全曲」を採集範囲の主操作面へ変更した。
Candidate CatalogやRecommendationは選択プリセットとして表示し、実際の編集対象は引き続き
`CaptureView.activeDraft`だけに限定している。

## UI思想の修正

- 「全曲」上へCandidate、現在Selection、左右ハンドル、選択帯を重ねて表示する。
- Candidateは緑系、現在Selectionは琥珀色の太い外枠とハンドルで区別する。
- Selectionの帯はpointer eventを遮らず、重なったCandidateを直接クリックできる。
- 範囲全体の移動は帯上部の専用移動ハンドルへ分離する。
- Selection直下へ開始・終了、小節数、コードイベント数、生成元、編集済み状態を常時表示する。
- コード境界スライダーは削除せず、初期状態が閉じた詳細accordionへ移した。
- Candidateクリックだけでは「曲全体のコードを見る」を開かず、同じ画面上でDraft編集へ進める。

根拠:

- `src/components/SongMiniMap.tsx`
- `src/components/DraftRangeOverlay.tsx`
- `src/views/CaptureView.tsx`
- `src/components/DraftBoundaryHandles.tsx`

## 全曲タイムラインの操作

| 操作 | 実装結果 |
|---|---|
| Candidateクリック | Candidateを複製したautomatic-candidate Draftへ切り替える |
| 空き領域drag | `createManualDraft()`を通してmanual-range Draftを作成する |
| 左ハンドルdrag | `retargetDraftByAbsoluteBeats()`で開始位置を変更する |
| 右ハンドルdrag | `retargetDraftByAbsoluteBeats()`で終了位置を変更する |
| 選択帯中央drag | 長さを維持して範囲全体を移動する |
| Alt+drag | 既存snapを一時解除する |
| Ctrl/Cmd+Z、Redo | 既存の統一Capture Draft履歴を利用する |
| Space | 現在DraftをPreviewする |
| Enter | 対応するCandidateまたはManual Draft Editorへ移動する |
| Esc | 保留中の操作を戻してSelectionのfocusを解除する |

範囲変更後のコード列は既存の範囲再構築ロジックで更新される。Candidate、
Occurrence、Catalog、Recommendationへは書き戻さない。範囲外の編集が失われる場合は、
既存と同じ確認UIを表示する。

左右ハンドルのdrag中は、Selectionの帯と直下の開始・終了、小節数、コードイベント数を
即時更新する。pointer release時に一度だけDraftへcommitし、統一履歴を不要に増やさない。

## 境界accordion

- 見出し: `詳細：コード境界を調整（N箇所）`
- 初期状態: 閉じる
- 展開時: 既存の全境界sliderを利用可能
- 高さ: `max-h-72`
- overflow: accordion内部の縦scroll
- accordionの開閉はDraft履歴へ記録しない

50イベント（49境界）のfixtureで、初期折りたたみと内部scrollを検証した。

## Keyboard / Mouse / Accessibility

- Selectionはfocus可能な`role="group"`として実装した。
- 左右ハンドルには操作名、現在値、最小値、最大値を付与した。
- Candidateのaccessible nameとtooltipへ「採集範囲の選択プリセット」を明記した。
- 色だけで区別せず、Selectionの外枠、ラベル、左右ハンドルを併用した。
- accordionはネイティブ`details` / `summary`のEnter・Space操作を利用する。

## 回帰fixture

- Candidate 1 / Candidate 6クリック
- Candidateにない任意範囲のdrag作成
- Selection全体移動
- 8小節から12小節への伸縮
- 19小節 / 22小節の既存到達性
- dirty Draft切り替え時の確認
- Undo / Redo
- accordion開閉
- 50境界の長尺Draft
- Desktop 1280px
- Mobile 390px

## 維持事項

- `CaptureView.activeDraft`
- Automatic Candidate / Manual RangeのDraft統合
- 統一Undo / Redo
- Preview / Save経路
- Candidate Catalog / Recommendation
- Analyzer `phase4-v1`
- 永続化schema
- `fileVersion = 1`

Analyzer、MIDI parser、Vault schema、保存形式への変更はない。
