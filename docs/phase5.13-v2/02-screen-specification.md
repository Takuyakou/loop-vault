# Phase 5.13 v2 Screen Specification

この文書は、Phase 5.13 v2 完了時点の実装に基づく画面仕様である。解析ロジック、保存形式、Tauri コマンドの仕様変更は含まない。

## App Shell

- 左サイドバーを `WORKSPACE`（Home / Chord Capture / Vault / Practice / Live MIDI）と `SYSTEM`（History / Settings）に分ける。
- 現在ルートは背景、左アクセント、文字ウェイト、`aria-current="page"` で示す。
- サイドバーは展開・折りたたみ可能で、狭い画面では折りたたみを既定とする。
- Top Bar はページ名、試聴音色、音量、Idea 作成、保存状態を保持する。
- ルート変更時はメイン領域を先頭へ戻し、見出しへフォーカスを移す。

根拠: `src/components/AppShell.tsx`, `src/App.tsx`, `src/styles/app.css`

## Home

- `今日のLoop` を主操作面とし、コードカード、Key / BPM / Idea、Next Action、試聴・詳細・完了をまとめる。
- 最近採集した進行と制作状況を、主カードより弱い階層で表示する。
- Focus 候補がない場合は、次に行う操作を含む空状態を表示する。

根拠: `src/views/HomeView.tsx`

## Chord Capture

- 空状態では MIDI のドロップ領域とファイル選択を同じ主操作面に置く。
- 読み込み後はソース概要、追加・クリア、Piano Roll、解析プリセット、Voice 選択を一続きに表示する。
- 解析中、解析失敗、解析完了を別状態として示し、二重実行を防ぐ。
- 解析結果では候補一覧、全曲タイムライン、範囲編集、コード修正、試聴、保存を同じ Draft 経路で扱う。
- 未保存編集を残した候補切替は確認し、キャンセル時は編集へ戻る。

根拠: `src/views/CaptureView.tsx`, `src/components/pre-analysis/PreAnalysisWorkspace.tsx`

## Vault

- 検索、長さ、並び替えを最上段の主絞り込みにする。
- Key、元 MIDI、タグ、お気に入り等は二次フィルターと facet rail に分ける。
- 結果行ではコード列を第一情報、ソース名を第二情報、Key / BPM / 日付 / タグを第三情報とする。
- 選択中と再生中は別属性・別表示で区別する。
- 1,000件以上では行を仮想化し、長いタイトルはレイアウトを壊さず全文へアクセスできる。

根拠: `src/views/VaultView.tsx`

## Progression Detail

- コードカード列をメインコンテンツの最初に表示する。
- クリックは選択と試聴、右クリックは Quick Editor、矢印キーはカード間移動に割り当てる。
- 選択中、再生中、編集済み、警告、キーボードフォーカスを色だけに依存せず区別する。
- Inspector、候補、タグ、ソース、親 Idea、Practice 導線はカード列より後へ置く。
- 未保存編集は保存・破棄確認を通し、ルート変更で失わない。

根拠: `src/views/ProgressionDetailView.tsx`

## Practice

- 左に練習キュー、右の先頭に現在の課題を配置する。
- 現在コード、進行内位置、判定、レベル、Mode、Voicing、MIDI 接続状態を同一文脈で表示する。
- 現在の課題は indigo の副アクセントを使い、通常の主操作 teal と役割を分ける。

根拠: `src/views/PracticeView.tsx`

## Live MIDI

- 接続状態の直後に現在コードを最も強い面として表示する。
- `provisional`、`confirmed`、待機中を文字ラベルで区別する。
- 採集したコード列、保存操作、履歴・診断は現在コードより下位に置く。
- Web 環境ではデスクトップ MIDI が必要であることと、次の行動を表示する。

根拠: `src/components/LiveMidiMiniMode.tsx`, `src/App.tsx`

## History

- Vault に保存済みの日時情報から、採集、Idea 更新、練習、状態変更を日付別に構成する。
- 検索、種類フィルター、元画面を開く操作を提供する。
- 永続化されたイベントログが存在しないため、架空の編集履歴、消去、履歴エクスポートは実装しない。

根拠: `src/views/HistoryView.tsx`

## Settings

- 左カテゴリ、右フォームの二列構成とし、狭い画面では一列に戻す。
- General / Audio & MIDI / Analysis / Appearance / Accessibility / Privacy & Logs / About を既存設定項目へ対応付ける。
- モーダルのフォーカストラップ、Escape、起点へのフォーカス復帰を維持する。

根拠: `src/views/SettingsDialog.tsx`, `src/components/Modal.tsx`

## Global State Contract

- Loading、進捗、空、回復可能エラー、保存中、保存済み、保存失敗を共通 primitive で表現する。
- 重要エラーは原因だけでなく次の行動を表示する。
- アイコンボタンには accessible name を付け、Lucide は 16px / 20px の規格に揃える。
- `prefers-reduced-motion` ではアニメーションと smooth scroll を実質停止する。

根拠: `src/components/ui/primitives.tsx`, `src/components/Toast.tsx`, `src/styles/tokens.css`
