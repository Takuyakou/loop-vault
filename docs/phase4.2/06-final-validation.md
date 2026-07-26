# Phase 4.2 最終検証報告

- 対象ブランチ: `feature/p42-06-final-validation`
- ベース: `feature/p42-05-keyboard-preview-session`
- 検証日: 2026-07-26
- 最終PR: https://github.com/Takuyakou/loop-vault/pull/219

## 結論

Capture Selection Editing は、Automatic Candidate と Manual Range の両方を
`CaptureView.activeDraft` という1つのセッション状態へ接続した。範囲、コード、境界、
Voicing、履歴、A/B試聴、保存は同じ Draft を参照する。

全1633フロントエンドテスト、Rust 24テスト、Lint、型検査、Web build、Tauri build、
実MIDI回帰、100件のChord Drip Timeline比較が通過した。MIDI解析器、Vault schema、
`fileVersion`、既定Analyzerは変更していない。

## Hard Gate

| Gate | 結果 | 根拠 |
|---|---:|---|
| unifiedDraftSourceOfTruth | PASS | `src/views/CaptureView.tsx` の `activeDraft` 1系統 |
| automaticCandidateToDraft | PASS | `automaticCandidateDraft.test.ts`、`CaptureDraftWorkflow.test.tsx` |
| manualRangeToDraft | PASS | `manualRange*.test.ts`、`CaptureDraftWorkflow.test.tsx` |
| unifiedSavePath | PASS | Automatic/ManualともDraftから `saveNew()` / `appendExisting()` |
| rangeUndoRedo | PASS | `captureEditHistory.test.ts` |
| chordUndoRedo | PASS | `captureEditHistory.test.ts`、`ManualCandidateEditor.test.tsx` |
| historyMixedSequence | PASS | 範囲・snap・コード操作の混在履歴テスト |
| boundaryDrag | PASS | `DraftBoundaryHandles.test.tsx` |
| rangeHandle | PASS | `DraftRangeOverlay.test.tsx` |
| previewSaveConsistency | PASS | `manualDraftSave.test.ts`、統合workflow |
| voicingConsistency | PASS | `voicingIdentity.test.ts`、N.C.回帰テスト |
| catalogNonDestructive | PASS | Catalog/Pattern/OccurrenceをDraft作成時に変更しない |
| recommendationNonRegression | PASS | Critical guards 6/6 PASS |
| timelineNonRegression | PASS | Chord Drip 100/100 timeline一致 |
| manualRescueRegression | PASS | 既存Manual Rangeテスト全通過 |
| schemaCompatibility | PASS | schema 25テスト、repository 11テスト |
| fileVersion | PASS | `1` のまま |
| keyboardWorkflow | PASS | A/B、Escape、履歴、メニュー、IME/input guard |
| mouseWorkflow | PASS | 範囲handle、境界drag、context menu |
| accessibility | PASS | button/menu/sliderの名前、focus復帰、keyboard操作 |
| deterministic | PASS | Phase 4 corpus 20件を2回解析して完全一致 |
| privateMidiTracked | PASS | `git ls-files "*.mid" "*.midi"` = 0 |
| tauriBuild | PASS | EXE、MSI、NSISを生成 |
| rollbackAvailable | PASS | P4.2-00〜06を独立したstacked PRで分離 |

## 1. PR一覧

| Stage | Branch | PR |
|---|---|---|
| P4.2-00 | `docs/p42-00-current-state-audit` | #213 |
| P4.2-01 | `feature/p42-01-unified-draft-entry` | #214 |
| P4.2-02 | `feature/p42-02-unified-history` | #215 |
| P4.2-03 | `feature/p42-03-range-and-boundary-editing` | #216 |
| P4.2-04 | `feature/p42-04-context-actions-and-voicing` | #217 |
| P4.2-05 | `feature/p42-05-keyboard-preview-session` | #218 |
| P4.2-06 | `feature/p42-06-final-validation` | #219 |

## 2. Commit一覧

| Stage | Commit | 内容 |
|---|---|---|
| P4.2-00 | `38badf4` | Capture編集の現状監査 |
| P4.2-01 | `c3ee73d` | 自動候補を統合Draftへ接続 |
| P4.2-02 | `a189b6d` | Draft編集履歴を統合 |
| P4.2-03 | `5bf84cd` | 範囲とコード境界の直接編集 |
| P4.2-04 | `17c4d02` | コンテキスト操作とVoicing整合 |
| P4.2-05 | `e444d96` | キーボード試聴とDraft保持 |

