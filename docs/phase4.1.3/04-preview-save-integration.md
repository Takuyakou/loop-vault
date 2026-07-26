# Loop Vault P4.1.3-M4 — 試聴・保存・Catalog連携

- 作成日: 2026-07-26
- `defaultAnalyzerMode` は `phase4-v1` のまま
- 保存schema・`fileVersion` 無変更（`fileVersion = 1`）

---

## 1. score 0 と quality floor をどう解いたか

**経路を分けた。バイパスも緩和もしていない。**

```text
Manual Candidate Draft
    ↓
Draft専用Editor
    ↓
Preview
    ↓
ユーザーが保存を明示
    ↓
Vault Progression として保存
```

Manual Draft は自動 Catalog へ**入らない**ので、quality floor に当たらない。したがって floor をバイパスする必要も、全体を緩める必要もない。テストで両方を主張している:

```ts
expect(draftToCandidate(draft).selectionScore).toBe(0);   // score 0 のまま
expect(after.catalog.patterns.length).toBe(before.catalog.patterns.length);
expect(JSON.stringify(after.recommendation)).toBe(JSON.stringify(before.recommendation));
```

---

## 2. 保存は既存の経路をそのまま使う

`ManualCandidateEditor` は repository に触れない。自動候補カードが使っているのと**同じ `SaveProgressionPopover` と同じハンドラ**を受け取る。

```text
Manual Draft
→ draftToCandidate()
→ saveNew() / appendExisting()      ← 自動候補と同一
→ createIdeaFromDraft() / appendBlockToIdea()
→ applyVaultChange()
→ autosave
```

保存経路を2本にすれば、片方だけ直る不具合が生まれる。タイトル・Key・BPM・tag・次の一手はすべて既存の入力欄がそのまま担う。

---

## 3. 実装中に見つけた不具合 — 編集が保存時に消えていた

**これが M4 で最も重要な発見である。**

`toSavedProgressionBlock` は `candidateEventsAsTimeline(block.events, ...)` を通り、その中で `...event.source` を展開する。`event.source` は**元の Timeline イベント**なので、

> ユーザーがコードを置換して保存すると、**保存されるのは検出されたコード**になる。

編集は画面上では正しく見え、試聴でも正しく鳴り、**保存して再読込した瞬間に消える**。気づくのは後になってからという最悪の壊れ方をする。

`applyEditableToDraft` が `source` にも編集後のコード・小節・拍・長さを書くように直した。`originalEvents` が範囲の初期状態を保持しているので、失われるものはない。

テストで固定した:

```ts
expect(block.chords[1].chord.label).toBe("C#m7b5");   // 保存後の実物
```

---

## 4. 試聴

保存対象と**同じイベント列**を再生する。

```ts
export function draftPreviewTimeline(draft) {
  return draftToCandidate(draft).chords;   // Editorも保存もこれを使う
}
```

同じ配列なので、保存前と保存後の一致は「2つの経路がたまたま合っている」のではなく構造的に保証される。テストでも保存後のブロックと `draftPreviewTimeline` を直接比較している。

### Voicing の優先順位

製品の既存ルール（`resolveVoicingForUse`）をそのまま使う。

1. 選択範囲の元 MIDI voicing（コードと整合する場合）
2. 整合しなくなったら自動生成へフォールバック

コードを置換した瞬間に `capturedForChordKey` が一致しなくなるので、2 に落ちる。**古い voicing を新しいコードで鳴らせば、ユーザーはもう持っていないコードを試聴することになる。**

M4 が足したのは判断ではなく**報告**で、どちらが起きたかを画面に出す:

```text
ボイシング: 元MIDI
ボイシング: 自動生成（コード編集後）
```

---

## 5. 保存後

保存されたものは**普通の `SavedProgressionBlock`** で、`idea.progressionBlocks` の一員になる。Practice / Mix / Progression Detail はいずれもこの配列を読むので、**手動で作られたことを誰も知る必要がない**。

テストで確認した:

| 項目 | 結果 |
|---|---|
| `progressionBlocks` に1件入る | PASS |
| `startBar` / `endBar` / コード数が範囲どおり | PASS（14–32、19コード） |
| 保存 → JSON 化 → `vaultFileSchema.parse` → 同一 | PASS |
| `fileVersion` | **1**（変更なし） |
| すべてのコードが parser を通る | PASS |
| すべての `durationBeats > 0` | PASS |
| BPM / Key が Idea に載る | PASS |

`schemaVersion` も `fileVersion` も上げていないので、既存の `data.json` はそのまま読める。

---

## 6. Catalog を汚さない

| 確認 | 結果 |
|---|---|
| Draft 作成前後で Catalog Pattern 数が同一 | **PASS** |
| Draft 作成前後で Recommendation が完全一致 | **PASS** |
| Draft が Pattern 件数に加算されない | **PASS** |
| quality floor が Draft を消さない | **PASS**（そもそも通らない） |

---

## 7. テスト（新規10件）

`src/domain/midi/manualDraftSave.test.ts` — 実際の `createVaultStore` と Fake repository を通す。モックした保存ではなく、アプリが使う store をそのまま動かしている。

内訳: 保存の着地 / 試聴と保存の一致 / 保存→再読込 / `fileVersion 1` / 編集内容の保存 / 保存済みブロックとしての到達可能性 / voicing 2件 / Catalog 非汚染 2件。

### フィクスチャの訂正2件

- `VoicingSnapshot` に `capturedForChordKey` と `schemaVersion` を書いていなかったため、互換判定が常に「無効」になっていた。**製品の判定は正しく、テスト側が不完全だった。**
- `FakeRepository` のメソッド名が実インターフェース（`exportTo` / `importFrom` / `restore`）と違っていた。

---

## 8. M4 受け入れ条件

| 条件 | 結果 |
|---|---|
| H3 19・22小節を選択 → Preview → 保存 → 再読込 | **PASS**（87–108 の22小節で往復を検証） |
| 保存内容が Gold 区間と一致 | **PASS**（M3 の Gold 一致 + 保存後のコード列一致） |
| Chord Dojo で利用可能 | **PASS**（普通の `SavedProgressionBlock` として `progressionBlocks` に入る） |
| 保存前後のイベント・試聴一致 | **PASS**（同一配列を使用） |
| Catalog Pattern 数不変 | **PASS** |
| Recommendation 不変 | **PASS** |
| schema 非回帰 | **PASS**（`vaultFileSchema.parse` 通過、`fileVersion` 1） |

---

## 9. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1413 passed (175 files)** / `npm run build` PASS / `cargo test` PASS

---

## 10. M5 への引き渡し

残るは Manual Recoverability Hard Gate の測定、任意長 property test、`npm run tauri build`、最終報告。

M4 で見つけた「編集が保存時に消える」不具合は、**回帰テストとして `manualDraftSave.test.ts` に固定済み**である。
