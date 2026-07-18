# Loop Vault Phase 3.7.1.1 作業報告書

作業日: 2026-07-18  
対象: Progression Detail / Capture のコード選択・編集 UX、代替候補、Vault 既定表示

## 1. 実装結果

Phase 3.7.1.1 では、保存済み進行と MIDI 解析候補のコード編集を同じ操作体系へ揃え、選択状態が保存後に先頭へ戻る不具合を修正した。

- コードカードの選択、編集、試聴、保存を同じ `selectedSlotId` 基準へ統一した。
- 保存しても現在のコード選択を維持し、保存済み状態を新しい編集基準として再設定するようにした。
- Progression Detail と Capture のカード操作を、クリック・矢印キー・Space・Enter・右クリックで共通化した。
- Quick Chord Editor の代替候補を最大 5 件へ拡張した。
- Vault の進行表示は「ライブラリ」を既定とし、「一覧」の選択は同一セッション内だけ復元するようにした。
- `data.json`、永続化 schema、`fileVersion`、MIDI 解析モード、解析重みは変更していない。

主な入口:

- `src/views/ProgressionDetailView.tsx`
- `src/views/CaptureView.tsx`
- `src/components/progression-editing/EditableChordCard.tsx`
- `src/components/progression-editing/EditableProgressionGrid.tsx`
- `src/components/progression-editing/QuickChordEditor.tsx`
- `src/views/VaultView.tsx`

## 2. 原因調査

監査結果は `docs/phase3.7.1.1-selection-audit.md` に記録した。

実装前からカード表示、Grid、Quick Chord Editor 自体は存在していた。実際の問題は次のとおりだった。

1. 保存成功時に編集セッションを作り直していたため、選択中コードが先頭へ戻っていた。
2. 不正な選択 ID を描画時に先頭カードへ見かけ上フォールバックしており、状態と表示がずれる余地があった。
3. Progression Detail にカード間の矢印移動と Space 試聴が接続されていなかった。
4. Capture が `selectedChordIndex` と `selectedSlotId` の二重状態を持っていた。
5. MIDI 解析の上流で代替候補を 2 件へ制限していたため、Quick Editor 側だけ件数を増やしても 5 件を表示できなかった。
6. Vault の初期表示は「一覧」で、ライブラリを主導線にした Phase 3.7.1 の意図と一致していなかった。

## 3. F1 選択状態の一元化

対象:

- `src/domain/progressionEditing/editableProgression.ts`
- `src/domain/progressionEditing/splitMerge.ts`
- `src/views/ProgressionDetailView.tsx`
- `src/views/CaptureView.tsx`

実装内容:

- `selectedEditableSlotIndex` を追加し、ID から安全に現在位置を導出するようにした。
- `markEditableProgressionSaved` を追加した。保存時は現在の chord 配列を新しい saved baseline とし、Undo/Redo 履歴を空にしつつ `selectedSlotId` を維持する。
- Capture の `selectedChordIndex` を削除し、カード位置は `selectedSlotId` から導出するようにした。
- 候補切替時の編集セッション再生成から言語設定依存を外した。
- 選択カード削除後は次のカード、存在しなければ前のカードを選ぶ。

結果として、2枚目以降のコードを選択して編集・保存しても、選択が先頭へ戻らなくなった。

## 4. F2 カード編集 UX の共通化

対象:

- `src/components/progression-editing/EditableChordCard.tsx`
- `src/components/progression-editing/EditableProgressionGrid.tsx`
- `src/views/ProgressionDetailView.tsx`
- `src/views/CaptureView.tsx`

共通操作:

| 操作 | 挙動 |
|---|---|
| クリック | カードを選択 |
| 左 / 上矢印 | 前のカードへ移動 |
| 右 / 下矢印 | 次のカードへ移動 |
| Space | 選択コードを試聴 / 停止 |
| Enter | Quick Chord Editor を開く |
| Shift+F10 / 右クリック | Quick Chord Editor を開く |
| hover の編集ボタン | Quick Chord Editor を開く |

- カードは roving focus を使い、選択カードだけを通常の Tab 順へ置く。
- IME composition 中のキー操作は編集ショートカットとして処理しない。
- Progression Detail の大きな要約表示を抑え、カード Grid を編集の主画面として見せるようにした。
- Capture と Progression Detail は同じ Grid の選択・移動・試聴経路を使う。

## 5. F3 代替候補を最大5件へ拡張

対象:

- `src/domain/chordAlternatives.ts`
- `src/domain/midi/legacy.ts`
- `src/domain/midi/candidateDiversity.ts`
- `src/domain/midi/hybrid.ts`
- `src/domain/midi/merge.ts`
- `src/domain/midi/legacyBoundaryReranker.ts`
- `src/components/progression-editing/QuickChordEditor.tsx`
- `src/components/progression-editing/ChordAlternativeList.tsx`

`selectQuickChordAlternatives` を追加し、Quick Editor 用候補を決定的に最大 5 件選ぶようにした。

- 現在の主コードは候補から除外する。
- 表示 `label` の違いだけでは別候補にしない。
- root / bass を正規化し、tensions を重複除去・ソートして同値判定する。
- slash bass の違いは別候補として維持する。
- confidence 順を基礎に root / quality / bass の多様性を確保する。
- MIDI 解析の表示 confidence は従来どおり 0〜1 へ clamp する。
- legacy の候補順位には clamp 前 score を使い、表示 confidence と順位情報を分離する。