## 3. P4.2-00監査

着手前はManual Rangeだけが `ManualCandidateDraft` を持ち、Automatic Candidateは
カード内 `EditableProgression` を直接保存していた。範囲選択、Editor、Automatic Cardで
状態が分散し、統一Undo/Redoとpreview/save一致を保証できなかった。

根拠: `docs/phase4.2/00-current-state-audit.md`

## 4. 再利用したP4.1.3機能

`createManualDraft()`、`draftToCandidate()`、`applyEditableToDraft()`、Manual Candidate
Rescue、既存の純粋なprogression editing関数、StoreのVault保存経路を再利用した。
Manual Rescueを別機能として複製せず、共通Draftの入口として残した。

## 5. 廃止した重複設計

- Automatic Cardごとの保存用ローカル編集状態
- Manual RangeとAutomatic Candidateの別保存変換
- コード履歴と範囲履歴の別管理
- `legacy.ts`等の解析器やCatalogを編集UIから変更する経路

## 6. Source of Truth

セッション中の唯一の編集対象は `CaptureView.activeDraft`。Automatic Candidateは
`createDraftFromCandidate()`、Manual Rangeは `createManualDraft()` から同じ型へ入る。
EditorはDraft snapshotを更新し、Catalogは読み取り専用のまま保たれる。

## 7. Automatic CandidateからDraft

Candidate選択時にsource snapshot、元events、元voicing、範囲、snap modeを持つDraftを作る。
以後のカード編集・範囲編集・保存はすべてこのDraftを通る。

## 8. Manual RangeからDraft

Full Timeline上の任意範囲を選択し、切断したeventsをDraftへ格納する。範囲外eventは
取り込まず、Draft生成時にCatalogへ書き戻さない。

## 9. 統一Save経路

新規保存と既存Ideaへの追記はいずれもDraftを `SavedProgressionBlock` へ変換し、
Store actionから `applyVaultChange()` とautosaveへ到達する。Repository直書きはない。

## 10. Undo / Redo

最大64 snapshotのsession-only履歴を持つ。Undo、Redo、履歴時点へのjump、Redo branch破棄を
実装した。Vaultやdata.jsonには履歴を永続化しない。

## 11. 混在履歴

コード置換、挿入、削除、分割、結合、範囲移動、範囲伸縮、snap変更を同じsnapshot列へ
記録するため、操作種別をまたいでも1回ずつ元へ戻せる。

## 12. 範囲ハンドル

Full Timeline overlayの左右handleでDraft範囲を伸縮できる。新しく含まれたTimeline eventを
取り込み、外れたeventを除去する。lost-editが発生する場合は確認する。

## 13. カード境界drag

隣接コードの境界だけを移動し、左durationと右start/durationを同時更新する。
gap/overlapは作らず、最小durationを下回る位置へは移動しない。

## 14. Snap

`bar`、`harmonic`、`beat` を循環できる。`G` / `Shift+G` で切替、Alt中は一時的に
snapを回避する。snapも履歴へ入る。

## 15. Deleteの4方式

1. 前のコードを延長
2. 次のコードを前へ延長
3. 後続全体を前へ詰めてgapを閉じる
4. 同区間をN.C.へ置換

端で成立しない操作はdisabledとなり、実行結果をToastで説明する。

## 16. Mergeの2方式

左を残して右を吸収、または右を残して左を吸収できる。残す側のChordSymbolと互換な
Voicing Memoryだけを保持する。

## 17. Toast

Delete、Merge、N.C.等の構造変更後に「何をどう変更したか」を短く表示する。
Undo可能な結果だけを通知し、無言で意味を変えない。

## 18. Voicing Memory整合

Splitは両側へ複製、Mergeはsurvivor側を保持、互換性のないコード置換とN.C.は破棄する。
Draft sourceの古いvoicingを復活させる同期ループも修正した。

## 19. A/B Preview

- A: 選択範囲の元MIDI由来Chord/Voicing
- B: 編集済みDraftの保存予定Chord/Voicing

