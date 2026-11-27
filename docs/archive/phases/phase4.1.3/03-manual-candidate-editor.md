# Loop Vault P4.1.3-M3 — Manual Candidate Editor 統合

- 作成日: 2026-07-26
- `defaultAnalyzerMode` は `phase4-v1` のまま
- 自動Catalog / Recommendation / Timeline / 保存schema は無変更

---

## 1. 編集ロジックを新しく書いていない

Draft の編集は、保存済み進行の画面が使っているものと**同じ関数**を通る。

| 操作 | 実装場所 | 新規実装 |
|---|---|---|
| コード置換 | `progressionEditing/chordReplacement.ts` | なし |
| 挿入 | `progressionEditing/splitMerge.ts` | なし |
| 削除 | 同上 | なし |
| 分割 | 同上 | なし |
| 結合 | 同上 | なし |
| Undo / Redo | `progressionEditing/editHistory.ts` | なし |
| グリッド描画 | `EditableProgressionGrid` | なし |

M3 が足したのは**変換**だけである。

```text
ManualCandidateDraft
  → draftToCandidate()   ProgressionBlockCandidate へ
  → createEditableProgression()   既存のEditor状態へ
  → （既存の編集操作）
  → applyEditableToDraft()   Draftへ書き戻す
```

同じ編集を2度実装すれば、バグも2組になる。

---

## 2. Editorへ渡すのは範囲内に切り詰めたイベント

`occurrenceToCandidate` は `event.source`（元のTimelineイベント）を渡す。範囲が小節の途中から始まる場合、その元イベントは範囲より前から始まっている。**そのままEditorへ渡すと、ユーザーが選んでいない小節を編集対象として見せることになる。**

`draftToCandidate` は Draft 自身の切り詰め済みイベントから `ChordTimelineItem` を組み直す。テストで直接主張している:

```ts
// 元コードは1小節目から鳴っているが、選択範囲は3小節目から
expect(candidate.chords[0].bar).toBe(3);
expect(candidate.chords.every((item) => item.bar >= 3 && item.bar <= 5)).toBe(true);
```

---

## 3. 実装中に見つけた不具合

`applyEditableToDraft` が `identityKey` に**表示ラベル**を書き込んでいた。

`identityKey` は綴りに依存しない同一性で、`structuredSignature` / `relativeSignature` がこれを元に作られる。ラベルを入れると:

- `Gbadd9` と `F#add9` が別のイベントになる
- 署名が壊れ、手動ブロックが既存Patternと一致しなくなる
- **編集していないコードまで「編集された」と判定される**

3つ目は「範囲を変えたときに引き継ぐ編集」の検出を全滅させる。`chordIdentityKey(normalizeChordLabel(label))` へ直した（`buildCandidateEvents` と同じ導出）。

なお、この不具合を最初に見逃したのは**私のテスト用フィクスチャが悪かった**ためでもある。置換先に `Bbmaj7` を選んでいたが、その小節の元コードがちょうど `Bbmaj7` で、「置換した」はずのイベントが元と同一だった。フィクスチャを直し、置換先が元と異なることを明示的にassertするようにした。

---

## 4. 範囲の伸縮

8つのボタン（開始/終了 × 1拍/1小節 × 前/後）と「Full Timelineで選び直す」。

範囲を変えると**元のTimelineから作り直す**。現在のイベントから伸ばそうとしても、範囲を広げたときに入ってくるコードは Draft に存在しないので上流にしかない。

### 編集を残すか捨てるかは必ず聞く

**安全な既定が存在しない。**

- 残す → 新しい範囲に無い小節へ編集が付いていることがある
- 捨てる → ユーザーの作業が消える

どちらも黙ってやってよいものではないので、編集がある状態で範囲を変えようとしたときは確認ダイアログを出す。残す場合、新しい範囲に収まらなかった編集の件数（`droppedEditCount`）を返すので、失われた分を伝えられる。

---

## 5. 保存前の検証

| 種別 | 内容 |
|---|---|
| **エラー**（保存不可） | 長さ0、範囲外、順序逆転、ID重複、読み取れないコード名 |
| **警告**（保存可） | 前のコードとの空き（gap）、前のコードとの重なり（overlap） |