既存の保存データに候補が 2 件しかなければ 2 件だけ表示する。存在しない候補は生成しない。

## 6. F4 Vault の既定表示

対象: `src/views/VaultView.tsx`

- 表示切替を「ライブラリ」「一覧」の順に変更した。
- 初回表示は「ライブラリ」に変更した。
- ユーザーが選んだ表示モードは `sessionStorage` の `loop-vault.progression-view-mode` に保存する。
- モードは同一アプリセッション内だけ復元し、`data.json` には保存しない。
- 表示切替では検索、長さ、並び順、お気に入り、Key、元 MIDI、タグ、カテゴリの各条件を維持する。
- `sessionStorage` が利用できない環境では読み書き失敗を握りつぶし、ライブラリ既定で継続する。

## 7. 永続化・互換性

- `defaultAnalyzerMode = "legacy"` を維持した。根拠: `src/domain/midi/analysis.ts`
- `fileVersion = 1` を維持した。根拠: `src/domain/schema.ts`, `src/domain/types.ts`
- `SavedProgressionBlock`、Vault schema、repository interface は変更していない。
- 編集結果は既存 store action から `applyVaultChange()` と autosave を通る。
- Quick Editor の一時状態、選択中スロット、Vault 表示モードを `data.json` へ追加していない。
- `.local-evaluation` と実 MIDI は Git 管理されていない。
- MIDI parser、Full Timeline、Voice Role、解析重み、Live MIDI、PlaybackController は変更していない。

## 8. テストとQA

2026-07-18 の F5 先端で実施:

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 111 files / 627 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run tauri -- build` | PASS |
| `git diff --check` | PASS |

追加・更新した主な回帰テスト:

- 2枚目以降の選択、編集、保存後も同じスロットを維持する。
- 不正な選択 ID を先頭カードへ暗黙に戻さない。
- カード削除後の選択位置が決定的である。
- Detail の矢印移動、Space 試聴、右クリック編集が動く。
- Quick Editor が最大 5 候補を表示し、重複候補を除く。
- 旧データの 2 候補をそのまま表示する。
- Vault はライブラリが既定で、一覧選択は sessionStorage から復元する。

手動表示確認:

- 1280 x 900: Vault でライブラリが先頭・選択済みであることを確認。
- 表示切替後も検索文字列が保持されることを確認。
- 一覧を選んで再読込し、Vault を開き直すと一覧が復元されることを確認。
- 390 x 844: 横スクロールなし、検索・フィルタ・表示切替の重なりなし。
- ブラウザログに error / warning なし。

手動 QA 環境には保存済み進行がなかったため、実データを使った Detail の目視確認は未実施。カード操作はコンポーネント・View テストで検証している。

## 9. Windows成果物

- 単体 EXE: `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- MSI: `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- セットアップ EXE: `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 10. PR構成

Phase 3.7.1 の既存 stack に、Phase 3.7.1.1 を次の順で積んだ。現時点では main へ未マージ。

| 順 | PR | ブランチ | 内容 |
|---:|---:|---|---|
| 1 | #124 | `docs/p3-7-1-1-f0-selection-audit` | 計画取込と選択経路監査 |
| 2 | #125 | `fix/p3-7-1-1-f1-selection-state` | 選択状態の一元化 |
| 3 | #126 | `fix/p3-7-1-1-f2-detail-card-editing` | Detail / Capture のカード操作統一 |
| 4 | #127 | `fix/p3-7-1-1-f3-five-alternatives` | 代替候補を最大5件へ拡張 |
| 5 | #128 | `fix/p3-7-1-1-f4-library-default` | ライブラリを既定表示へ変更 |
| 6 | #129 | `docs/p3-7-1-1-f5-qa-report` | 最終QAと本報告書 |

完全なマージ順は `#117 -> #118 -> #119 -> #120 -> #121 -> #122 -> #123 -> #124 -> #125 -> #126 -> #127 -> #128 -> #129`。

## 11. 既知の制約

- 古い保存データの代替候補数は再解析しない限り増えない。
- Vault 表示モードは sessionStorage のため、アプリを完全終了するとライブラリ既定へ戻る。
- 進行の検索・フィルタ条件は画面内の表示切替では維持するが、アプリ再起動後の復元対象ではない。
- Vite build は約 837 KB の JavaScript chunk が 500 KB の推奨値を超える警告を出す。ビルド自体は成功している。
- 本 Phase では MIDI コード検出精度、Voice-aware 重み、解析モードの調整を行っていない。

## 12. ユーザー確認推奨

1. 保存済み進行の2枚目以降を選び、編集して保存しても同じカードが選択されたままか。
2. 矢印キーでカード移動、Space で試聴、Enter または右クリックで Quick Editor を開けるか。
3. 実 MIDI の解析結果で代替候補が最大5件表示され、候補をクリックして置換できるか。
4. Vault を開いた直後にライブラリが表示され、一覧へ切り替えても検索・フィルタ条件が残るか。
5. 390px 相当の狭いウィンドウでも操作部が重ならず使えるか。
