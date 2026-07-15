# Loop Vault Phase 3.6.4 Codex作業指示書
## UX Reliability & Flow Polish — 壊さず、迷わせず、すばやく進める

## 0. 結論

Phase 3.6.4では、Phase 3〜3.6.3で作った良い基盤を維持しながら、日常利用の信頼性と操作の一貫性を整える。

テーマ:

**「確認は軽く、復元は必ず。主操作は一つ。音・保存・編集の状態を見失わせない。」**

解消する問題:

- Hold理由を入力させても保存されない
- Home / Detailで再生を止められない
- 進行・参考曲・関連ファイルの削除にUndoがない
- モーダルをEscで閉じられず、focus trapもない
- 保存CTAが複数あり迷う
- Inspectorが編集対象から遠い
- ステータス遷移が分かりにくい
- 保存タイミングが不統一
- Vault行を開く操作が発見しにくい
- Settingsに一般設定と開発機能が混在する
- 用語・アイコン・再生状態が不統一
- Homeの主役が埋もれる
- コード採集で曲全体の位置が分からない

---

## 1. 前提と残すもの

残すもの:

- Vaultの高密度行リスト
- Vaultのキーボード操作
- Progression Editing Workspaceの「元の検出 → 現在」
- Undo / Redo・変更一覧
- 「確認済み」チェック
- 復旧UX
- ヘッダーの保存状態
- IME中のショートカット抑止
- a11y用role
- tokens.css
- 青黒＋ミントの世界観
- 情報密度優先の矩形UI

本PhaseではMIDI解析アルゴリズム、既定Analyzer、fileVersionを変更しない。

Phase 3.7はLive MIDI Chord Modeとして予約済みのため、本改修はPhase 3.6.4とする。

---

## 2. スコープ

### 実装するもの

- Hold / Abandoned理由の保存
- 共通PlaybackController
- 全再生ボタンのPlay / Stopトグル化
- ヘッダーの再生中表示
- 汎用Undo
- 共通Modal
- Tailwind無効クラス修正と再発防止
- 保存CTA一本化
- 保存ポップオーバー
- Ctrl+Enter保存
- Inspectorの中幅bottom sheet
- ステータスUIの「現在＋次」
- フィールド種別ごとの保存規約
- Vault行の明示的な開くボタン
- Settingsの「一般 / データ / 解析」分離
- ヘッダー整理
- i18n一本化
- アイコン統一
- Homeの視覚重量調整
- 曲全体ミニマップ
- lint / test / build / tauri build

### 実装しないもの

- 320pxスマートフォンUI
- 下部固定モバイルタブ
- コマンドパレット
- Router
- オンボーディング
- 任意範囲ドラッグ選択
- UIブランド全面変更
- Live MIDI Chord Mode
- MIDI解析変更
- DB化 / クラウド同期

---

## 3. 設計原則

1. 入力させた情報は必ず保存する。保存しないなら入力UIを出さない。
2. アプリ全体で同時再生は1件だけ。
3. 軽い削除はUndo、重大操作は確認Modal。
4. 同じ対象のprimary CTAは1つ。
5. すべてをblur保存へ統一しない。フィールド種別で保存規約を分ける。
6. main windowは768px程度まで崩れないことを目標とし、320px対応は今回行わない。
7. 既存store actionとapplyVaultChangeを通し、repositoryへ直接書かない。
8. 新フィールドはoptionalまたはZod default。fileVersionは上げない。

---

# Stage 1A — Hold理由とTailwind修正

## Hold / Abandoned理由

`prompt()`を廃止し、理由入力フォームを使う。理由はstatusHistoryへ保存する。

```ts
export interface StatusHistoryEntry {
  status: Status;
  at: string;
  reason?: string;
}
```

Zod:

```ts
reason: z.string().trim().max(500).optional()
```

transition:

```ts
export interface TransitionOptions {
  reason?: string;
}
```

```ts
transition(idea, to, now, options?)
```

Hold / Abandoned時のみreasonを保存可能。理由は任意。

履歴表示:

```text
2026-07-16  保留
アレンジ案が決まらないため
```

理由をmemoへ追記しない。

## Tailwind typo

`text-[var(--lv-text)]0`など無効クラスを修正し、`npm run lint:classes`相当の検査を追加する。

---

# Stage 1B — 共通Modal

新設候補:

```text
src/components/Modal.tsx
src/components/ConfirmDialog.tsx
```

要件:

- `role="dialog"`
- `aria-modal="true"`
- Escで閉じる
- 初期focus
- focus trap
- 閉じたら呼び出し元へfocus restore
- 背景スクロール抑止
- 背景クリック制御
- dirty formでは確認または背景close無効
- IME中のEsc誤動作防止

