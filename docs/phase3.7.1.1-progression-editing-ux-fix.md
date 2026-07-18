# Loop Vault Phase 3.7.1.1 Codex作業指示書
## Progression Editing UX Fix — 5候補・Library優先・詳細画面のカード直接編集

---

## 0. 結論

Phase 3.7.1.1では、Phase 3.7.1で追加したProgression DetailとQuick Chord Editorの使い勝手を修正する。

今回の優先順位は次のとおり。

```text
1. Progression Detailで選択コードを変更できない不具合を直す
2. 保存済み進行でもコードカードを直接触って編集できるようにする
3. Quick Chord Editorの候補を最大5件へ増やす
4. Vaultの表示順を「ライブラリ → 一覧」へ変更する
```

完成形:

```text
Libraryから進行を探す
↓
Progression Detailを開く
↓
画面上部のコードカードをクリック
↓
右クリック / EnterでQuick Editor
↓
最大5候補からプレビュー
↓
Enterで適用
↓
別のコードカードを選び、続けて編集
```

Phase 3.7.1.1のテーマ:

**「保存済み進行でも、採集画面と同じ速度でコードを選び、聴き、直せるようにする」**

---

# 1. 現在の症状

## 1.1 Progression Detail

現在の画面では、進行テキストは上部に表示されるが、コードカードのグリッドがファーストビューにない。

Inspectorには最初のコードだけが選択状態として表示され、別コードをクリックして選択対象を変更できない。

結果:

- 選択中のコードが常に先頭コードに見える
- 2番目以降のコードを直感的に編集できない
- CaptureとProgression Detailで編集方法が異なる
- 画面上部の空間に対し、Inspectorが大きすぎる
- 進行全体と編集対象の関係が分かりにくい

## 1.2 Quick Chord Editor

解析候補が2件しか見えず、正しいコードが候補に含まれない場合が多い。

ただし、「必ず5件を捏造して表示する」のではなく、**重複のない有効な候補を最大5件**表示する。

## 1.3 Vault表示順

現在:

```text
一覧
ライブラリ
```

変更後:

```text
ライブラリ
一覧
```

大量保存後の探索を主導線にするため、新規表示時の既定モードもLibraryとする。

---

# 2. 私の設計判断

## 2.1 選択コード固定はUI調整ではなく機能不具合

「最初のコードしか選択されない」は見た目の問題ではない。

最優先で次を確認する。

- `selectedSlotId`が先頭slotへ固定されていないか
- renderごとに先頭slotへ初期化するeffectが走っていないか
- Inspectorへ`slots[0]`を直接渡していないか
- Cardの`onSelect`がProgression Detailでは接続されていないか
- Editable Progressionを毎render再生成し、selection stateを失っていないか
- `key`変更によりGrid / edit sessionがremountしていないか

修正は見かけ上の選択色だけでなく、編集sessionのsingle source of truthを直す。

## 2.2 5候補は「最大5件・多様性あり」

単純に同じrootのquality違いを5件並べない。

望ましい候補構成:

1. Analyzerの最有力代替
2. 別root仮説
3. 同root・別quality
4. Bass / inversion仮説
5. 同一構成音の別解

候補が本当に2件しか生成できない場合、UIだけ5枠に増やして空の候補を作らない。

既存の候補生成・多様化関数を監査し、内部Top-Kから最大5件を供給する。

## 2.3 Progression DetailはCaptureと同じ編集面にする

別の簡易グリッドを新しく作らない。

共用するもの:

- `EditableProgressionGrid`
- `EditableChordCard`
- `QuickChordEditor`
- `ChordInspector`
- edit session
- preview
- Undo / Redo
- keyboard navigation

画面ごとの違いは文言と保存対象だけ。

```text
Capture:
元の検出 → 現在

Progression Detail:
保存済み → 編集中
```

## 2.4 Libraryを先にするが一覧は消さない

Libraryを探索の主画面にする。

