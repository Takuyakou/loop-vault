# Loop Vault Phase 4.0 — P4.0-01 コードラベル契約と製品バグ修正

- 作成日: 2026-07-25
- Branch: `fix/p40-01-chord-label-contract`（base: `docs/p40-00-audit-baseline`）
- **検出器の出力は変更していない**

## 1. 結論

コードの内部的意味・表示文字列・コーパス期待ラベルを分離した。

```text
Chord identity  ≠  display spelling  ≠  original corpus label
```

`parseChordLabel` の受理範囲を広げ、`labelFromSymbol` の連結を構造化した。identity比較用に `NormalizedChordIdentity` を追加した。

| 指標 | P4.0-00 | P4.0-01 |
|---|---:|---:|
| expectedParseCoverage | 49.53% | **100.00%** |
| identityRoundTripCoverage | 未測定 | **100.00%** |
| surfaceReachability（拍） | 32.22% | 45.58% |

計画書§7.11の受け入れ条件「corpus expected labelsのparse coverage 100%」「identity round-trip 100%」を満たした。

## 2. 検出精度は変わっていない

`labelFromSymbol` は検出器も使うため、変更後にbaselineを再測した。

| Metric | P4.0-00 | P4.0-01 | 差 |
|---|---:|---:|---:|
| Root | 57.76% | 57.76% | 0.00 |
| Quality | 60.83% | 60.83% | 0.00 |
| Surface Exact | 13.69% | 13.69% | 0.00 |
| Top-3 | 20.10% | 20.10% | 0.00 |
| Corrections | 918 | 918 | 0 |

**完全一致。** 検出器は `tensions` を常に空配列で出し、綴りもcanonical固定のままなので、パーサ拡張とテンション整形はその出力に影響しない。

surfaceReachability（＝到達可能上限）は32.22%→45.58%へ上がったが、**Surface Exact実測は13.69%のまま動いていない**。したがって本Stageに「精度が上がった」と報告できる要素はない（計画書§4原則7・原則9）。

## 3. 修正した製品バグ

### 3.1 `C6/9` を自アプリが読み戻せない

slash bass判定を「末尾が有効なnote tokenの場合のみ」に変更した。

```text
C6/9      → quality "6/9"、bassなし          （従来: parse失敗）
Bb6/9/F   → quality "6/9"、bass F            （従来: parse失敗）
A6/C#     → quality "6"、bass C#             （従来どおり）
```

これで検出器が出力する `sixNine` ラベルをChord Inspectorが有効なコードとして扱う。コーパス上は130拍・reachability 0.0%だった品質が解消した。

### 3.2 テンション表記の破壊

`tensions.join("")` による無秩序な連結をやめ、構成を明示した。

```text
root → quality core → suspension → extension → alteration → slash bass
```

```text
A13sus  → A13sus4      （従来: Asus413）
A13sus4 → A13sus4
A7sus   → A7sus4
C7(b9)  → C7(b9)       残余テンションは括弧
```

サスペンデッド・ドミナントは最上位の自然テンションを quality 側へ繰り上げる（`dom7sus4` + `13` → `13sus4`）。`sus413` のような順序破壊は構造上生じない。

## 4. パーサの拡張

| 対応 | 例 | identity |
|---|---|---|
| 括弧付きテンション | `Bbm7(9)` | `min9` |
| 〃 | `Abmaj7(9)` | `maj9` |
| 〃 | `Dbm7(11)` | `min11` |
| 複数テンション（順不同） | `C7(9,13)` / `C7(13,9)` | `dom13` |
| 重複変化記号 | `Bbb7` | root pc 9 |
| 理論的綴り | `Cb9`, `Fb7`, `E#dim7/B` | 正しいpitch class |
| 語彙外qualityの別名 | `Amaj13(9)/C#` | `maj9` + `13` |
| 旧不正表記 | `Asus413` | `dom7sus4` + `13` |

### 4.1 テンションの畳み込み

より上位のqualityが既に綴っているテンションは、parse時にそのqualityへ畳む。richest-first で評価するため `C7(9,13)` は `C9(13)` ではなく `C13` になる（13は9を含意する）。

qualityが含意するテンションは表示から除去するので、`Amaj13(9)` が `Amaj9(9,13)` のように重複することはない。

### 4.2 語彙は増やしていない

`maj13` はコーパスに存在するが `ChordQuality` にはない。**検出器の語彙を増やすとAnalyzer変更になる**ため、`maj9` + tension `13` として identity を表現するに留めた。`ChordQuality` の21品質は不変である。

同様に `dom13sus` / `blackadder` も語彙へ追加していない。これらの扱いはP4.0-02のrepresentability分類で決める。

