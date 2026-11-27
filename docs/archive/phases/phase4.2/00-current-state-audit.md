# Phase 4.2 現状監査

監査対象コミット: `95f8575`  
監査日: 2026-07-26  
対象: Capture Selection Editing 着手前の実コード

## 結論

P4.1.3 の Manual Candidate Rescue は、Full Timeline の任意範囲から
`ManualCandidateDraft` を作り、既存の進行編集関数を使って編集・試聴・保存できる。
ただし自動候補は `ProgressionCandidateCard` 内のローカル
`EditableProgression` で編集され、手動範囲は `TimelineDetails` と
`ManualCandidateEditor` のローカル state で管理されている。

保存処理は最終的に `CaptureView` の `saveNew()` / `appendExisting()` を共有するが、
そこへ到達するまでの編集状態、Undo/Redo、表示コンポーネント、候補から保存用データへの
変換は二系統である。現状は Phase 4.2 が要求する「現在の Draft が唯一の保存対象」
にはなっていない。

## Source of Truth

| 対象 | 現在の実装 | 判定 |
|---|---|---|
| 手動範囲の選択 | `TimelineRangeSelector` のローカル `selection` | 部分実装 |
| 手動 Draft | `TimelineDetails` のローカル `manualDraft` | 実装済み |
| 手動コード編集 | `ManualCandidateEditor` のローカル `editable` | 実装済みだが Draft と二重 |
| 自動候補編集 | 各 `ProgressionCandidateCard` のローカル `editable` | 実装済みだが手動 Draft と別系統 |
| 自動候補から Draft 作成 | 関数・経路とも無し | 未実装 |
| 保存対象 | 自動候補は Card の editable、手動は Draft 変換結果 | 二系統 |
| Capture 専用 Store | 無し | 新設不要 |

根拠:

- `src/views/CaptureView.tsx`
- `src/components/TimelineRangeSelector.tsx`
- `src/components/ManualCandidateEditor.tsx`
- `src/domain/midi/manualDraft.ts`
- `src/domain/midi/manualDraftEditing.ts`

## Draft / Selection

### 実装済み

- `createManualDraft()` が Full Timeline と `TimelineRange` から
  `ManualCandidateDraft` を作成する。
- `sourceTimelineFingerprint` は FNV-1a による timeline fingerprint を保持する。
- `selectedRange`、`events`、`originalEvents`、`repairOperations`、`isDirty` を保持する。
- `createCandidateFromTimelineRange()` は Catalog を変更せず、選択範囲から detached な
  `CandidateOccurrence` を作る。
- Draft の再選択、範囲 nudge、gap/overlap/parse の検証がある。

### 未実装・相違

- `source` は文字列リテラル `"manual-range"` のみで、
  `CandidateDraftSource` union ではない。
- 自動候補から Draft を作る `createDraftFromCandidate()` は無い。
- `snapMode` は Draft に無い。
- `sourceCandidateSnapshot` は無い。
- Draft の選択範囲と `TimelineRangeSelector` のローカル選択は同一 state ではない。
- Draft は Capture View 全体ではなく `TimelineDetails` 内に置かれているため、
  UI 構成変更や再解析をまたぐ保持を保証していない。

根拠:

- `src/domain/midi/manualDraft.ts`
- `src/domain/midi/manualRange.ts`
- `src/domain/midi/manualDraftEditing.ts`
- `src/components/TimelineRangeSelector.tsx`
- `src/views/CaptureView.tsx`

## Editor

### 実装済み

- コード置換、挿入、削除、split、merge、N.C.、Undo/Redo は
  `src/domain/progressionEditing/` の純関数を利用する。
- `ManualCandidateEditor` は Draft から `EditableProgression` を作り、編集後に
  `applyEditableToDraft()` で Draft events へ戻す。
- 範囲の開始・終了を 1 beat / 1 bar 単位で nudge できる。
- 範囲変更時に既存編集を保持するか破棄するか確認する。

### 未実装・相違

- 自動候補は同じ `ManualCandidateEditor` を使わない。
- Draft と Editor が別 state で、Editor 側の `editable` が実操作の一次状態になる。
- event move / resize を明示する編集 UI は無い。
- Full Timeline 上の永続的な範囲ハンドルは無い。
- コード境界の pointer drag は無い。
- snap mode (`bar` / `harmonic` / `beat`) は無い。
- Delete の四つの意味、Merge の左右保持選択、結果 Toast は無い。
- 右クリック、編集アイコン、`Shift+F10` から同一メニューへ入る統合経路は無い。

根拠:

- `src/components/ManualCandidateEditor.tsx`
- `src/views/CaptureView.tsx`
- `src/domain/progressionEditing/editableProgression.ts`
- `src/domain/progressionEditing/splitMerge.ts`

## History

### 実装済み

- `EditableProgression.history` は before/after slot snapshot を持つ。
- Undo/Redo、Redo branch の破棄、履歴上限がある。
- 現在の上限は `MAX_EDIT_HISTORY = 100`。

### 未実装・相違

- 必要な上限 64 ではない。
- 履歴対象はコード slot 編集のみで、`selectedRange`、snap mode、範囲移動を含まない。
- `ManualRepairOperation` は Draft に追記されるが、復元用 snapshot stack ではない。
- コード編集と範囲編集を混在させた単一 Undo/Redo は無い。
- 操作名一覧、任意時点へのジャンプ UI は無い。
- Draft 破棄時に統一履歴を破棄する概念は無い。