一方で、高密度一覧は検索・キーボード操作に優れているため維持する。

```text
[ライブラリ] [一覧]
```

初回既定はLibrary。

ユーザーが表示を切り替えた後は、少なくとも現在セッション中は選択を保持する。

app preferencesに既存のVault view preferenceがある場合はそこへ保存してよいが、Vaultの`data.json`には保存しない。

---

# 3. スコープ

## 3.1 実装するもの

- Progression Detail上部へのコードカードグリッド表示
- コードカードのクリック選択
- 選択中slotとInspectorの同期
- 右クリックQuick Editor
- Enter Quick Editor
- hover編集ボタン
- Shift+F10
- 前後コードのkeyboard移動
- Quick Editor候補最大5件
- 候補キー`1〜5`
- 候補の重複除去
- 候補の多様化
- Library / 一覧の順序変更
- Libraryを初期表示
- selection stateの不具合回帰テスト
- CaptureとProgression Detailの共通挙動テスト
- 日本語 / English確認
- lint / test / typecheck / build / Tauri build

## 3.2 実装しないもの

- MIDIコード検出重みの変更
- Live MIDI変更
- Mood分類変更
- taxonomy変更
- SavedProgressionBlock schema変更
- fileVersion変更
- Progression entity独立化
- 新しい保存経路
- Chord Drip runtime依存
- Quick Editorのデザイン全面刷新

---

# 4. Stage F0 — 監査

最初に次を確認する。

## 4.1 Progression Detail

- edit session生成箇所
- `selectedSlotId`の初期化箇所
- Inspectorへ渡すselected slot
- Gridが表示されているか
- Grid cardのclick handler
- Quick Editor open handler
- `useEffect`依存配列
- component `key`
- Saved block更新時のsession再生成

## 4.2 Captureとの差分

Captureではコード選択が動くため、以下を比較する。

- Grid props
- selected state
- onSelect
- onContextMenu
- onQuickEdit
- edit session hook
- lifecycle
- candidate ID / block ID

成果物:

```text
docs/phase3.7.1.1-selection-audit.md
```

原因を報告してから修正する。

---

# 5. Stage F1 — 選択コード固定の修正

## 5.1 Single source of truth

選択状態は編集sessionの`selectedSlotId`へ集約する。

```ts
export interface ProgressionEditSession {
  progressionId: string;
  selectedSlotId?: string;
  previewChord?: ChordSymbol;
  slots: EditableChordSlot[];
  history: ProgressionEditOperation[];
  historyIndex: number;
}
```

Inspector側で独自にindexを持たない。

## 5.2 初期選択

Progression Detailを初めて開いた場合のみ先頭slotを選ぶ。

```text
selectedSlotIdが未設定
かつ
progressionIdが新しくなった
→ 先頭slotを選択
```

次では初期化しない。

- slotのコードを編集した
- Undo / Redoした
- previewした
- tagを編集した
- renderが発生した
- autosave状態が変わった

## 5.3 progression変更

別Progressionを開いた場合:

```text
previous progressionId !== next progressionId
→ 新Progressionの先頭slotを選択
```

同じProgressionを再renderした場合はselectionを維持する。

## 5.4 slot削除・結合

選択slotが削除された場合:

1. 次のslot
2. 前のslot
3. 先頭slot
4. slotなしならundefined

の順で選び直す。

## 5.5 Inspector

必ず次で取得する。

```ts
const selectedSlot = session.slots.find(
  (slot) => slot.id === session.selectedSlotId,
);
```

`slots[0]`を直接Inspectorへ渡さない。

## 5.6 Card click

```ts
onSelectSlot(slotId)
```

をCaptureとProgression Detailで共用する。

クリック時:

- selectedSlotId更新
- previewを必要ならclear
- Inspector更新
- card selected表示
- scroll位置は維持

---

# 6. Stage F2 — Progression Detailレイアウト

## 6.1 上部構成

