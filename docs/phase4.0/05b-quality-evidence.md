# Loop Vault Phase 4.0 — P4.0-05B Quality-defining tone evidence

- 作成日: 2026-07-25
- Branch: `feature/p40-05b-quality-evidence`（base: `feature/p40-04-block-selection-v2`）
- **`defaultAnalyzerMode` は `legacy` のまま。legacyの出力は1ビットも変えていない**

## 1. 結論

品質決定音の証拠を導入し、新モード `phase4-v1` として実装した。

**狙いどおり、Upper Structure Slash候補生成（05A）を実装せずに主候補が入れ替わった。**

| 小節 | 期待 | legacy | phase4-v1 |
|---|---|---|---|
| 4前半 | `E/F#` | `F#m11` ❌ | **`Eadd9/F#`** ✅ |
| 6 | `D/E` | `Em11` ❌ | **`Dadd9/E`** ✅ |

単純なコード（`Dmaj7` / `Dm7` / `C#m7` / `C7` / `Bm7` / `Gmaj9/A`）は不変。

**ただし、コーパス全体では Gate を通らない。** root -8.13pp / triad -5.76pp の退行がある（§5）。

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
confidence -= (1 - coverage) × 0.35
```

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

## 5. コーパス評価 — Gateを通らない

duration-weighted / full、100 MIDI。

| Metric | legacy | phase4-v1 | Δ | Gate判定 |
|---|---:|---:|---:|---|
| **root** | 57.11% | **48.98%** | **-8.13pp** | ❌ 許容0.5pp |
| **triad** | 59.75% | **53.99%** | **-5.76pp** | ❌ 許容0.5pp |
| quality | 44.23% | 43.53% | -0.70pp | ❌ 許容0.5pp |
| seventh | 55.12% | 56.68% | +1.56pp | ✅ |
| extension | 38.20% | 36.31% | -1.89pp | 対象外 |
| bassSlash | 65.25% | 66.11% | +0.86pp | ✅ |
| **canonicalExact** | 25.92% | **27.91%** | **+1.99pp** | ✅ |
| pitchSetEquivalent | 28.56% | 30.66% | +2.10pp | 対象外 |
| **top3Canonical** | 37.45% | **39.76%** | **+2.31pp** | ✅ |
| top3Root | 70.47% | 68.86% | -1.61pp | ✅ 許容3.0pp |
| top3Quality | 65.19% | 64.33% | -0.86pp | ✅ 許容3.0pp |
| holdout canonicalExact | 24.71% | **25.88%** | **+1.17pp** | ✅ requireAny充足 |
| runtime | 587 ms | 675 ms | +88 ms | ✅ 上限3000 ms |

**判定: FAIL。** requireAny（holdout改善0.5pp以上）は満たすが、requireAll の root / triad / quality で不合格。

### 5.1 何が起きているか

canonicalExact は上がり root は下がる、という一見矛盾した結果になっている。canonicalExact は root・triad・seventh・extension・bass のすべてが一致して初めて加点されるので、次のように読める。

**phase4は「正解するときは完全に正解する」が、「ルートを取り違える頻度が legacy より高い」。**

3rd欠落への減点が、slash読み（`Em11` → `Dadd9/E`）へ寄せる方向に働く。fixtureのように期待がslash読みなら正解だが、コーパスには期待がルート位置のケースが多く、そこでルートを落としている可能性が高い。

`top3Root` の低下は1.61ppに留まる（許容内）ため、**正しいルートは候補リストには残っている**。@1の選択がずれているだけである。

## 6. 判断が必要な点

Gateは凍結済みであり、**結果に合わせて閾値を動かすことはしない**（計画書§4原則23、§8.10）。したがって現状の `phase4-v1` は製品既定にできない。

考えられる次の手は3つある。

1. **05Dのtune探索を実施する。** 減点係数0.35と存在判定閾値2%は設計値であり、tune corpus での探索を経ていない。root退行を許容内に収めつつcanonicalExactの改善を残せる設定があるかを探る。holdoutは触らない。
2. **減点の適用範囲を絞る。** 現在は全qualityに一律で適用している。3rd欠落のmajor/minorだけに限定し、7th欠落などは減点しない案。
3. **phase4を採用せず、Top-3改善のみを取り込む。** canonicalExact +1.99pp / top3Canonical +2.31pp は候補提示としては有益なので、主コードはlegacyのまま代替候補だけphase4で作る（`hybrid-v1` が主ラベルをlegacyに保つのと同じ構造）。

## 7. 未実施（本Stageの範囲外）

- **05A Upper Structure Slash候補生成** — 未実装。P4.0-00の予測どおり、05Bだけで `Eadd9/F#` / `Dadd9/E` が主候補になったため、05Aの必要範囲は改めて評価すべき
- **05C Legacy Boundary Reranker A/B接続** — 未実装
- **05D tune corpusでの weight / 閾値探索** — 未実施。§5.1の退行はここで扱うのが筋
- `sustained-across-bar` / `upper-structure-slash-possible` warning — 未実装

## 8. テスト

`src/domain/midi/qualityEvidence.test.ts`（16件）。

必須音程の定義、ルート・5度を必須にしないこと、`endless endless chord` の実音でminorが減点されること、同じ音のmajor読みは減点されないこと、減点が欠損量に比例すること、微弱音を構成音とみなさないこと、Bass減衰、legacyが不変であること、phase4がanalyzerVersionを出すこと、決定性。

全体: **154ファイル / 1131テスト中1130 PASS**。失敗1件はP4.0-00で報告済みのmaster由来の既存失敗。

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run eval:midi:datasets` | legacy baseline完全一致 |

## 9. 成果物

```text
docs/phase4.0/05b-quality-evidence.md        本書
docs/phase4.0/05-phase4-comparison.json      4モードのcanonical比較
src/domain/midi/qualityEvidence.ts           品質決定音の証拠
src/domain/midi/phase4Analyzer.ts            phase4-v1モード
src/domain/midi/qualityEvidence.test.ts      16件
```