## 5. `NormalizedChordIdentity`

`src/domain/chordIdentity.ts` を追加した。表示綴りから独立した、pitch class ベースの純粋表現である。

```ts
export interface NormalizedChordIdentity {
  rootPitchClass: number;
  triad: "major" | "minor" | "diminished" | "augmented" | "sus2" | "sus4" | "power" | "unknown";
  seventh?: "minor7" | "major7" | "diminished7";
  extensions: number[];
  alterations: string[];
  bassPitchClass?: number;
  noChord?: boolean;
}
```

- 異名同音を吸収する（`Gbadd9` と `F#add9` は同一）
- root / triad / seventh / extension / bass を個別比較できる
- slash bass差は別identityとして保持する
- `N.C.` を欠損と区別する
- `chordIdentityKey()` で安定した文字列キーを得られる

既存の `ChordSymbol` は置換していない。P4.0-02のcanonical metricsとP4.0-03のstructured signatureがこれを使う。

## 6. Key-aware spelling

```ts
formatChordSymbol(chord, { keyContext: "Gb major" })  // → "Gbadd9"
formatChordSymbol(chord, { keyContext: "B major" })   // → "F#add9"
formatChordSymbol(chord, { accidentalPreference: "flat" })
formatChordSymbol(chord)                              // canonical fallback
```

`labelFromSymbol(chord)` は `formatChordSymbol(chord)` と等価で、**綴りは従来どおり**。

**検出器へは適用していない。** 適用すると候補の `summaryText` と dedupeKey が変わり、検出出力の変更になるため。適用範囲はP4.0-02以降で判断する。これが surfaceReachability に残る 12.98%（異名同音）の理由である。

## 7. 到達不可として残るもの

surfaceReachability 45.58% の残余は設計上の想定内である。

| 残余 | 拍シェア | 理由 |
|---|---:|---|
| quality-notation | 41.43% | `Bbm7(9)` → `Bbm9` のように意味を保って綴りが変わる。identityは一致する |
| enharmonic-spelling | 12.98% | key-aware spellingを検出器へ未適用 |

計画書§7.4のとおり「文字列の形を維持する必要はない。意味のround-tripを保証する」方針であり、identity round-trip は100%である。

## 8. 互換性

- `fileVersion` 変更なし
- 保存schema変更なし
- 旧data.json読込時に一括書換をしない（`parseChordLabel` は読み取り時のみ正規化し、保存は明示編集時のみ）
- 旧ラベル `Asus413` / `Cm7/G` / `F#m7b5` / `C7b9` / `DM7` の読み戻しをテストで保証
- ルートは大文字のみ受理する従来挙動を維持（`b9` は引き続き無効）
- `parseChordLabel("Hmaj7")` は引き続き `null`

## 9. テスト

`src/domain/chordLabelContract.test.ts` を追加（23件）。

- 12 root × 21 quality の identity round-trip
- 全qualityのslash bass round-trip
- `6/9` とそのslash bass
- `13sus` / `13sus4` / `7sus` / `7sus4`
- 括弧付きtension、複数tension順不同
- 重複変化記号、理論的綴り、無効ラベル
- 異名同音identity一致、slash差の非一致
- key-aware spelling
- legacy malformed alias

全体: **150ファイル / 1052テスト中1051 PASS**。

失敗1件（`ProgressionDetailView.test.tsx:96`）はP4.0-00で報告済みのmaster由来の既存失敗であり、本Stageとは無関係。

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run eval:midi:datasets` | baseline完全一致 |
| `npm run eval:midi:label-reachability` | parse 100% / identity 100% |

## 10. スクリプト変更

`evaluate-label-reachability.ts` に `--output` を追加した。Stage成果物は凍結スナップショットであり、後続の実行が前Stageのファイルを黙って上書きしないようにするため（P4.0-00の成果物が一度上書きされた事象への対処）。

```bash
npm run eval:midi:label-reachability                                    # label-reachability.json
npx vite-node scripts/evaluate-label-reachability.ts --output 01-roundtrip-report.json
```

## 11. 次Stageへの申し送り

1. **P4.0-02** — `qualityFamily()` の `dom13sus` フォールバック（P4.0-00 §4.4）は未修正のまま。canonical metricsの導入と同時に扱う。
2. **P4.0-02** — key-aware spellingを検出器へ適用するか、`keySpellingAccuracy` として別評価に留めるかを決める。
3. **P4.0-02** — `dom13sus` / `blackadder` を representability のどの分類に置くか決める。`blackadder` はコーパス側に定義がない。
4. **P4.0-03** — `chordIdentityKey()` を structured signature の構成要素に使える。