現在の進行テキストのみの表示を、コードカード中心へ変更する。

```text
┌─────────────────────────────────────────────────────────────┐
│ ← Vault   コード進行                                      │
│ | A6 | Gmaj7 | F#m11 | B7 |                              │
│ [▶ 再生] [保存] [Undo] [Redo]      [親Idea] [複製] […]   │
├────────────────────────────────────┬────────────────────────┤
│ コードカードグリッド               │ Inspector              │
│                                    │                        │
│ [ A6 ] [ Gmaj7 ]                   │ 選択中: Gmaj7          │
│ [ F#m11 ] [ B7 ]                   │ 保存済み: Gmaj7        │
│                                    │ 編集中: Gmaj9          │
└────────────────────────────────────┴────────────────────────┘
```

## 6.2 コードカードをファーストビューへ

画面を開いた時点で、全コードカードが確認できる。

進行テキストは補助summaryとして残してよいが、カードと重複して大きく表示しすぎない。

## 6.3 Grid

Captureと同じカードcomponentを使用する。

状態:

- normal
- selected
- edited
- playing
- review

## 6.4 右クリック

各カードで:

```text
contextmenu
→ prevent default
→ slot選択
→ Quick Editorを開く
```

右クリックしたカードが未選択の場合も、先に選択してから開く。

## 6.5 Keyboard

Grid focus中:

```text
← / →  前後slot
↑ / ↓  Grid上下
Enter   Quick Editor
Shift+F10 Quick Editor
Space   選択コード試聴
Esc     Quick Editor / Inspector操作取消
```

input / select / textarea / IME中は奪わない。

## 6.6 レスポンシブ

- xl以上: Grid左 + Inspector右
- xl未満: Grid上 + Inspector下
- 既存Capture規約を使用
- 内部の二重スクロールを避ける
- Detail全体のスクロールを主にする

---

# 7. Stage F3 — Quick Chord Editor候補最大5件

## 7.1 定数

```ts
export const QUICK_CHORD_ALTERNATIVE_LIMIT = 5;
```

CaptureとProgression Detailで同じ値を使う。

## 7.2 表示対象

主コード自体とは別に、代替候補を最大5件表示する。

```text
現在: G7

候補:
1 G13
2 G7sus4
3 Bdim/G
4 Db7/G
5 G9
```

現在コードと同一の候補は除外する。

## 7.3 正規化・重複除去

以下を考慮する。

- chord labelの正規化
- enharmonic spelling
- slash bass
- root / quality / bass
- 同一ChordSymbolの重複

Bassが違う候補は別候補として維持する。

```text
Cmaj7
Cmaj7/E
```

は別。

```text
F#maj7
Gbmaj7
```

はkey contextと表記規則に応じて重複扱いを検討する。

## 7.4 候補選択

既存の内部Top-Kから候補を取る。

優先順の目安:

1. analyzer score
2. root diversity
3. quality diversity
4. bass hypothesis
5. equivalent pitch-set

同一rootだけで5件を埋めない。

ただし、有効候補が2件だけなら2件表示でよい。

## 7.5 キーボード

```text
1〜5
→ 対応候補をpreview

Space
→ preview試聴

Enter
→ 適用

Esc
→ 破棄
```

数字キーで即保存しない。

## 7.6 UI

5候補が横幅へ収まらない場合はwrapする。

```text
[1 G13] [2 G7sus4] [3 Bdim/G]
[4 Db7/G] [5 G9]
```

候補が増えてもRoot / Quality / Bass操作が画面外へ押し出されないようにする。

---

# 8. Stage F4 — Library / 一覧の順序

## 8.1 表示順

変更前:

```text
[一覧] [ライブラリ]
```

変更後:

```text
[ライブラリ] [一覧]
```

## 8.2 初期値

新規起動またはpreference未設定:

```ts
progressionViewMode = "library";
```

## 8.3 選択保持

一覧へ切り替えた後は、以下のいずれかで保持する。

