# Loop Vault P4.1.3-M1 — 任意範囲選択ドメイン

- 作成日: 2026-07-26
- 追加: `src/domain/midi/manualRange.ts`（純関数のみ、非永続）
- UI・保存・Catalog には触れていない（M2以降）
- `defaultAnalyzerMode` は `phase4-v1` のまま

---

## 1. 何を足したか

```ts
createCandidateFromTimelineRange({
  timeline,
  startBar, startBeat,
  endBar, endBeat,
  source: "manual-range",
}): CandidateOccurrence
```

Full Timeline 上の任意範囲から、**非永続の** `CandidateOccurrence` を作る。付随して:

| 関数 | 役割 |
|---|---|
| `timelineRangeBeats(range, beatsPerBar)` | 範囲の絶対ビート境界 |
| `timelineRangeIssues(input)` | 使えない範囲の理由。使えるなら空配列 |
| `clampTimelineRange(range, totalBars, beatsPerBar)` | ドラッグを曲の範囲へ収める。逆向きドラッグも正す |
| `manualRangeId(range)` | 同じ選択には同じ id |
| `isManualRangeOccurrence(occurrence)` | 由来の判定 |

---

## 2. 設計上の判断

### 2.1 `endBeat` は指定したビートを**含む**

`{startBar:1, startBeat:1, endBar:4, endBeat:4}` は4小節ちょうど（16ビート）になる。

「4小節目の4拍目まで」と言ったときに4拍目が入らない実装にすると、**すべての選択が最後の1拍を落とす**。ユーザーには「コードが切れた」としか見えないので、含める側に倒した。

### 2.2 自動候補と同じ経路でイベントを組む

`buildCandidateEvents`（小節単位）を、新しい `buildCandidateEventsInBeatRange`（絶対ビート単位）へ委譲する形へ整理した。`buildCandidateEvents` の引数も意味も変えていない — 小節版は `blockStart = (startBar-1)*beatsPerBar`、`blockEnd = blockStart + lengthBars*beatsPerBar` を渡すだけになった。

手描きのブロックと自動生成のブロックが**同じ関数から**作られるので、同じ範囲なら結果が一致する。テストで直接そう主張している:

```ts
expect(manual.events).toEqual(buildCandidateEvents(timeline, 1, 4, 4));
expect(manual.structuredSignature).toBe(automatic?.structuredSignature);
expect(manual.relativeSignature).toBe(automatic?.relativeSignature);
```

署名が一致するので、手動ブロックが**既にある Pattern の2枚目のカード**になることがない。

### 2.3 小節をまたぐ部分範囲を丸めない

`lengthBars` は `(endBeat - startBeat) / beatsPerBar` をそのまま持つ。2.5小節の選択は 2.5 小節である。丸めると密度統計（`chordEventsPerBar`）がユーザーの選んでいないブロックを説明することになる。

### 2.4 `score` は 0 のまま

`buildOccurrences` が未採点の窓に与えるのと同じ値。**手動候補は順位を争っていない** — ユーザーが指名したから存在する。順位で勝つための高い点を与えれば、入っていない競争へユーザー自身の選択を放り込むことになる。

その帰結として、**品質フロアを適用する側が `manual-range` を明示的に除外する必要がある**。これは M4（Catalog連携）の仕事で、「カードが消える」という形で後から発見しないようソースにも書いた。

### 2.5 途中から始まる範囲は警告する

最初のコードが範囲より前から鳴っている場合（`carriedIn`）、`manual-range-starts-mid-chord` を警告に足す。間違いではなく音楽的な選択だが、起きたことは伝える。

### 2.6 不正な範囲は例外、ドラッグは丸める

`createCandidateFromTimelineRange` は使えない範囲で throw する。UI は先に `timelineRangeIssues` を見るか、`clampTimelineRange` でドラッグを使える形にする。曲の終わりを越えたドラッグはエラーではなく最終小節になるべきで、逆向きのドラッグは「2点の間」と読むべきなので、丸める側に分けた。

---

## 3. M0 の予測は成り立ったか

M0 は「範囲選択があれば9/10が1操作」と予測した。**予測を引用するだけでは主張になってしまう**ので、実際に作って Gold と比べた。

`scripts/verify-manual-range-recovery.ts` → `01-manual-range-recovery.json`

| コーパス | 区間 | 小節 | Gold一致 | 予測 | 実測 |
|---|---|---|---|---|---|
| holdout-v3 | H3_clean sec2 | 14–32 (19) | **一致** | 1 | **1** |
| holdout-v3 | H3_clean sec6 | 87–108 (22) | **一致** | 1 | **1** |
| holdout-v3 | H3_stress sec2 | 14–32 (19) | **一致** | 1 | **1** |
| holdout-v3 | H3_stress sec6 | 87–108 (22) | **一致** | 1 | **1** |
| SGC v1 | S14_clean b2 | 5–8 (4) | **一致** | 1 | **1** |
| SGC v1 | S16_clean verse | 5–12 (8) | **一致** | 1 | **1** |
| SGC v1 | S16_clean chorus1 | 13–20 (8) | **一致** | 1 | **1** |
| SGC v1 | S16_clean chorus2 | 25–32 (8) | **一致** | 1 | **1** |
| SGC v1 | S16_stress verse | 5–12 (8) | **一致** | 1 | **1** |
| SGC v1 | S24_stress sec6 | 81–100 (20) | 1箇所目で相違 | 6 | **6** |

**Gold一致 9/10、1操作 9/10、予測的中 10/10。**

H4 で `must-show-catalog-recall` を落とした H3 の19小節・22小節区間は、**範囲を1回選ぶだけで Gold と完全に一致するブロックになる**。

唯一外れない S24_stress は `A7#5` が `A7` と検出されている件で、M0 が「手動救済は検出の代わりにならない」と記録した通り。範囲選択で到達はできるが、既存のコード置換が5箇所必要（合計6操作）で、それも予測どおりだった。

---

## 4. 変更していないもの

- `defaultAnalyzerMode` = `phase4-v1`
- Timeline / qualityEvidence / canonical identity / コード名判定
- Catalog / Recommendation / 選定ロジック
- 保存スキーマ・`fileVersion`
- `buildCandidateEvents` の引数・戻り値・挙動（内部で新しい関数へ委譲しただけ）
- Stage F は未着手

---

## 5. M2 への引き渡し

ドメインは揃った。M2 は Full Timeline UI に範囲選択を足し、`clampTimelineRange` → `timelineRangeIssues` → `createCandidateFromTimelineRange` を呼ぶ。

M4 で解決が必要な既知の点: **品質フロアが `manual-range` を落とさないようにすること**（2.4）。