**gap と overlap を禁止していない。** 休符を挟むのも、コードが次まで鳴り続けるのも実際の音楽がやることで、禁止すればEditorは開いた曲そのものを記述できなくなる。拒否するのは「読み戻せないもの」だけである。

`N.C.` は正当な保存対象として通す。

---

## 6. M0の10区間 — select → draft → editor を通した実測

`scripts/verify-manual-draft-repair.ts` → `03-manual-draft-repair.json`

| コーパス | 区間 | 小節 | Editor到達 | Gold一致 | 残るコード編集 | 保存可 | 合計操作 |
|---|---|---|---|---|---|---|---|
| holdout-v3 | H3_clean sec2 | 19 | 19 slots | **一致** | 0 | ok | **1** |
| holdout-v3 | H3_clean sec6 | 22 | 22 slots | **一致** | 0 | ok | **1** |
| holdout-v3 | H3_stress sec2 | 19 | 19 slots | **一致** | 0 | ok | **1** |
| holdout-v3 | H3_stress sec6 | 22 | 22 slots | **一致** | 0 | ok | **1** |
| SGC v1 | S14_clean b2 | 4 | 4 slots | **一致** | 0 | ok | **1** |
| SGC v1 | S16_clean verse | 8 | 8 slots | **一致** | 0 | ok | **1** |
| SGC v1 | S16_clean chorus1 | 8 | 8 slots | **一致** | 0 | ok | **1** |
| SGC v1 | S16_clean chorus2 | 8 | 8 slots | **一致** | 0 | ok | **1** |
| SGC v1 | S16_stress verse | 8 | 8 slots | **一致** | 0 | ok | **1** |
| SGC v1 | S24_stress sec6 | 20 | 20 slots | 不一致 | 5 | ok | 6 |

**Editor到達 10/10、Gold一致 9/10、2操作以内 9/10、平均1.5操作。**

**H3 の19小節・22小節は編集0回で Gold と完全一致する。** M3 の受け入れ条件どおり。

S24_stress は `A7#5` を `A7` と検出している件で、5箇所の置換が必要。**保存は可能**（`canSave: true`）なので、手動救済の経路自体は通っている。これは Stage F の対象であり、M0 以来一貫して同じ数字が出ている。

---

## 7. テスト（新規45件）

`manualDraftEditing.test.ts`（26件） / `ManualCandidateEditor.test.tsx`（19件）

| 観点 | 内容 |
|---|---|
| 既存Editor経由 | 置換・分割・結合・削除・挿入・Undo・Redo |
| 変換 | 範囲内へ切り詰め、範囲途中開始でも選択外の小節を出さない |
| 範囲伸縮 | 拡大で上流のコードが入る、縮小、8方向のnudge |
| 編集の引き継ぎ | 残す／捨てる、収まらなかった件数の報告、確認ダイアログ、キャンセル |
| 検証 | 長さ0・範囲外・順序・ID重複・読めないコード名・N.C.許容・gap警告・overlap警告 |
| 操作記録 | `split-event` / `merge-events` / `undo` / `redo` が残り、undo/redoは編集数に数えない |

---

## 8. M3 受け入れ条件

| 条件 | 結果 |
|---|---|
| M0の10区間すべてDraftとして編集画面へ到達 | **PASS 10/10** |
| H3の19・22小節は編集0回でGold一致 | **PASS 4/4** |
| 残り不一致区間の実際の編集操作数を測定 | **PASS**（S24_stress = 5編集 / 合計6操作） |
| 既存Editor機能の非回帰 | **PASS**（既存テスト全通過、編集ロジック未変更） |
| Undo/Redo | **PASS** |
| 自動Catalog不変 | **PASS**（M2のassertを維持、Draftは別経路） |

---

## 9. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1403 passed (174 files)** / `npm run build` PASS / `cargo test` PASS

---

## 10. M4 への引き渡し

Editor の「試聴」「Vaultに保存」ボタンは `onPreview` / `onSave` を呼ぶだけで、まだ何にもつながっていない。M4 がそこへ試聴と通常の保存経路をつなぐ。

M1 から持ち越している宿題も M4 で片付ける: **手動Draftは自動Catalogへ入れないので、quality floor をバイパスする必要はない**。`score: 0` 問題は経路の分離で解ける。