共通Stopを持ち、AはMIDI source voicingがないDraftではdisabled。保存対象は常にB。

## 20. Draft保持

Candidate一覧、Full Timeline、Editorの表示を切り替えてもDraftを保持する。dirty状態で
別Candidateを選ぶ場合は、戻る、破棄して移動、Vaultへ保存して移動を選べる。
保存成功または明示的な終了時だけDraft sessionを閉じる。

## 21. Keyboard一巡

Candidate選択、範囲伸縮、snap、カード選択、context menu、Undo/Redo、A/B、Stop、
保存までkeyboardで到達できる。input、textarea、select、contenteditable、IME中は
Capture shortcutを発火しない。

## 22. Mouse一巡

Candidate選択、範囲handle、境界drag、右クリックmenu、A/B、保存をmouseで実行できる。
context menuは範囲外クリックとEscapeで閉じる。

## 23. Accessibility

主要controlはbutton/menu/slider等のsemantic roleとaccessible nameを持つ。
context menuは矢印移動、Escape、focus returnを備える。390px幅でも横overflowはなかった。

## 24. P4.1.3回帰

Manual Range selection、property test、Manual Candidate Editor、save conversionを含む
既存テストが全通過した。Manual Rescueの入口と保存形式は維持している。

## 25. Endless

154小節、Catalog 1777 Pattern（progression 1167、vamp 2）、推薦10件。
可視Pattern重複0。Top 3は16/17/20小節のprogressionで、2小節vampはCatalogから消していない。

## 26. SURAN

100小節、Catalog 1352 Pattern（progression 1108、fragment 136、uncertain 108）、
推薦10件、可視Pattern重複0。実測Critical GuardはPASS。

## 27. Chapter 3

100ケース、399注釈event。Phase 4 canonical exact 97.73%、legacy 96.46%。
Phase 4はlegacy比 +1.26ポイント。P4.2はAnalyzerを変更していない。

## 28. Chord Drip非回帰

Chord Drip evaluation corpus 100件で、`phase4-v1` と選定拡張後のFull Timelineを比較し、
100/100がevent単位で一致した。

## 29. Chord Dojo

`PracticeView.test.tsx` 51件を含む全テストが通過。Capture shortcutはDojoへ漏れない。

## 30. Mix preflight

`practiceMix.test.ts` 25件と `MixPracticeWorkspace.test.tsx` 11件が通過。
保存後の `SavedProgressionBlock` 契約を変更していない。

## 31. Schema / fileVersion

Vault schema変更なし。`fileVersion` は `1`。Draft履歴、source snapshot、内部編集情報は
data.jsonやexportへ保存しない。旧data.jsonのschema/repositoryテストも通過した。

## 32. Tauri build

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 33. Private MIDI未混入

Endless、SURAN、Chapter 3は `.local-evaluation` から読み、生成した評価JSONも同じ配下へ
保存した。`git ls-files "*.mid" "*.midi"` は0件。

## 34. 最終default

`defaultAnalyzerMode` は `phase4-v1`。Candidate Catalog mode、MIDI parser、Chord detection、
root/quality/tension scoreはP4.2で変更していない。

## 35. Rollback

P4.2-00〜06は依存順のstacked branch/PRで分離した。問題があれば対象stage以降を
取り込まないことで、P4.1.3のManual Rescueへ戻せる。masterへ直接commitしていない。

## 36. 後続バックログ

Phase 4.2の対象外として、複数Draftの同時選択、一括移調・削除、split save、
恒久編集ログ、テレメトリ、高度な周期吸着は未実装。現在の共通Draft基盤上で追加可能。

## 37. 最終PR URL

https://github.com/Takuyakou/loop-vault/pull/219

## 検証結果

| Command / Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | PASS: 192 files / 1633 tests |
| `cargo test` | PASS: 24 tests |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | PASS |
| `git ls-files "*.mid" "*.midi"` | 0 files |
| Desktop 1280px | horizontal overflowなし、console error 0 |
| Mobile 390px | horizontal overflowなし、console error 0 |

既知の警告はViteのJavaScript chunkが500 kBを超える点のみ。Phase 4.2の機能不良ではなく、
既存bundle構成の性能改善候補として残す。
