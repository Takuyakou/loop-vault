# Loop Vault Phase 3.6.3 実装報告書

## 1. 概要

Phase 3.6.3では、MIDI解析結果の候補を眺めるだけだったコード採集画面を、コードカードを直接選択して試聴・修正・保存できる「Progression Editing Workspace」へ拡張した。

実装後の主な操作は次のとおり。

- 候補内のコードカードを直接クリックして選択・試聴する
- 元の検出値と現在値、信頼度、警告、解析候補をInspectorで比較する
- 解析候補、コード名の直接入力、Root / Quality / Bassからコードを変更する
- 変更後の単一コードまたは進行全体を試聴する
- Undo / Redo、個別リセット、全リセットを行う
- コード区間を分割、前後と結合、削除する
- 保存前に変更一覧を確認し、編集後のコード列を新規Ideaまたは既存Ideaへ保存する
- 保存に成功した修正だけをanalysis feedbackへ記録する

MIDI解析アルゴリズム、`defaultAnalyzerMode`、Vaultの`fileVersion`、既存の永続化方式は変更していない。

## 2. Stage別の実装

| Stage | Commit | PR | 実装内容 |
|---|---|---|---|
| 0 | `5073665` | [#53](https://github.com/Takuyakou/loop-vault/pull/53) | Loop VaultとChord Dripの既存資産、保存経路、feedback、リスクを監査 |
| 1 | `ac5c311` | [#54](https://github.com/Takuyakou/loop-vault/pull/54) | 編集用ドメインモデル、置換、リセット、履歴、要約、構造編集、整合性検証 |
| 2 | `756bff6` | [#55](https://github.com/Takuyakou/loop-vault/pull/55) | 選択可能なコードグリッドとInspector shell |
| 3 | `becda78` | [#56](https://github.com/Takuyakou/loop-vault/pull/56) | alternatives、直接入力、比較試聴、適用、Undo / Redo、キーボード操作 |
| 4 | `1c631f4` | [#57](https://github.com/Takuyakou/loop-vault/pull/57) | Root / Quality / Bassによる構造編集 |
| 5 | `20a6f15` | [#58](https://github.com/Takuyakou/loop-vault/pull/58) | 編集後コード列の保存、変更要約、保存成功後feedback |
| 6 | `d948dd7` | [#59](https://github.com/Takuyakou/loop-vault/pull/59) | split / merge previous / merge next / deleteと時間整合性 |
| 7 | `c38bdca` | [#60](https://github.com/Takuyakou/loop-vault/pull/60) | i18n、未保存警告、キーボード仕上げ、レスポンシブ、回帰QA、配布ビルド |
| 追加修正 | `e339a73` | [#62](https://github.com/Takuyakou/loop-vault/pull/62) | 曲全体のコード表示にも進行候補と同じピアノ／エレピ試聴音色UIを追加 |
| 追加修正 | `fa7bbc8` | [#63](https://github.com/Takuyakou/loop-vault/pull/63) | 候補ごとの主要操作をカード上部へ移し、候補ラベルを直下へ再配置 |
| 追加修正 | `c40938b` | [#65](https://github.com/Takuyakou/loop-vault/pull/65) | 曲全体再生の独立停止ボタンを削除し、メイン再生ボタンへ停止を統合 |

前提修正として、曲全体試聴とピアノ音色のPR [#51](https://github.com/Takuyakou/loop-vault/pull/51)、Vaultへの一回保存修正のPR [#52](https://github.com/Takuyakou/loop-vault/pull/52) の上に積み上げている。

## 3. ドメイン設計

編集ロジックは `src/domain/progressionEditing/` に置いた。

- `types.ts`: `EditableChordSlot`、`EditableProgression`、編集operation
- `editableProgression.ts`: 候補から編集状態を作成し、編集結果を候補へ適用
- `chordReplacement.ts`: コード置換、個別リセット、全リセット
- `editHistory.ts`: 最大100操作のUndo / Redo
- `editSummary.ts`: 保存前の差分一覧
- `splitMerge.ts`: split / merge / delete
- `validation.ts`: duration、overlap、ブロック長の整合性検証

`originalChord`と`currentChord`を分離し、解析結果の候補を直接mutateしない。すべての編集関数は新しいobject / arrayを返す。`src/domain/progressionEditing/` はReact、Zustand、Tauri、Tone.js、現在時刻へ依存しない。

## 4. UI構成

編集UIは `src/components/progression-editing/` に分離した。

- `EditableProgressionGrid.tsx`: 選択可能なコードカード列
- `EditableChordCard.tsx`: normal / selected / playing / edited / review状態
- `ChordInspector.tsx`: 元値・現在値・候補・直接入力・構造編集・区間編集
- `ChordAlternativeList.tsx`: analyzer alternativesの選択と試聴
- `ChordStructureEditor.tsx`: Root / Quality / Bass編集
- `ProgressionEditorToolbar.tsx`: Undo / Redo / 全リセット
- `ProgressionEditSummary.tsx`: 保存前変更一覧と個別リセット

候補は同時に1件だけ展開する。未保存変更がある候補から別候補へ移る場合は確認し、キャンセル時は現在の編集と展開状態を保持する。Inspectorは広い画面で右側に表示し、狭い画面では下へ回り込む。

旧来の重複した「編集」パネルは削除し、コードカード直接選択とInspectorへ操作を統一した。

試聴音色は、使えそうな進行候補と「曲全体のコードを見る」の両方で同じ`PreviewSoundSelector`を利用する。どちらでピアノ／エレピを切り替えても共有状態へ反映され、切り替え時は再生中のプレビューを停止する。

候補カードの試聴、Vault保存、保存方法、コード進行コピーはヘッダー右上にまとめた。メイン、イントロ向き、ターンアラウンド等の候補ラベルはヘッダー直下へ移し、主要操作を候補ごとにすぐ確認できる表示順へ変更した。

「曲全体を再生」の右にあった独立した四角い停止ボタンは削除した。再生中はメインボタン自体が「停止」へ切り替わり、同じ位置から停止できる。「曲全体のコードを見る」の標準展開マークは変更していない。

## 5. 編集操作

### コード置換

- analyzer alternativeを選択すると、まず対象コードだけを比較試聴できる
- `parseChordLabel()`を利用してコード名を直接入力できる
- `makeChordSymbol()`を利用してRoot / Quality / Bassから構造化コードを生成する
- 適用前はdraftとして保持し、適用時に履歴へ積む

### 構造編集

- splitは選択区間を中央で2分割する
- mergeは時間的に隣接する前後slotだけを結合する
- deleteはslotが1件だけになる操作を許可しない
- 操作前に再生を停止する
- 操作後も開始位置、duration、overlap、ブロック全長を検証する

### キーボード

- `←` / `↑`: 前のコード
- `→` / `↓`: 次のコード
- `Enter`: コード名入力へフォーカス
- `Space`: 選択コードを試聴
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`: Redo
- `Escape`: 再生停止とInspectorを閉じる
- `Delete`: 選択コードを削除

input、textarea、select、contenteditable、IME変換中はグローバルショートカットを実行しない。

## 6. 保存とfeedback

保存対象は`applyEditableProgression()`で生成した`currentChord`列である。

- 新規Idea: `createIdeaFromDraft()`
- 既存Ideaへの追加: `appendBlockToIdea()`
- 永続化: 既存の`applyVaultChange()`とautosave経路

repositoryへの直接書き込みは追加していない。`appendBlockToIdea()`は対象Ideaがない場合に`false`を返すようにし、保存成功を呼び出し元で判定できるようにした。

analysis feedbackは保存成功後だけ記録する。キャンセル、保存失敗、適用後にresetした変更、差分がない保存は記録しない。保存時には同じslotの最終差分だけを残す。対象はmanual label、alternative selection、structure editorによる修正で、split / merge / delete自体は修正feedbackへ含めない。

## 7. Chord Drip資産の活用

Chord Dripからは、次の設計と操作感をLoop Vault向けに移植した。

- コードカードを直接選択する操作
- selected / playing / editedの状態表現
- Inspectorへ編集操作を集約する構成
- input / IME中にショートカットを無効化する考え方
- Root / Quality / Bassによる編集
- 編集開始時に進行再生を停止する挙動

Chord Drip repositoryへのruntime依存、workspace参照、共通package化は行っていない。Tone.jsの試聴処理は既にLoop Vault側へ適応済みの`src/audio/chordPreview.ts`を再利用した。Chord Drip固有のProgression型、生成ルール、CSS token、RadialChordPaletteは持ち込んでいない。

## 8. テストとビルド

最終確認結果は次のとおり。

| 確認 | 結果 |
|---|---|
| `npm run lint` | 成功 |
| `npm test` | 48ファイル、167テスト成功 |
| `npm run build` | 成功 |
| `npm run tauri build` | 成功 |
| モバイル表示 | 390 x 844、横overflowなし |
| デスクトップ表示 | 1280 x 720、横overflowなし |

追加テストは、編集状態のimmutability、置換、reset、Undo / Redo、履歴上限、split / merge / delete、時間整合性、構造編集、カード選択、Inspector更新、alternative適用、キーボード、英語表示、未保存候補の切り替え警告、編集後保存、保存成功後feedbackをカバーする。

## 9. 配布生成物

2026-07-15の最終ビルドで次を生成した。生成物はGit管理対象外である。

- 本体EXE: `D:/dev/Loop Vault/src-tauri/target-p365/release/loop-vault.exe`
- MSI: `D:/dev/Loop Vault/src-tauri/target-p365/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- セットアップEXE: `D:/dev/Loop Vault/src-tauri/target-p365/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 10. 変更していないもの

- MIDI解析アルゴリズムと既定解析モード
- legacy / hybrid / rerankerの評価フライホイール
- Vaultの`fileVersion`
- `data.json`、atomic save、backup、破損退避
- 解析途中の編集状態とUndo履歴の永続化
- Chord Dripとの直接通信・runtime依存

## 11. 既知の制約

- `CaptureView.tsx`は候補ワークスペースのオーケストレーションと保存ダイアログを引き続き保持しており、計画で推奨された`src/views/capture/`への全面分割は未完了。編集UIそのものは`src/components/progression-editing/`へ分離済みである。
- ブラウザ版ではTauriのファイル選択を利用できないため、解析済み候補を使う編集操作はDOMテストで検証した。実MIDIを使った最終操作確認は配布EXEで行う必要がある。
- Undo履歴はセッション内のみで、候補を閉じる、再解析する、アプリを終了すると失われる。
- split / merge / deleteは修正feedbackの対象外。構造変更後の学習用イベント仕様は今後の設計対象である。

## 12. 手動確認項目

1. MIDIをドロップし、候補を1件だけ展開できること
2. コードカードをクリックすると選択と試聴が行われること
3. alternative、直接入力、Root / Quality / Bassでコードを変更できること
4. 元のコードと変更後のコード、進行全体を試聴できること
5. Undo / Redo、個別リセット、全リセットが機能すること
6. split / merge / delete後も再生と保存ができること
7. 未保存の候補から移動すると確認が出ること
8. 保存後にVaultで編集後のコード列が表示されること
9. 設定で日本語・英語を切り替え、編集UIも切り替わること
