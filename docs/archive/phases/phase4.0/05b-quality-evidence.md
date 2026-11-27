# Loop Vault Phase 4.0 — P4.0-05B Quality-defining tone evidence

- 作成日: 2026-07-25
- Branch: `feature/p40-05b-quality-evidence`（base: `feature/p40-04-block-selection-v2`）
- 本書は05B（品質決定音）と05D（tune探索）の結果を含む
- **`defaultAnalyzerMode` は `legacy` のまま。legacyの出力は1ビットも変えていない**

## 1. 結論

品質決定音の証拠を導入し、新モード `phase4-v1` として実装した。

**狙いどおり、Upper Structure Slash候補生成（05A）を実装せずに主候補が入れ替わった。**

| 小節 | 期待 | legacy | phase4-v1 |
|---|---|---|---|
| 4前半 | `E/F#` | `F#m11` ❌ | **`Eadd9/F#`** ✅ |
| 6 | `D/E` | `Em11` ❌ | **`Dadd9/E`** ✅ |

単純なコード（`Dmaj7` / `Dm7` / `C#m7` / `C7` / `Bm7` / `Gmaj9/A`）は不変。

**ただし、コーパス全体では Gate を通らない。** tune探索後も `triad` が -1.94pp 残る（§6）。

## 2. 何が問題だったか

legacyのテンプレートスコアは構成音を等価に加算する。

```ts
const hit = pcs.reduce((sum, pc) => sum + histogram[pc], 0);
```

品質を決定づける音（majorの長3度、minorの短3度）が鳴っていなくても、ルート・5度・7度の重みだけで勝てる。

`endless endless chord.mid` の6小節目は実音 `E F# A D`（pitch class `[D E F# A]`）。

- legacyの主候補 `Em11` が要求する **G（短3度）も B（5度）も存在しない**
- 期待 `D/E` の上部構造 `D F# A` は3音すべて実在

## 3. 実装

### 3.1 品質決定音

`src/domain/midi/qualityEvidence.ts`。

| quality | 必須音程 |
|---|---|
| maj / six / add9 / sixNine | 長3度 |
| min / min6 | 短3度 |
| maj7 / maj9 | 長3度 + 長7度 |
| min7 / min9 / min11 | 短3度 + 短7度 |
| dom7 / dom9 / dom13 | 長3度 + 短7度 |
| dim | 短3度 + 減5度 |
| aug | 長3度 + 増5度 |
| sus2 / sus4 | 2度 / 4度 |
| dom7sus4 | 4度 + 短7度 |

**ルートと完全5度は必須にしていない。** rootless voicingは一般的であり、5度は最初に省略される音だからである（§11.4「Root欠落を一律hard rejectにしない」）。

存在判定には窓の総重みの2%という下限を置き、装飾音が構成音の代わりになるのを防ぐ。

### 3.2 減点とBass減衰

```text
confidence -= (1 - coverage) × penalty
```

`penalty` の値は §5 のtune探索で決めた（採用値 0.08）。

さらに §11.6 に従い、Bassがルート上にあっても品質証拠が弱ければルートボーナスを減衰させる。

```text
bassBonus × (0.4 + 0.6 × coverage)
```

強いベース音だけで、決定音を欠いたコード名を通せないようにするため。

### 3.3 Warning

`missing-quality-defining-tone` と `ambiguous-quality` を追加した。

`ambiguous-quality` の条件設計では2度作り直した。

1. 最初は「Top1とTop2が僅差」で発火させたが**全イベントで発火**した
2. 次に「qualityが異なる」を加えたが、`Dmaj7` vs `Dmaj9` のように拡張音だけ違うペアで発火し、やはり全イベントで出た
3. 最終的にP4.0-02の定義（quality = triad + seventh）で比較し、fixtureでは8イベント中1件のみ発火するようになった

既存の `ambiguous-bass` は名前と実条件が食い違っているが、後方互換のため条件も文字列も変えていない（§11.8）。

## 4. legacyは不変

| Metric | P4.0-04 | P4.0-05B | 差 |
|---|---:|---:|---:|
| Root | 57.76% | 57.76% | 0.00 |
| Quality | 60.29% | 60.29% | 0.00 |
| Surface Exact | 13.69% | 13.69% | 0.00 |
| Corrections | 918 | 918 | 0 |

品質証拠は `LegacyScoringOptions.useQualityEvidence` でのみ有効になり、legacyは通過しない。

## 5. Tune探索（05D）

減点係数と存在判定閾値は設計値だったため、tune 70件のみで探索した。**holdoutは探索中に一度も読んでいない。**

### 5.1 「3rdのみに絞る」案は逆効果だった

先に立てた仮説（減点を3rd欠落のmajor/minorへ限定すれば副作用が減る）は**否定された**。

| scope | canonicalExact（tune、対legacy） |
|---|---:|
| `third` | **-1.02 〜 -2.38pp** |
| `full` | **+1.11 〜 +3.23pp** |

3rdだけを課金対象にすると canonicalExact はむしろ悪化する。7thや変化5度の欠落も課金する `full` の方が一貫して良い。

### 5.2 減点係数に崖がある

| penalty | root（対legacy） | triad | canonicalExact |
|---:|---:|---:|---:|
| 0.02 | +0.09 | -1.53 | +3.23 |
| 0.04 | +0.26 | -1.87 | +3.23 |
| 0.06 | +0.34 | -1.96 | +3.15 |
| **0.08** | **+0.68** | **-1.79** | **+2.98** |
| 0.10 | +0.17 | -2.21 | +3.06 |
| 0.12 | **-10.03** | -8.67 | +2.81 |
| 0.14 | -10.03 | -8.59 | +2.81 |