移行対象:

- Create Idea
- Settings
- 保存確認
- Hold / Abandoned理由
- Import replace
- Backup restore
- 評価データ削除
- 修正ログ削除
- 未保存候補切替

移行後、対象箇所の`window.confirm()`を廃止する。

---

# Stage 1C — 共通PlaybackController

新設候補:

```text
src/audio/playbackController.ts
src/components/PlayToggle.tsx
src/hooks/usePlaybackState.ts
```

型:

```ts
export type PlaybackSourceKind =
  | "home"
  | "capture"
  | "vault"
  | "detail";

export interface PlayingSource {
  kind: PlaybackSourceKind;
  id: string;
}
```

API:

```ts
play(source, timeline)
stop()
toggle(source, timeline)
isPlaying(source)
subscribe(listener)
```

挙動:

- A再生中にB再生 → A停止、B開始
- 同じsourceを押す → 停止
- 再生完了 → UIも停止状態
- 再生対象削除 → 停止
- app終了 → 停止
- Capture編集開始時 → 候補全体再生停止
- 別画面へ移動して継続する場合、ヘッダーへ再生中表示
- ヘッダーの再生中表示をクリックすると停止

全再生ボタンを`PlayToggle`へ移行し、▶ / ■、tooltip、aria-labelを統一する。

Phase 3.7 Live MIDI入力とは別状態として管理する。

---

# Stage 1D — 汎用Undo

Undo対象:

- Idea削除
- SavedProgressionBlock削除
- Reference削除
- Asset関連付け解除

確認Modal対象:

- Import replace
- Backup restore
- 評価データ全削除
- 修正ログ全削除
- source index全削除

型例:

```ts
export interface UndoableAction<T> {
  id: string;
  label: string;
  payload: T;
  expiresAt: number;
  undo(): void;
  commit?(): void;
}
```

要件:

- 5秒
- 親ID・元index・削除値を保持
- Undo後に元位置へ戻す
- autosave整合
- 再生中対象削除時は停止
- Undo toastとsticky Inspectorが重ならない

---

# Stage 2A — 保存CTA一本化

候補カードの保存は以下へ統一する。

```text
[Vaultに保存 ▾]
```

通常クリック:

- 新規Idea保存ポップオーバー

ドロップダウン:

- 既存Ideaへ追加
- コードだけメモへ追記

保存ポップオーバー:

- タイトル
- 次の一手
- 確認済み
- 保存

初期タイトル優先順位:

1. 元ファイル名 + 小節範囲
2. Key + 小節範囲
3. 進行summary
4. `保存した進行`

例:

```text
chordサビ.mid · 1–4小節
```

`Ctrl+Enter`で保存確定。IME中は誤発火させない。

右側の恒常的な保存パネルは廃止し、右Inspectorはコード編集専用とする。

---

# Stage 2B — Inspectorレスポンシブ

- xl以上: 右Inspector
- xl未満: 画面下部sticky bottom sheet

Collapsed:

- 選択コード
- alternatives先頭
- 試聴
- 適用

Expanded:

- 元の検出
- 現在
- alternatives
- Root / Quality / Bass
- 直接入力
- reset

要件:

- 選択コードから視線移動を一定にする
- Undo toastと重ならない
- footerを隠さない
- Escで閉じる
- 768px程度まで検証
- 320pxモバイルUIは実装しない

---

# Stage 3A — ステータスUI

現行7ボタン並列を廃止し、以下へ変更する。

```text
Idea → Loop → 展開 → ミックス → 完成
```

表示:

```text
現在: Loop
[→ 展開へ進める] [▾ その他]
```

`その他`:

- 1段階戻す
- 保留
- 没
- Hold / Abandonedから復帰
- 必要に応じて完成解除

既存transitionルールを使う。

---

# Stage 3B — 保存規約

すべてをblur保存にしない。

| 対象 | 保存方式 |
|---|---|
| Title | blur / Enter |
| BPM | blur / Enter |
| Key | blur / Enter |
| Genre | blur / Enter |
| Mood | blur / Enter |
| Short text | blur / Enter |
| Long memo | debounce + blur |
| Next Action | blur / Enter |
| Next Action完了 | 明示ボタン |
| Status | 明示操作 |
| Code edit | Inspector適用＋候補保存 |
| Delete | Undoまたは確認 |
| Import replace | 確認Modal |
| Backup restore | 確認Modal |

IME composition中はblur / Enter保存を誤発火させない。

保存時、フィールド横に小さな✓を600ms表示する。ヘッダー保存状態を主表示として維持する。

---

# Stage 3C — Vaultの開く操作と中幅表示

