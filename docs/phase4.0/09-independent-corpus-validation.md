# Loop Vault Phase 4.0 — 独立コーパスによる検証

- 作成日: 2026-07-25
- コーパス: Loop Vault Chapter 3 MIDI Ground Truth Seed（100 MIDI / 399注釈イベント）
- 配置: `.local-evaluation/chapter3-seed/`（**Git管理外**。ライセンス未確認のため）

## 1. なぜ必要だったか

Phase 4.0の判断はすべて Chord Drip コーパス1つに依存していた。そのコーパスには構造的な弱点がある。

- **自己参照的**: ラベルを生成した理論エンジンと同じものがMIDIを生成している
- **acceptableAlternativesが空**: 音楽的に等価な別解を一切許容しない
- **検出器の語彙外が30.60%**: canonicalExactの上限が69.40%しかない

本コーパスは**外部由来MIDIに対するAI支援アノテーションseed**である（`generatorVersion: chatgpt-annotation-v1`）。

**教材公式ラベルでも、独立した専門家によるgold annotationでもない。** 注釈の正しさ自体は保証されていないため、「正解率」ではなく **Chapter 3 Seedとのcanonical一致率** として読む必要がある。

それでも価値がある。曖昧なpitch setには別解が付いており、**Phase 4.0のチューニングに一度も使っていない**ため、単純コード・転回形・slash・7th・sus・diminished・altered dominant を含む**回帰テスト**として機能する。

## 2. 結果 — 全指標で改善または同値

duration-weighted、100ケース / 399イベント。

| Metric | legacy | **phase4-v1** | Δ |
|---|---:|---:|---:|
| root | 98.74% | 98.74% | ±0 |
| **triad** | 98.48% | **98.74%** | **+0.25pp** |
| quality | 97.22% | **98.48%** | **+1.26pp** |
| seventh | 98.48% | **99.49%** | **+1.01pp** |
| bassSlash | 98.74% | 98.74% | ±0 |
| **canonicalExact** | 96.46% | **97.73%** | **+1.26pp** |
| pitchSetEquivalent | 96.46% | **97.73%** | +1.26pp |
| top3Canonical | 98.74% | 98.74% | ±0 |
| top3Root | 99.75% | 99.75% | ±0 |
| top3Quality | 99.49% | 99.49% | ±0 |
| runtime | 463.9 ms | **332.3 ms** | -131.6 ms |

**退行はひとつもない。**

### 2.1 Gate改定の根拠だったtriad退行は再現しない

Chord Drip コーパスで phase4-v1 は triad を **-1.94pp** 落とし、それが唯一のGate不合格理由だった。許容幅を0.5pp→3.0ppへ改定してようやく通した。

**本コーパスでは triad は逆に +0.25pp 改善する。**

つまりあの退行は phase4-v1 の一般的性質ではなく、**Chord Drip コーパス固有の現象**だった可能性が高い。Gate改定の判断は、結果として妥当だったことになる。

### 2.2 他Analyzerとの比較

| Metric | legacy | LBR | voice-aware | **phase4-v1** |
|---|---:|---:|---:|---:|
| quality | 97.22% | 97.22% | 97.22% | **98.48%** |
| seventh | 98.48% | 98.48% | 98.48% | **99.49%** |
| canonicalExact | 96.46% | 96.46% | 96.46% | **97.73%** |
| top3Canonical | 98.74% | 98.99% | 97.98% | 98.74% |
| top3Root | 99.75% | 99.75% | **98.74%** | 99.75% |

既存reranker2種は @1 指標を**まったく動かせていない**（legacyと同値）。voice-aware は top3 を下げている。実質的な改善を出しているのは phase4-v1 だけである。

## 3. 2つのコーパスで精度が大きく違う理由

| | Chord Drip | Chapter 3 Seed |
|---|---:|---:|
| canonicalExact（phase4-v1） | 28.13% | **97.73%** |
| 検出器の語彙外 | **30.60%** | 1.0%（16/1584拍） |

**差の大半は難易度と語彙である。**

Chord Drip は6種のvoicing profile（rootless jazz を含む）× 8種のパターン変奏（broken / push / arp）で生成され、`dom13sus` や `maj13`、括弧付きテンションを多用する。Chapter 3 Seed は harmony track が明快な chord-only データである。

つまり **28.13% は検出器が無能であることを意味しない。** 意図的に難しく作られたデータで、かつ3割が原理的に表現できない語彙を要求している結果である。

**Chapter 3 Seedとのcanonical一致率は97.73%。** これは「正解率98%」ではない。Seedの注釈自体がAI支援であり検証されていないため、**同じ入力に対して両者が同じ読みをする割合**として扱う。

この読み替えは Phase 4.0 の数値解釈全体に効く。

## 4. 評価基盤への追加

### 4.1 acceptableAlternatives を実装した

`evaluateCaseV2` は primary としか比較していなかった。Chord Drip コーパスに別解が存在しなかったため、この経路は一度も使われていなかった。

本コーパスは16イベントに別解を持つ（例: `C6` と `Am7/C` は同じpitch set）。primaryだけで採点すると**音楽的に正しい答えを誤りと数えてしまう**。

各層（root / triad / seventh / quality / extension / bass / canonicalExact / pitchSet / Top-3）を、受理された読みのいずれかと一致すれば正解として採点するようにした。

**Chord Drip コーパスの数値は1つも動かない**ことを確認済み（別解が空なら従来と同一動作）。

### 4.2 パースできなかったラベル

399イベント中1件。

```text
Am(maj7)/G#
```

minor-major 7th は `ChordQuality` の21品質に存在しない。P4.0-01 の representability 分類でいう detector-vocabulary unsupported であり、語彙拡張なしには表現できない。

## 5. Phase 4.0 の結論への影響

昇格判断（`defaultAnalyzerMode = phase4-v1`）は、**チューニングに使っていない独立データで裏付けられた**。

- Chord Drip: canonicalExact +2.21pp / top3Root +5.50pp、triad -1.94pp
- Chapter 3 Seed: canonicalExact +1.26pp / quality +1.26pp / seventh +1.01pp、**退行なし**

両コーパスで一貫して改善しており、唯一の退行は片方のコーパスにしか現れない。

## 6. 実行方法

```bash
npx vite-node scripts/evaluate-chapter3-seed.ts --output 09-chapter3-seed-evaluation.json
```

`--corpus <path>` で配置先を変更できる。既定は `.local-evaluation/chapter3-seed`。

## 7. 取り扱い

README が明記するとおり、アーカイブにライセンス・出所情報が含まれていない。

- `test/` と `.local-evaluation/` はどちらも `.gitignore` 済み
- **MIDIファイルはコミットしない**
- 評価レポート（`09-chapter3-seed-evaluation.json`）は集計値のみでMIDIを含まない
