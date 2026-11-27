# Loop Vault Phase 4.1.2 — E Structural window generation

- 作成日: 2026-07-25
- 対象モード: `phase4.1.2-v1`（**製品既定は `phase4-v1` のまま**）
- Timeline / qualityEvidence / canonical identity: **変更なし**

---

## 1. 固定14/18/20は追加していない

固定長 2/4/8/16 では14小節セクションを表現できず、S24 と L04 の must-show ブロックは**選定が何をしても到達不可能**だった。生成されていなかった。

14/18/20 をリストに足せばこの2コーパスは通るが、それだけである。次に13小節のブリッジが来れば同じ形で落ちる。**素材から窓を導出する。**

```text
src/domain/midi/structuralWindows.ts
```

| generator | 何を問うか |
|---|---|
| `section-boundary` | セクションの正確なスパン。隣接する最大4境界の結合も含む |
| `event-boundary` | コード変化から変化までの1〜4区間 |
| `repeat-cycle` | 小節列が周期pで繰り返す場所のp |
| `loop-return` | 開始コードが戻る直前で閉じるスパン |
| `derived-length` | **検出セクション長とコード変化間隔から導出した長さ**を各変化位置に当てる |

既存の 2/4/8/16 generator は維持し、`extraWindows` として**加える**。

### 1.1 `derived-length` が必要だった理由

セクション内のコードが4小節周期で回っている場合、14小節というスパンを定義するのは**セクション境界だけ**である。ところが segmenter の境界精度は約8割で、1〜2小節ずれるとスパンが取れない。

| 段階 | S24 の 33–46 | L04 の 1–14 |
|---|---|---|
| section-boundary のみ | MISSING | MISSING |
| + derived-length（セクション長） | **found** | MISSING |
| **+ セクション結合長** | **found** | **found** |

L04 は segmenter が先頭50小節を1セクションに統合していたため、セクション長だけでは足りず、隣接セクションの結合長が必要だった。

**長さは素材から来る。コード中に 14 という数値はない。**

---

## 2. 受け入れ条件

| 条件 | 結果 |
|---|---|
| **`candidateGenerationLoss = 0`（S24の14/18/20を含む）** | **達成。`mustShowGeneratedRecall` min=mean=max=1.0（56ファイル）** |
| `runtime <= 3000ms` | **達成。max 341 ms（上限の11%）** |
| Pattern数の異常膨張なし | §2.1 参照 |
| deterministic | **達成。再実行で同一** |

### 2.1 Pattern数

| fixture | phase4.1-v1 | phase4.1.2-v1 | 倍率 | カード数 |
|---|---:|---:|---:|---|
| L01 (112小節) | 330 | 875 | 2.65× | 22 → 10 |
| L04 (96小節) | 193 | 727 | 3.77× | 23 → 10 |
| L12 (128小節) | 60 | 225 | 3.75× | 30 → 11 |

**2.7〜3.8倍。** 指数的ではなく比例的で、生成器はいずれも小節数に対して線形（`event-boundary` は最大4区間、`section-boundary` は最大4結合、`derived-length` は最大16長 × 変化位置）。上限 `MAX_WINDOWS = 1200` を置いてある。

runtime は mean 70 → 84 ms（+20%）、max 264 → 341 ms。**上限3000msに対して11%。**

表示カード数は変わらない（10〜11枚）。膨張は候補プールの中だけで起き、ユーザーには見えない。

---

## 3. Gate結果（56 file評価）

| Gate | C | D | **E** |
|---|---|---|---|
| `visiblePatternDuplicateCount = 0` | PASS | PASS | **PASS** |
| `visibleSlotWasteCount = 0` | PASS | PASS | **PASS** |
| `progressionPrecisionAt3 = 100%` | PASS | PASS | **PASS** |
| `twoBarFragmentsInTop3 = 0` | PASS | PASS | **PASS** |
| `rank-constraint order` | PASS | PASS | **PASS** |
| `runtime <= 3000ms` | PASS | PASS | **PASS** |
| `deterministic` | PASS | PASS | **PASS** |
| **`longestUncoveredRun < 8`** | 54/56 | 54/56 | **56/56 PASS** |
| `coverage >= 90%` | 53/56 | 53/56 | **55/56** |
| `occurrenceReachability = 100%` | 54/56 | 54/56 | 54/56 |
| **`rank-constraint top3MinHits`** | 39/56 | 39/56 | **34/56（悪化）** |
| **`rank-constraint allVisibleMinHits`** | 41/56 | 41/56 | **37/56（悪化）** |

**PASSは8項目**（baseline 3、B 4、C・D 7）。

| 指標 | baseline | C | **E** |
|---|---:|---:|---:|
| **mustShowGeneratedRecall** | 0.9702 | 0.9702 | **1.0000** |
| mustShowSelectedRecallAmongGenerated | 0.4269 | 0.8702 | **0.7453（悪化）** |
| uniquePatternCountAt10 | 2.6071 | 9.7321 | **10.0000** |
| allCandidateCoverage | 0.9739 | 0.9877 | **0.9954** |
| runtime max (ms) | 311 | 237 | 341 |

---

## 4. 悪化を正直に記録する

`rank-constraint top3MinHits` が 39/56 → 34/56、`allVisibleMinHits` が 41/56 → 37/56、`mustShowSelectedRecallAmongGenerated` が 0.870 → 0.745 へ落ちた。

**生成を増やすと選定が難しくなる。** 候補プールが2.7〜3.8倍になり、gold ブロックが表示10枠から押し出される。生成できていなかったブロックが生成されるようになった代わりに、生成できていたブロックの一部が表示から外れた。

これは緩和すべきGateの問題ではなく、**選定側で解くべき残課題**である。Eの目的（生成不能の解消）は達成し、`mustShowGeneratedRecall = 1.0` になった。選定が新しい候補プールに追いついていない。

**Gateは動かさない。** 未達が残るため既定は `phase4-v1` のままとする。

### 4.1 測定ミスを1件訂正した

最初の計測で `progressionPrecisionAt3` が 56/56 → 32/56 に崩れた。原因は**ハーネスが `extraWindows` なしで occurrence を再構築していた**ことで、奇数長のカードが occurrence に対応づけられず分類不能になっていた。製品の退行ではなく計測の欠落である。ハーネスにモードと同じ窓集合を渡して 56/56 に戻った。

同じ理由で `mustShowGeneratedRecall` も改善が見えていなかった。

---

## 5. 追加したテスト

`src/domain/midi/structuralWindows.test.ts`（7件）

```text
does not re-emit the lengths the fixed generator already covers
emits a section's exact span whatever length it happens to be
recovers a span the segmenter merged, by joining its neighbours
finds a five-bar repeat cycle
finds the span that ends where its opening chord returns
stays inside the song
produces the same windows on a rerun
```

---

## 6. 触っていない層

`matchWindow` / `smoothTimeline` / `qualityEvidence` / `chordIdentity` / `blockQuality` / `attachSourceVoicing` / 保存schema / `defaultAnalyzerMode` / `coverageSelector.ts`。

`segmentSections` は**読むだけ**で変更していない。セクションは窓の配置にのみ使い、選定には接続しない。境界の誤りは候補のスパンを外すことはあっても候補を消すことはない。