根拠:

- `src/domain/progressionEditing/editHistory.ts`
- `src/domain/progressionEditing/types.ts`
- `src/domain/midi/manualDraft.ts`
- `src/components/ManualCandidateEditor.tsx`

## Preview / Voicing / Save

### 実装済み

- Draft preview は `draftToCandidate(draft).chords` を再生対象にする。
- 元 MIDI voicing が編集後コードと整合する場合は保持し、整合しない場合は生成 voicing へ
  fallback する。
- Manual Draft と自動候補の双方が `CaptureView.saveNew()` /
  `CaptureView.appendExisting()` へ到達する。
- Store の保存 action は `applyVaultChange()` を通り、autosave 経路を利用する。
- Manual Draft の保存後データは Vault 再読込、Chord Dojo、Mix preflight で利用可能な
  既存 `SavedProgressionBlock` 形式になる。

### 未実装・相違

- 自動候補と手動 Draft の保存前変換は別経路である。
- A/B preview（元 MIDI と編集後 Draft の明示切替）は無い。
- source candidate snapshot が無いため、未編集 Draft の保存同一性を Draft 単体では
  保証できない。
- preview/save consistency は手動 Draft の単体テストがあるが、自動候補を Draft 化した
  統一経路のテストは無い。

根拠:

- `src/domain/midi/manualDraftPlayback.ts`
- `src/domain/midi/manualDraftEditing.ts`
- `src/domain/midi/manualDraftSave.test.ts`
- `src/views/CaptureView.tsx`
- `src/store/vaultStore.ts`

## UI / Keyboard / Accessibility

### 実装済み

- Full Timeline の bar button を pointer drag して範囲選択できる。
- 開始・終了 bar/beat を入力できる。
- `Esc` で選択解除、`Enter` で Draft 作成、矢印キーで終端調整ができる。
- 自動候補 Card には展開時の `Escape`、Undo/Redo、矢印、`Space`、`Delete` がある。

### 未実装・相違

- Candidate click が Draft 作成へ直結しない。
- Full Timeline 上に開始・終了ハンドル、長さ、event 数を常時表示しない。
- `G` / `Shift+G` の snap 切替は無い。
- Phase 4.2 の範囲 keyboard 操作一式は未実装。
- Draft を一覧・Timeline・Editor 間で保持する上位 session state は無い。
- dirty Draft から別 candidate へ移る際の統一確認は無い。
- A/B preview の keyboard 操作は無い。

根拠:

- `src/components/TimelineRangeSelector.tsx`
- `src/components/ManualCandidateEditor.tsx`
- `src/views/CaptureView.tsx`

## レイヤ分離

- `src/domain/midi/manualDraft*.ts` と `src/domain/progressionEditing/*` は React、
  Zustand、Tauri API を import していない。
- UI のローカル state とイベント処理は `src/components/*` と
  `src/views/CaptureView.tsx` にある。
- Vault 永続化は Zustand store の `applyVaultChange()` 以降に閉じ込められている。
- Draft 自体は session-only で、Vault schema/data.json には保存されていない。

この分離は Phase 4.2 でも維持できる。Draft 作成、snapshot、履歴、範囲・境界操作は
domain 純関数に置き、Capture の active Draft だけを UI state で保持するのが既存構造に
最も近い。

## 既存テスト

主な関連テスト:

- `src/domain/midi/timelineRangeSelection.test.ts`
- `src/domain/midi/manualRange.test.ts`
- `src/domain/midi/manualRangeProperty.test.ts`
- `src/domain/midi/manualDraftEditing.test.ts`
- `src/domain/midi/manualDraftSave.test.ts`
- `src/components/TimelineRangeSelector.test.tsx`
- `src/components/ManualCandidateEditor.test.tsx`
- `src/domain/progressionEditing/editHistory.test.ts`
- `src/views/CaptureView.test.tsx`
- `src/views/CaptureView.lanes.test.ts`

現時点で、automatic candidate -> Draft、混在履歴、範囲ハンドル、境界 drag、
Delete/Merge の複数 semantics、A/B preview、Draft session retention のテストは無い。

## P4.2-01 以降の確定差分

1. `ManualCandidateDraft.source` を `CandidateDraftSource` へ拡張する。
2. `snapMode` と optional な `sourceCandidateSnapshot` を追加する。
3. `createDraftFromCandidate()` を純関数として追加する。
4. Capture 上位に active Draft を一つだけ置く。
5. 自動候補と手動範囲を同じ `ManualCandidateEditor` と同じ保存変換へ通す。
6. Catalog、Recommendation、Pattern、Occurrence は Draft 作成時に変更しない。
7. 既存 `editHistory` を Draft snapshot 履歴へ一般化し、上限を 64 にする。
8. 範囲、snap、コード操作を同じ履歴に記録する。
9. 範囲ハンドル、境界 drag、明示的 Delete/Merge、Toast、A/B preview を順に追加する。

## 変更禁止事項の確認

- `defaultAnalyzerMode` は `phase4-v1` のまま。
- `fileVersion` は `1` のまま。
- Vault schema は変更しない。
- MIDI parser、コード検出、root/quality/tension、Candidate Catalog の生成ロジックは
  Phase 4.2 の変更対象外。
- private MIDI と `.local-evaluation/` は Git 管理しない。

