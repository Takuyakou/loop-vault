# Loop Vault P4.1.3 最終報告 — Manual Candidate Rescue

- 作成日: 2026-07-26
- **最終的な製品既定: `defaultAnalyzerMode = "phase4-v1"`（変更なし）**
- **Manual Candidate Rescue: 段階昇格（既定で利用可能）**
- Stage F: **未着手**

---

## 1. PR #195 / #196 / #197 のマージ状態

すべて **MERGED**。

ただし #196 と #197 は、ベースにしていたスタックブランチへマージされたため master に届いていなかった。同じコミットを **#198** で master へ取り込んだ（作り直しではない）。

| PR | 内容 | 状態 |
|---|---|---|
| #195 | P4.1.2-H4 | MERGED |
| #196 | M0 | MERGED（→ #198 で master へ） |
| #197 | M1 | MERGED（→ #198 で master へ） |

---

## 2. M2〜M5 の PR 一覧

| PR | Stage | 内容 |
|---|---|---|
| [#198](https://github.com/Takuyakou/loop-vault/pull/198) | M0/M1 | master への取り込み |
| [#199](https://github.com/Takuyakou/loop-vault/pull/199) | **M2** | Full Timeline 範囲選択UI |
| [#200](https://github.com/Takuyakou/loop-vault/pull/200) | **M3** | Manual Candidate Editor 統合 |
| [#201](https://github.com/Takuyakou/loop-vault/pull/201) | **M4** | 試聴・保存・Catalog連携 |
| [#202](https://github.com/Takuyakou/loop-vault/pull/202) | **M5** | 評価・段階昇格・Closeout |

---

## 3. 各 commit

```text
54c5d22  P4.1.3-M0: 手動修正コストのbaselineを測る
776b47b  P4.1.3-M1: 任意範囲からCandidateを作る
b04b147  P4.1.3-M2: Full Timelineから範囲を選ぶ
fa4af94  P4.1.3-M3: Draftを既存Editorへつなぐ
7a6d4ad  P4.1.3-M4: Draftを試聴して通常経路で保存する
（M5）    P4.1.3-M5: Manual Recoverability契約と段階昇格
```

force-push なし、公開履歴の書き換えなし、`git add -A` なし。

---

## 4. M0 の10区間の修正コスト

| 区間 | 小節 | 現行UI（M0時点） | 範囲選択 | コード編集 | 合計 |
|---|---|---|---|---|---|
| H3_clean sec2 | **19** | **表現不能** | 1 | **0** | **1** |
| H3_clean sec6 | **22** | **表現不能** | 1 | **0** | **1** |
| H3_stress sec2 | **19** | **表現不能** | 1 | **0** | **1** |
| H3_stress sec6 | **22** | **表現不能** | 1 | **0** | **1** |
| S14_clean b2 | 4 | 表現不能 | 1 | 0 | 1 |
| S16_clean verse | 8 | 表現不能 | 1 | 0 | 1 |
| S16_clean chorus1 | 8 | 表現不能 | 1 | 0 | 1 |
| S16_clean chorus2 | 8 | 表現不能 | 1 | 0 | 1 |
| S16_stress verse | 8 | 表現不能 | 1 | 0 | 1 |
| S24_stress sec6 | 20 | 表現不能 | 1 | 5 | 6 |

**0/10 → 10/10。平均 1.5 操作、中央値 1 操作。**

---

## 5. Full Timeline 完全性

| | 件数 |
|---|---|
| 必要なコードがすべて Timeline に存在 | **9/10** |
| 不完全 | 1（S24_stress sec6） |

H3 の4区間では **Timeline イベント数と Gold コード数が完全一致**（19対19、22対22）。H4 の FAIL は窓が作られなかっただけで、**検出は成功していた**。

---

## 6. 19小節の結果

`H3_clean sec2` / `H3_stress sec2`（14〜32小節）

- 範囲選択 **1回**
- コード編集 **0回**
- Gold と**完全一致**
- Preview → 保存 → 再読込 すべて成功

---

## 7. 22小節の結果

`H3_clean sec6` / `H3_stress sec6`（87〜108小節）

- 範囲選択 **1回**
- コード編集 **0回**
- Gold と**完全一致**
- Preview → 保存 → 再読込 すべて成功（保存後の `startBar`/`endBar` = 87/108 を再パースで確認）

---

## 8. 11 / 13 / 17 / 21 / 23 / 27小節の結果

`manualRangeProperty.test.ts` で、休符・1小節2コード・持続コードを含む96小節の素材に対し、**あらゆる開始位置**で検証。

| 長さ | 結果 |
|---|---|
| 11 / 13 / 17 / **19** / 21 / **22** / 23 / 27小節 | **全開始位置で PASS**（Draft作成・保存可） |

---

## 9. 任意長 property test

2つの独立した方法で確認した。

| 方法 | 結果 |
|---|---|
| コーパス総当たり（1〜64小節 × 開始位置7小節刻み） | **910/910 範囲成功、64種類の長さ** |
| seed固定 property test（seed `20260726`、300範囲） | 使用可能範囲 200件超・長さ40種超ですべて PASS |

**製品コードに長さ別の分岐は無い。**

---

## 10. Range UI

Full Timeline の下に **「範囲から候補を作成」**。

| 方法 | 用途 |
|---|---|
| 小節ストリップのドラッグ | 対象が画面内 |
| 数値入力（開始小節・拍 / 終了小節・拍） | 遠い2点、長尺MIDI、ポインタなし |

| キー | 動作 |
|---|---|
| Esc / Enter | 選択解除 / 確定 |
| Shift + ←→ | 終端を1拍 |
| Alt + ←→ | 終端を1小節 |

小節は `button` で Tab 到達可能、選択状態は `aria-pressed` と**下線**の両方、`aria-live="polite"` で読み上げ。

---

## 11. Editor 統合

**編集ロジックを1行も新規実装していない。** 置換・挿入・削除・分割・結合・Undo/Redo・グリッド描画はすべて既存の `progressionEditing/` を通る。M3 が足したのは変換のみ。

範囲伸縮は8方向（開始/終了 × 1拍/1小節 × 前/後）+ 「Full Timelineで選び直す」。

---

## 12. コード追加・削除・置換・分割・結合

| 操作 | 実装 | テスト |
|---|---|---|
| 置換 | `chordReplacement.ts` | PASS |
| 挿入 | `splitMerge.ts` | PASS |
| 削除 | `splitMerge.ts` | PASS |
| 分割 | `splitMerge.ts` | PASS |
| 結合 | `splitMerge.ts` | PASS |
| N.C. | 保存時に正当な値として通す | PASS |

保存前検証は、**gap と overlap を警告に留め**（休符もコードの鳴り残しも実際の音楽がやること）、読み戻せないもの（長さ0・範囲外・順序逆転・ID重複・読めないコード名）だけを拒否する。

---

## 13. Undo / Redo

既存の `editHistory.ts` をそのまま使用。初期状態で両方 disabled、編集後に undo が有効化、undo→redo で元に戻ることをテスト済み。`repairOperations` には記録するが**編集数には数えない**。

---

## 14. Preview source

| 優先順位 | 条件 |
|---|---|
| 1. 元 MIDI voicing | `capturedForChordKey` がコードと一致 |
| 2. 自動生成 | コード置換等で一致しなくなった場合 |

製品の既存ルール（`resolveVoicingForUse`）そのまま。M4 が足したのは判断ではなく**表示**:

```text
ボイシング: 元MIDI
ボイシング: 自動生成（コード編集後）
```

---

## 15. 保存前後 Preview 一致

`draftPreviewTimeline(draft)` が返す**同じ配列**を、Editor・Preview・保存のすべてが使う。2つの経路がたまたま一致しているのではなく構造的に同一。保存後のブロックと直接比較するテストで固定した。

---

## 16. Vault 保存

既存の通常経路のみ。`ManualCandidateEditor` は repository に触れない。

```text
Manual Draft → draftToCandidate() → saveNew() / appendExisting()
             → createIdeaFromDraft() / appendBlockToIdea()
             → applyVaultChange() → autosave
```

自動候補カードと**同じ `SaveProgressionPopover`、同じハンドラ**。タイトル・Key・BPM・tag・次の一手は既存の入力欄がそのまま担う。

---

## 17. 再読込

保存 → JSON化 → `vaultFileSchema.parse` → 比較で往復を確認。コード列・`startBar`・`endBar` すべて一致。`fileVersion` は **1**。

---

## 18. Chord Dojo 連携

保存されたものは**普通の `SavedProgressionBlock`** で `idea.progressionBlocks` の一員になる。Practice / Mix / Progression Detail はいずれもこの配列を読むので、**手動で作られたことを誰も知る必要がない**。

テストで確認: `block.id` 存在、全コードが parser を通る、全 `durationBeats > 0`、Idea に BPM と Key が載る。

---

## 19. Mix Session preflight

`preflightMixSession` は `progressionBlocks` から構築された参照を受け取る。手動ブロックは普通のブロックなので、**選択対象として自動ブロックと区別されない**。preflight 自体のロジックは本 Phase で変更していない。

---

## 20. `repairableWithin2Edits`

**9/10**（S24_stress のみ 6操作）

---

## 21. `repairableWithin5Edits`

**9/10**（同上）

---

## 22. `meanManualRepairOperationCount`

**1.5**（中央値 **1**）

M0 時点の比較対象:

| 設計 | 平均操作数 |
|---|---|
| 現行UI（M0時点） | **表現不能**（0/10） |
| 境界ドラッグ案 | 3.9 |
| **範囲選択（採用）** | **1.5** |

---

## 23. Catalog Safety 結果

| 項目 | 結果 |
|---|---|
| 全生成 Pattern 到達 | PASS |
| 全 Occurrence 到達 | PASS |
| Pattern 重複 0 | PASS |
| exact duplicate 0 | PASS |
| Recommendation padding 0 | PASS |
| Endless Critical Guard | PASS |
| clean 8-bar 推薦1件 | PASS |
| Chord Drip Timeline 100/100 | PASS |
| **Draft 作成前後で Pattern 数不変** | **PASS 10/10** |
| **Draft 作成前後で Recommendation 完全一致** | **PASS 10/10** |

P4.1.3 は Catalog / Recommendation / 選定ロジックを1行も変えていない。

---

## 24. Manual Recoverability Hard Gate

**17項目すべて PASS。** 詳細は `05-manual-recoverability-contract.md` §2。

主要項目: 範囲表現 10/10、任意長 910/910（64長）、Editor到達 10/10、Preview 10/10、保存 10/10、決定性 10/10、Timeline 100/100、private MIDI 0件、Tauri build PASS。

---

## 25. Endless の結果

H4 で確認済み、本 Phase で変更なし。

| 項目 | 結果 |
|---|---|
| Catalog | **1777 Pattern 全件保持** |
| 重複カード | 0 |
| 上位3件 | **すべて progression（16/17/20小節）** |
| Em11/A の2小節vamp | Catalog に残り、上位には出ない |

---

## 26. SURAN の結果

H4 で確認済み。Catalog 1352 Pattern（進行1102 / 断片134 / 判定保留116）、重複0、padding 0、解析 180.4 ms。

---

## 27. Chapter 3 の結果

H4 で確認済み。12ファイルで推薦 **1〜2件**、停止理由は `all-eligible-used`（上限ではなく素材が尽きた）、padding は 12/12 で 0。

---

## 28. Chord Drip 非回帰

**100/100 完全一致**（`phase4-v1` vs `phase4.1.2-v1` の `fullTimeline`）。M5 で再実行し `05-timeline-non-regression.json` に記録。

---

## 29. Tauri build

**PASS。**

```text
Built application at: src-tauri/target/release/loop-vault.exe
Finished 2 bundles at:
  Loop Vault_0.1.0_x64_en-US.msi
  Loop Vault_0.1.0_x64-setup.exe
```

---

## 30. 全テスト結果

| コマンド | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | **1427 passed / 177 files** |
| `cargo test` | PASS |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | clean |
| `npm run check:staged` | clean |

P4.1.3 で追加したテスト: **124件**（M2 55 / M3 45 / M4 10 / M5 14）。

---

## 31. 最終 default

```ts
defaultAnalyzerMode = "phase4-v1";   // 変更なし
```

| 項目 | 状態 |
|---|---|
| `defaultAnalyzerMode` | **`phase4-v1`（変更なし）** |
| Candidate Catalog | `phase4.1.2-v1` 系で opt-in |
| Recommendation | 単段方式 |
| **Manual Candidate Rescue** | **既定で利用可能** |
| G2（two-pass） | opt-in のまま |
| `phase4.1-v1` | 削除していない |
| 保存schema / `fileVersion` | 無変更 / 1 |

**手動救済は Analyzer モードに依存しない。** Full Timeline があれば動くので既定を変えずに昇格できる。

---

## 32. rollback 方法

| 範囲 | 手順 |
|---|---|
| M5 のみ | PR #202 を revert |
| M4 | PR #201 を revert |
| M3 | PR #200 を revert |
| M2 | PR #199 を revert |
| M0/M1 | PR #198 を revert |
| P4.1.3 全体 | #198〜#202 を新しい順に revert |

保存データの移行なし（`fileVersion` 1、schema 無変更）。手動候補を保存済みでも、保存物は普通の `SavedProgressionBlock` なので revert 後も読める。

---

## 33. Stage F 未着手確認

**未着手。** 以下は本 Phase で修正していない。

`D/E → Em11` / `E/F# → F#m11` / rootless + walking bass / tension脱落 / 転回形誤認 / arpeggio過分割 / humanized overlap / root選択と `qualityEvidence` の分離 / `derived-length` のセグメンタ境界依存

P4.1.3 が保証するのは、**これらの誤りが残っていてもユーザーが手動で直して保存できること**である。実測された影響は `05-manual-recoverability-contract.md` §7。

---

## 34. private MIDI 未混入

```bash
git ls-files "*.mid" "*.midi"
```

**0 files。** Gate としても測定し PASS。診断JSONには fingerprint・byte長・集計値のみで、MIDIバイト列・絶対パス・個人ファイル名は含まれない。

---

## 35. 最終 PR URL

**https://github.com/Takuyakou/loop-vault/pull/202**

---

## 付録: 実装中に見つけて直した不具合3件

いずれもテストで露見したもので、テストが無ければ気づかなかった。

### 1. 入力した開始小節が終了小節になっていた（M2）

ドラッグと数値入力を同じ正規化に通していたため、空の状態で「開始小節=14」と入れると**開始1・終了14** に並べ替えられた。ドラッグには向きが無く入力にはある、という違いで経路を分けた。

### 2. `identityKey` に表示ラベルを書いていた（M3）

署名の元になる値なので、`Gbadd9` と `F#add9` が別物になり、**編集していないコードまで「編集された」と判定**され、範囲変更時の編集引き継ぎ検出が全滅していた。

### 3. 編集が保存時に消えていた（M4）

`toSavedProgressionBlock` は `...event.source` を展開する。`source` は元の Timeline イベントなので、**ユーザーがコードを置換して保存すると保存されるのは検出されたコード**だった。画面では正しく見え、試聴でも正しく鳴り、**再読込した瞬間に消える**。3件のうち最も深刻で、回帰テストとして固定した。
