# Loop Vault Phase 3.7.1.1 Selection監査

作成日: 2026-07-18

## 結論

Phase 3.7.1で追加されたProgression Detailには、すでに`EditableProgressionGrid`、`EditableChordCard`、`QuickChordEditor`、`ChordInspector`が接続されている。コードカードの通常クリック、右クリック、Enter、Shift+F10、hover編集ボタンの基本経路も存在する。

一方で、選択状態を安定して維持するための経路と、Captureとの操作統一には次の欠落がある。

1. 保存成功時に`createEditableProgression()`でsession全体を作り直し、選択が先頭slotへ戻る。
2. Progression Detailの`selectedSlot`計算が、無効な`selectedSlotId`を`Math.max(0, -1)`で先頭slotへ見かけ上フォールバックする。
3. Progression DetailにはCapture側の前後slotキーボード移動が接続されていない。
4. Captureは`editable.selectedSlotId`とは別に`selectedChordIndex`を持ち、2つの選択状態を手動同期している。
5. 選択・保存・Undo / Redoを複数slotで検証するProgression Detail回帰テストがない。

したがって「Gridを新設する」のではなく、既存の共通Gridを維持したまま、`selectedSlotId`を唯一の選択状態として扱う修正が必要である。

## Progression Detailの実態

### edit session生成

- 初回生成: `src/views/ProgressionDetailView.tsx:83`
- session生成関数: `src/domain/progressionEditing/editableProgression.ts:18`
- `createEditableProgression()`は先頭slotを初期選択する: `src/domain/progressionEditing/editableProgression.ts:44`
- Reactのcomponent keyは`ideaId:blockId`で、同じ進行の通常renderではremountしない: `src/App.tsx:408`

### 選択経路

- GridはProgression Detail内に表示済み: `src/views/ProgressionDetailView.tsx:252`
- Card clickは`selectEditableSlot()`へ接続済み: `src/views/ProgressionDetailView.tsx:254`
- Gridのselected表示は`editable.selectedSlotId === slot.id`: `src/components/progression-editing/EditableProgressionGrid.tsx:70`
- Inspectorは`selectedSlot`を受け取る: `src/views/ProgressionDetailView.tsx:297`
- Inspectorのapply/resetは`current.selectedSlotId`を参照する: `src/views/ProgressionDetailView.tsx:308`

`slots[0]`を直接Inspectorへ渡してはいない。ただし、次の計算によってID不整合時に先頭slotが表示される。

```ts
const selectedIndex = Math.max(
  0,
  editable.slots.findIndex((slot) => slot.id === editable.selectedSlotId),
);
const selectedSlot = editable.slots[selectedIndex];
```

根拠: `src/views/ProgressionDetailView.tsx:90`

### 選択が先頭へ戻る確定経路

保存成功後に次を実行している。

```ts
setEditable(createEditableProgression(editingBlock, meter));
```

`createEditableProgression()`は常に`slots[0]?.id`を選択するため、2番目以降を編集して保存すると先頭へ戻る。

根拠:

- `src/views/ProgressionDetailView.tsx:108`
- `src/domain/progressionEditing/editableProgression.ts:44`

### 構造編集

- splitは生成した左slotを選択する。
- mergeは生成したmerged slotを選択する。
- deleteは削除位置に応じて隣接slotを選択する。
- Undo / Redo snapshotには`selectedSlotId`が含まれる。

根拠:

- `src/domain/progressionEditing/splitMerge.ts`
- `src/domain/progressionEditing/editHistory.ts`

構造編集側はselectionを保存しているが、削除後の選択優先順は仕様の「次、前」と完全一致せず、現状は先頭削除時に次、それ以外は前を選ぶ。

## Captureとの差分

Captureも同じGrid / Card / Quick Editor / Inspectorを使う。ただし、次の2状態が併存する。

```ts
const [editable, setEditable] = useState(() => createEditableProgression(candidate, beatsPerBar));
const [selectedChordIndex, setSelectedChordIndex] = useState(0);
```

根拠: `src/views/CaptureView.tsx:970`

- Grid選択時にindexと`selectedSlotId`を両方更新する。
- Quick Editor open/apply時も両方更新する。
- 構造編集後に`selectedSlotId`からindexを再計算する。
- Inspectorのslotは`selectedSlotId`、preview対象は主にindexを使う。

根拠: `src/views/CaptureView.tsx:1047`, `src/views/CaptureView.tsx:1093`, `src/views/CaptureView.tsx:1122`, `src/views/CaptureView.tsx:1229`

この二重管理は現時点で同期処理を持つが、selectionのsingle source of truthというPhase 3.7.1.1の条件を満たさない。F1でindexを`selectedSlotId`から派生させる。

## Quick Chord Editor候補数

Quick Editorの表示と数字キーはすでに5件まで扱える。

- 表示: `slot.alternatives.slice(0, 5)`: `src/components/progression-editing/QuickChordEditor.tsx:175`
- 数字キー: `1`から`5`: `src/components/progression-editing/QuickChordEditor.tsx:109`

しかし上流が候補を早期に削っている。

- legacy: `scored.slice(1, 3)`で最大2件: `src/domain/midi/legacy.ts:264`
- hybrid: 最大4件: `src/domain/midi/hybrid.ts:58`
- legacy-boundary reranker: `limit: 4`: `src/domain/midi/legacyBoundaryReranker.ts:154`
- 共通多様化関数自身も最大4へclamp: `src/domain/midi/candidateDiversity.ts:26`

F3では採点重みを変更せず、既存Top-Kから最大5件を保持する。現在コードの除外、canonicalな重複除去、root / quality / bass / pitch-setの多様性は既存の`selectDiverseAlternatives()`を拡張して利用する。

## Vault表示モード

- 現在のstate初期値は`"list"`: `src/views/VaultView.tsx:43`
- 表示順もList、Library: `src/views/VaultView.tsx:172`
- 検索、長さ、favorite、sort、カテゴリは同じ`VaultView`のstateなので、モード切替では失われない。
- `VaultView`を離れるとstateは失われる。data.jsonには保存されない。

F4では順序をLibrary、Listへ変更し、session内の初期値を`"library"`にする。永続schemaやVault repositoryは変更しない。

## 修正計画

1. F1: `selectedSlotId`からindexとInspector対象を安全に派生し、保存後も選択を維持する。Captureの二重選択stateを除去し、複数slotの回帰テストを追加する。
2. F2: 既存Gridをファーストビューの主役として整理し、Detail側へ矢印移動・Space試聴を追加する。IMEや入力中はショートカットを奪わない。
3. F3: 共通候補limitを5にし、legacy / hybrid / rerankerが既存Top-Kから最大5件を保持する。重み、主コード、Analyzer modeは変更しない。
4. F4: Libraryを先頭・既定にし、切替時の検索・filter・sort・selection・playback保持をテストする。
5. F5: lint、test、typecheck、web build、Tauri build、手動desktop/mobile QAを実行する。

## Risks

- Captureの`selectedChordIndex`除去はpreview、propagation、構造編集、keyboard操作へ影響するため、selected IDからの派生indexを一貫して使う必要がある。
- 保存後にsessionを維持する場合、履歴とdirty判定を保存済み状態へrebasingする必要がある。選択だけでなくUndo履歴の意味を確認する。
- legacyの代替候補数増加はdata.jsonのschema変更ではないが、新規解析結果と新規保存ブロックの配列サイズが増える。旧data.jsonはそのまま読み込める。
- enharmonic重複はlabel比較だけでは不十分。root / quality / tensions / bassをcanonical keyに使う。