推奨優先順:

1. 既存app preferences
2. session state
3. localStorageのUI preference

Vault `data.json`には入れない。

## 8.4 状態共有

Library / 一覧を切り替えても維持する。

- search text
- duration filter
- favorite filter
- sort
- selected row
- playback
- category filter chips

一覧モードでLibrary固有カテゴリレールを非表示にしても、filter chipは維持または明示clearできるようにする。

---

# 9. データ・永続化

今回の修正で永続schemaを変更しない。

変更しないもの:

- `SavedProgressionBlock`
- `fileVersion`
- taxonomy
- suppressed tags
- Progression Indexの非永続方針
- autosave
- backup
- import / export

コード編集保存は既存の:

```text
store action
↓
applyVaultChange()
↓
autosave
↓
backup
```

を通す。

---

# 10. 推奨ファイル

既存構成に合わせて調整してよい。

```text
src/views/ProgressionDetailView.tsx
src/views/VaultView.tsx

src/components/progression-editing/
  EditableProgressionGrid.tsx
  EditableChordCard.tsx
  QuickChordEditor.tsx
  ChordInspector.tsx

src/domain/progressionEditing/
  editSession.ts
  selection.ts
  alternatives.ts
```

重複componentを新設しない。

---

# 11. 実装順

## F0

- selection監査
- 原因報告
- Captureとの差分

## F1

- selectedSlotId修正
- Inspector同期
- click / keyboard
- tests

## F2

- Progression DetailへGrid上部表示
- 右クリック
- Quick Editor
- responsive

## F3

- alternatives最大5
- diversity
- normalization
- 1〜5 keyboard
- tests

## F4

- Library / 一覧順序
- Library初期値
- view preference
- state retention

## F5

- Regression
- Japanese / English
- manual QA
- lint
- test
- typecheck
- build
- Tauri build
- final report

---

# 12. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.7.1.1を実装します。

仕様の正は
docs/phase3.7.1.1-progression-editing-ux-fix.md
です。

目的:
Progression DetailでもCaptureと同じように、
コードカードを直接選択・右クリック編集できるようにし、
Quick Chord Editor候補を最大5件へ増やし、
VaultのLibraryを主表示にする。

絶対に守ること:

1. 最初に選択コード固定の原因を監査し、報告する。
2. selectedSlotIdを編集sessionのsingle source of truthにする。
3. Inspectorへslots[0]を直接渡さない。
4. renderやコード編集のたびに選択を先頭へ戻さない。
5. 別Progressionを開いた時だけ初期選択する。
6. Progression Detail上部にコードカードGridを表示する。
7. Captureと同じGrid / Card / Quick Editor / Inspectorを再利用する。
8. コードカードclickで選択を変更できるようにする。
9. 右クリックしたカードを選択してQuick Editorを開く。
10. Enter / hover icon / Shift+F10も維持する。
11. Quick EditorとInspectorで別draftを持たない。
12. 候補は最大5件。有効候補が少ない場合は無理に5件作らない。
13. 現在コードと同一候補を除外する。
14. 候補を正規化・重複除去する。
15. 同一root候補だけで5件を埋めない。
16. 1〜5はpreview、Enterで適用、Escで破棄。
17. MIDI解析の重みを変更しない。
18. Vaultの表示順をLibrary / 一覧へ変更する。
19. preference未設定時の既定表示をLibraryにする。
20. Library / 一覧切替で検索・filter・sort状態を失わない。
21. UI preferenceをVault data.jsonへ保存しない。
22. SavedProgressionBlock schemaを変更しない。
23. fileVersionを変更しない。
24. Progression Index / taxonomy / Moodを変更しない。
25. Live MIDIを変更しない。
26. PlaybackControllerを変更しない。
27. 既存store actionとapplyVaultChangeを通す。
28. repositoryへ直接書かない。
29. 日本語 / Englishを維持する。
30. IME中にkeyboard shortcutを奪わない。
31. 各Stageでlint / test / typecheck / buildを実行する。
32. selection修正、候補5件、Library順序を別commitへ分ける。