各行末尾へopen icon / chevronを追加する。

```text
[›]
```

tooltip:

```text
Ideaを開く
```

ダブルクリックとEnterはショートカットとして残す。

中幅では2段表示。

上段:

- Play
- chord sequence
- Favorite
- Open

下段:

- Key
- BPM
- Date
- Tags

情報を削除せず折り返す。

---

# Stage 3D — Settings再構成

セクション:

```text
一般
データ
解析（開発用）
```

一般:

- 言語
- 月間ゴール
- 度数表示
- 通常設定

データ:

- 保存先
- フォルダを開く
- Export
- Import
- Backup
- Restore

解析:

- 折りたたみ
- 控えめなamber枠
- `開発用`表記
- 修正ログ
- 実MIDI評価
- source index
- 評価データ削除
- 差分レビュー

重大操作は共通Modalで確認する。

---

# Stage 4A — ヘッダー整理

構造:

```text
[Logo]
[Home | コード採集 | Vault]
……
[+ Idea]
[♪ 再生中]
[✓ 保存済み]
[⚙]
```

保存状態:

通常幅:

```text
✓ 保存済み
保存中…
未保存
```

狭い幅:

```text
✓
●
!
```

hoverで詳細。

保存状態を通常幅で完全にアイコンだけへしない。

Active navはPhase 3のピル背景へ統一。

設定左側へ将来のLive MIDI鍵盤ボタンを追加できる余白を残すが、本Phaseでは実装しない。

---

# Stage 4B — i18n用語統一

日本語UI:

| 内部/英語 | 表示 |
|---|---|
| Loop Vault | Loop Vault |
| Vault | Vault |
| Idea | Idea |
| Progression | 進行 |
| Next Action | 次の一手 |
| Capture | コード採集 |
| Assets | 関連ファイル |
| bars | 小節 |
| All | すべて |
| Genre | ジャンル |
| Mood | ムード |
| Focus | 原則非表示 |
| Hold | 保留 |
| Abandoned | 没 |

方針:

- コンポーネント内`language === "ja"`分岐を減らす
- `i18n.ts`へ集約
- aria-labelもi18n化
- 自動生成文言も言語対応
- ユーザー入力は翻訳しない

---

# Stage 4C — アイコンシステム

Chord Dripと同じアイコンセットを優先する。候補は`lucide-react`。

サイズは16px / 20pxの2種。

対象:

- Play / Stop
- Copy
- Favorite
- Open
- Settings
- Delete
- Undo / Redo
- Save
- More
- Back
- Warning

すべてのアイコンボタンへaria-labelとtooltipを付ける。

文字`C`でコピーを表現しない。

---

# Stage 4D — Home視覚重量

主役:

```text
今日のLoop
```

指標はカード3枚ではなく1行統計。

```text
今月 2/4 ・ 次の一手なし 3件 ・ 停滞 1件
```

最近の進行は3件程度。PlayToggleを利用。

右カラムの制作状況・停滞中は見出しと文字サイズを抑え、今日のLoopより強くしない。

情報を削りすぎず、視覚的重量を調整する。

---

# Stage 4E — 全曲ミニマップ

配置:

- ファイル概要の下
- 候補一覧の上

表示:

```text
全曲
▁▁██▁▁██▁
```

要件:

- 候補範囲をミントでハイライト
- 候補選択で該当範囲を強調
- クリックでFull Timelineを展開
- 該当位置へスクロール
- hoverで小節範囲
- 候補重複を表示可能

今回やらない:

- ドラッグ範囲選択
- 新候補生成
- 波形
- MIDIノート描画

---

# データ変更

永続化変更は`StatusHistoryEntry.reason?: string`のみを基本とする。

再生状態、Undo、Modal、Inspector layoutはUI state。

新フィールドはoptional / Zod default。fileVersionは変更しない。

---

# 推奨コンポーネント

```text
src/components/
  Modal.tsx
  ConfirmDialog.tsx
  PlayToggle.tsx
  UndoToast.tsx
  SaveProgressionPopover.tsx
  StatusPipeline.tsx
  StatusActionMenu.tsx
  Tooltip.tsx
  SongMiniMap.tsx

src/audio/
  playbackController.ts

src/hooks/
  usePlaybackState.ts
  useUndoQueue.ts
  useSaveFlash.ts
```

---

# 実装順

1. Stage 1A: Hold理由 + Tailwind
2. Stage 1B: Modal
3. Stage 1C: Playback
4. Stage 1D: Undo
5. Stage 2A: 保存CTA
6. Stage 2B: Inspector bottom sheet
7. Stage 3A: Status
8. Stage 3B: 保存規約
9. Stage 3C: Vault open
10. Stage 3D: Settings
11. Stage 4A: Header
12. Stage 4B: i18n
13. Stage 4C: icons
14. Stage 4D: Home
15. Stage 4E: minimap
16. Stage 5: QA / installer / final report