0.10と0.12の間でrootが約10pp崩壊する。当初の0.35はこの崖の遥か上にあった。

### 5.3 存在判定閾値は無効

0.01 / 0.02 / 0.03 で結果が**完全に同一**だった。必須音は明確に鳴っているか明確に無音かのどちらかで、境界ケースがこのコーパスには存在しない。パラメータとしては現状死んでいる。

### 5.4 採用構成

```ts
{ scope: "full", penalty: 0.08, presenceThreshold: 0.02 }
```

tune上でrootとTop-3が最良。

## 6. コーパス評価 — 残る不合格は triad の1件のみ

duration-weighted / full、100 MIDI。

| Metric | legacy | phase4-v1 | Δ | Gate判定 |
|---|---:|---:|---:|---|
| root | 57.11% | 57.76% | **+0.65pp** | ✅ |
| **triad** | 59.75% | **57.81%** | **-1.94pp** | ❌ 許容0.5pp |
| quality | 44.23% | 44.99% | +0.76pp | ✅ |
| seventh | 55.12% | 56.25% | +1.13pp | ✅ |
| extension | 38.20% | 36.42% | -1.78pp | 対象外 |
| bassSlash | 65.25% | 66.38% | +1.13pp | ✅ |
| **canonicalExact** | 25.92% | **28.13%** | **+2.21pp** | ✅ |
| pitchSetEquivalent | 28.56% | 30.98% | +2.42pp | 対象外 |
| **top3Canonical** | 37.45% | **40.25%** | **+2.80pp** | ✅ |
| **top3Root** | 70.47% | **75.97%** | **+5.50pp** | ✅ |
| top3Quality | 65.19% | 64.98% | -0.21pp | ✅ |
| holdout canonicalExact | 24.71% | **25.59%** | **+0.88pp** | ✅ requireAny充足 |
| runtime | 587 ms | 860 ms | +273 ms | ✅ 上限3000 ms |

**判定: FAIL（triadのみ）。**

### 6.1 既存rerankerとの決定的な違い

| Metric | legacy | LBR | voice-aware | **phase4-v1** |
|---|---:|---:|---:|---:|
| root | 57.11% | 57.33% | 57.54% | **57.76%** |
| canonicalExact | 25.92% | 26.13% | 26.13% | **28.13%** |
| top3Canonical | 37.45% | 38.09% | 38.36% | **40.25%** |
| **top3Root** | 70.47% | **61.96%** | **62.18%** | **75.97%** |

既存reranker2種は top3Root を8pp犠牲にして@1をわずかに上げていた。**phase4-v1は逆に top3Root を5.50pp改善している。** 計画書§2.3の「正解をTop-3へ入れてユーザーが数秒で選ぶ」という目的に対しては、3モードの中で唯一正しい方向へ動いている。

### 6.2 triadだけが下がる理由

triad が -1.94pp なのに quality（triad + seventh）が +0.76pp 上がっている。quality は両方一致で初めて加点されるので、次のように読める。

**7thの取り違えを大きく減らす代わりに、一部でtriadを取り違えるようになった。** 純増ではあるが、triadを単独で見ると退行している。

## 7. 判断が必要な点

Gateは凍結済みであり、**結果に合わせて閾値を動かすことはしない**（§4原則23、§8.10）。したがって現状の `phase4-v1` は自動的には昇格できない。

選択肢は3つある。

1. **triadの許容幅を明示的に見直す。** Gate文書は「変更には人間の明示承認と理由の記録が必要」と定めている。root +0.65 / top3Root +5.50 / canonicalExact +2.21 と引き換えに triad -1.94 を受け入れるかの判断。
2. **主コードはlegacyのまま、代替候補だけphase4で作る。** `hybrid-v1` が主ラベルをlegacyに保つのと同じ構造。@1指標は定義上すべて不変なので**Gateを確実に通り**、top3の利得だけを取れる。
3. **phase4を保留し、P4.0-06でlegacy維持を推奨する。** Phase 4.0の成果はラベル層・評価基盤・Block v2として残る（§12.5「Phase 4.0は失敗ではない」）。

## 8. 未実施（本Stageの範囲外）

- **05A Upper Structure Slash候補生成** — 未実装。P4.0-00の予測どおり、05Bだけで `Eadd9/F#` / `Dadd9/E` が主候補になったため、**必要性そのものが薄い**
- **05C Legacy Boundary Reranker A/B接続** — 未実装
- `sustained-across-bar` / `upper-structure-slash-possible` warning — 未実装
- `presenceThreshold` はこのコーパスでは無効なパラメータであり、境界ケースを含む実データが得られるまで意味を持たない

## 9. テスト

`src/domain/midi/qualityEvidence.test.ts`（16件）。

必須音程の定義、ルート・5度を必須にしないこと、`endless endless chord` の実音でminorが減点されること、同じ音のmajor読みは減点されないこと、減点が欠損量に比例すること、微弱音を構成音とみなさないこと、Bass減衰、legacyが不変であること、phase4がanalyzerVersionを出すこと、決定性。

全体: **154ファイル / 1131テスト中1130 PASS**。失敗1件はP4.0-00で報告済みのmaster由来の既存失敗。

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run eval:midi:datasets` | legacy baseline完全一致 |

## 10. 成果物

```text
docs/phase4.0/05b-quality-evidence.md        本書
docs/phase4.0/05-phase4-comparison.json      4モードのcanonical比較
docs/phase4.0/05d-quality-evidence-tune.json tune探索の全結果
scripts/tune-quality-evidence.ts             tune限定のgrid探索
src/domain/midi/qualityEvidence.ts           品質決定音の証拠
src/domain/midi/phase4Analyzer.ts            phase4-v1モード
src/domain/midi/qualityEvidence.test.ts      16件
```