作業開始前:
- Progression Detailのselection経路
- Captureとの差分
- first-slot固定の原因
- alternativesの生成元
- Vault view modeの初期化場所
- 変更計画
- risks
を報告する。

作業終了時:
- 原因
- 変更ファイル
- selection修正
- 5候補の生成方法
- Library初期表示
- tests
- manual QA
- 未解決事項
を報告する。

コミット:
P3.7.1.1-FX: 要約
```

---

# 13. テスト

## 13.1 Selection

- 初回は先頭slot
- 2番目をclick
- Inspectorが2番目へ更新
- 4番目をclick
- Quick Editorが4番目を編集
- code変更後も選択維持
- Undo後も選択維持
- Redo後も選択維持
- autosave state変更でも維持
- 別Progressionで先頭へ初期化
- slot削除後に隣slot選択
- Inspectorでslots[0]固定なし

## 13.2 Grid / Detail

- Gridがファーストビュー
- selected style
- playing style
- edited style
- right-click
- Enter
- hover icon
- Shift+F10
- keyboard arrows
- responsive
- scroll

## 13.3 Alternatives

- 0件
- 1件
- 2件
- 5件
- 6件以上は5件
- current chord除外
- duplicate除外
- enharmonic
- slash bass区別
- root diversity
- quality diversity
- keys 1〜5
- preview / apply / cancel

## 13.4 Vault mode

- 表示順Library / 一覧
- default Library
- switch to list
- session preference
- search保持
- filter保持
- sort保持
- selected row保持
- playback保持
- narrow width

## 13.5 Regression

- Capture editing
- Progression Detail save
- autosave
- Undo / Redo
- Library filters
- taxonomy
- Mood
- Live MIDI
- MIDI analysis
- PlaybackController
- Import / Export
- Backup
- close flush

---

# 14. 人間側確認

## Selection

1. 進行詳細を開く
2. A6を選択
3. Gmaj7を選択
4. F#m11を選択
5. B7を選択

各操作でInspectorの以下が更新されること。

```text
選択中
保存済み
編集中
候補
```

## Quick Editor

- 各カードを右クリック
- 候補が最大5件
- 1〜5でpreview
- Spaceで試聴
- Enterで確定
- Escで破棄
- 次のカードへ移動して続けて編集

## Detail layout

- 開いた直後にコードカードが見える
- 進行全体と選択コードが同時に分かる
- Inspectorだけが巨大に見えない
- 内部スクロールが不自然でない

## Vault

- 最初にLibraryが表示
- `[ライブラリ] [一覧]`の順
- 一覧へ切り替えられる
- 戻っても検索状態が残る

---

# 15. 受け入れ条件

- Progression Detailで全コードカードが上部に表示される
- 任意のコードカードをclick選択できる
- Inspectorが選択コードへ追従する
- 最初のslotへ勝手に戻らない
- 右クリックで対象カードのQuick Editorが開く
- Enter / hover / Shift+F10も動く
- Quick Editor候補が最大5件
- 候補が少ない場合は有効件数だけ表示
- 同一候補の重複がない
- 1〜5 preview / Enter apply / Esc cancel
- CaptureとProgression Detailが同じ挙動
- VaultはLibrary / 一覧の順
- preference未設定時はLibrary
- view切替で検索・filter・sortを失わない
- schema変更なし
- fileVersion不変
- MIDI解析変更なし
- Live MIDI変更なし
- lint
- test
- typecheck
- web build
- Tauri build
- installer

---

# 16. 最終メッセージ

Phase 3.7.1.1は新機能を増やす修正ではない。

```text
進行全体を見る
↓
直したいカードを選ぶ
↓
候補を聴く
↓
適用する
↓
次のカードへ進む
```

**保存済み進行でも、コード採集と同じ速度で編集できる状態にする。**