影響範囲が大きい機能を同一コミットへ混ぜない。

---

# Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.6.4を実装します。

仕様の正は
docs/phase3.6.4-ux-reliability-flow-polish-plan.md
です。

目的:
既存の良いUIを壊さず、虚偽UI、停止不能、削除復元不可、
保存導線の重複、Inspectorの距離、状態遷移の分かりにくさ、
用語・再生・モーダルの不統一を解消する。

絶対に守ること:

1. Phase 3.7 Live MIDI Chord Modeを実装しない。
2. MIDI解析アルゴリズムを変更しない。
3. defaultAnalyzerModeを変更しない。
4. Vault高密度行リストとショートカットを壊さない。
5. Progression Editing Workspaceのoriginal/current構造を壊さない。
6. 確認済みチェックを削除しない。
7. 復旧UXと保存状態表示を削除しない。
8. Hold理由を保存する。保存しないpromptを残さない。
9. Hold理由はstatusHistoryへ保存し、memoへ追記しない。
10. 再生はアプリ全体で1つだけにする。
11. 全再生ボタンをPlay/Stopトグルへ統一する。
12. 軽い削除はUndo、重大破壊は確認Modal。
13. すべての保存をblurへ統一しない。
14. フィールド種別ごとの保存規約を守る。
15. 保存CTAを1つへ集約する。
16. 保存状態を通常幅で完全にアイコンだけへしない。
17. 320pxモバイルUIを今回の要件にしない。
18. 768px程度まで崩れないことを目標にする。
19. 新フィールドはoptionalまたはZod default。
20. fileVersionを上げない。
21. repositoryへ直接書かない。
22. 既存store actionとapplyVaultChangeを通す。
23. IME変換中にショートカットや保存を誤発火させない。
24. 共通ModalはEsc、focus trap、focus restoreを実装する。
25. UI文字列をi18nへ寄せる。
26. 各Stageでlint、test、buildを通す。
27. 影響範囲の大きい機能を同一コミットへ混ぜない。

作業開始前:
- 関連ファイル
- 現行挙動
- 保存経路
- playback経路
- modal一覧
- destructive operation一覧
- 変更計画
- リスク
を報告する。

作業終了時:
- 変更ファイル
- 実装内容
- テスト結果
- a11y確認
- 手動確認項目
- 未解決事項
- 次Stageへの申し送り
を報告する。

コミット:
P3.6.4-XX: 要約
```

---

# テスト

最低限:

- Hold / Abandoned理由保存
- legacy status history parse
- Modal Esc / focus trap / focus restore / aria
- 同時再生1件
- 別source再生時の停止
- 再生完了
- 削除時停止
- Header停止
- Idea / block / reference / asset Undo
- timeout後commit
- 保存ポップオーバー
- Ctrl+Enter / IME
- Status current / next / hold / restore
- 保存規約
- Vault open button / Enter / double-click
- Settings sections
- minimap candidate range / click
- Capture / Vault / Home / Detail / Settings regression
- real MIDI evaluation / correction log regression
- lint / test / build / tauri build

---

# 受け入れ条件

- Hold / Abandoned理由が履歴へ保存される
- 保存しないpromptがない
- どの画面からでも再生停止できる
- 同時再生は1件
- 進行・参考曲・関連ファイル・Idea削除をUndo可能
- 重大操作は確認Modal
- Create / Settings等をEscで閉じられる
- Modalにfocus trap / restore
- 無効Tailwind classがない
- 保存CTAが1つ
- 保存パネルへの大きな視線移動がない
- Inspectorが中幅でsticky bottom sheet
- Statusが現在＋次型
- 保存規約がフィールド種別で統一
- Vault行に開くボタン
- Settingsが一般 / データ / 解析に分かれる
- ヘッダーに再生中と保存状態
- 用語がi18nへ統一
- アイコンが単一システム
- Homeで今日のLoopが主役
- 曲全体ミニマップが見える
- 768px程度で破綻しない
- 既存Phase 3.6.x機能を壊さない
- lint / test / build / tauri buildが通る

---

# 最終メッセージ

Phase 3.6.4は派手な新機能を追加するPhaseではない。

次の信頼を作る。

```text
入力したものは消えない
鳴らした音は止められる
消したものは戻せる
保存先で迷わない
編集対象を見失わない
現在位置と次の操作が分かる
```

Loop Vaultを、

**「高機能だが少し不揃いなツール」から、
「毎日安心して使える制作アプリ」へ仕上げる。**
