# Loop Vault Stage F — Final Closeout / Phase 4.x Complete

- 作成日: 2026-07-26
- **Phase 4.x: complete**
- **正式既定: `defaultAnalyzerMode = "phase4-v1"`（固定）**
- **正式な補正経路: Manual Candidate Rescue（P4.1.3）**
- 新しい検出アルゴリズム・閾値調整は行っていない

---

## 1. Stage F 全結果一覧

| Stage | 内容 | 不変条件 | 精度の結果 | 判定 |
|---|---|---|---|---|
| **F0** | root/triad/seventh/tensions/bass への内部分解 | 出力完全一致 199/199、7490コード | **7490/7490 identity 保持**、492ラベル → 492分解形（1対1） | **マージ済み**（振る舞い変更なし） |
| **F1** | bass / root / defining tone / ambiguity の shadow 診断 | Timeline・候補順位・warning 199/199 不変 | relation: aligned 76.7% / pedal 16.6% / walking 6.7%。minor が underdetermined な window **17.1%** | **マージ済み**（診断基盤） |
| **F2** | quality template 非依存 factorized root | quality 摂動で root 列完全一致 199/199 | product **92.1%** / shadow **80.2%**（top3 94.4%）、cost **+708** | **F2b 非昇格** |
| **F2R** | 高信頼 pedal/inversion のみの選択的訂正 | plain-triad 不可侵、walking 除外 | override **1件 / 7490**、net gain **0**、abstention **99.99%** | **非昇格** |
| **F2W** | walking bass の候補生成（6 variant） | plain-triad @1 100%、pedal/inversion @3 100% 維持 | **candidateRecall 100%**（全 variant）。@1 / @3 は**1件も動かず** | **F2Wb 非昇格** |
| **F2A** | root ranking の項目別敗因特定 | 重み・閾値 無変更 | 敗因 rootPresence **55.6%** / continuity 34.5%。**validation で再現せず**（寄与 0.0%） | **root 研究終了** |
| **F3a** | 同一 root 内での quality 三値判定 | root/bass 列 199/199 不変、摂動下も不変 | canonicalExact **78.7% → 72.8%**、cost **+349** | **F3b 非昇格** |
| **F5a** | 独立 tension / alteration 検出 | core 4列 199/199 不変、摂動下も不変 | precision **74.6% → 46.3%**、recall 58.7% → 61.3%、cost **+601** | **F5b 非昇格** |

**8 Stage を通じて、製品の判断を上回った subset は1つも無い。**

---

## 2. 非昇格理由（数値付き）

### 2.1 F2b — factorized root を Primary へ

Gold 5962 window

| subset | product | shadow top1 | shadow top3 |
|---|---|---|---|
| plain-triad | **100.0%** | 100.0% | 100.0% |
| pedal/slash | **87.5%** | 58.6% | 100.0% |
| inversion | **86.7%** | 57.5% | 100.0% |
| rootless | **99.4%** | 52.3% | 85.2% |
| walking-bass | **93.8%** | 52.4% | 86.6% |
| **全体** | **92.1%** | **80.2%** | 94.4% |

correction cost **471 → 1179（+708）**。**改善した subset はゼロ。**

### 2.2 F2R — 選択的 root 訂正

| 指標 | 値 |
|---|---|
| overrideCount | **1**（7490 window） |
| overridePrecision | **0.0%** |
| wrongToCorrect / correctToWrong | **0 / 0** |
| netCorrectionGain | **0** |
| abstentionRate | **99.99%** |
| correction cost | **471 → 471（±0）** |

害は無いが、**規則が何もしていないことと区別できない**。事前登録した `contestBand = 0.05` が実測 contestGap の p10（0.0591）より下で、条件1に到達した window の9割以上を排除していた。**その観測を見てから閾値は動かしていない。**

### 2.3 F2Wb — walking bass 候補生成の改良

| variant | @1 | @3 | candidateRecall |
|---|---|---|---|
| current | 10.9% | 61.8% | **100%** |
| strong-beat | 10.9% | 61.8% | **100%** |
| 他4種 | 10.9% | 61.8% | **100%** |

**正解 root は常に候補の中にある（recall 100%）。** 直そうとした対象が存在しなかった。`strong-beat` は通過音を170件落として正解 root を0件しか落とさないが、**@1 も @3 も1件も動かない**。全体はどの variant でもわずかに悪化。

walking subset の3定義（corpus 宣言 531 / 音から判定 265 / F1 relation 501）の**一致はわずか4 window**。

### 2.4 root 研究の終了（F2A）

敗因は明快だった — dominant は rootPresence **55.6%**、continuity **34.5%**。誤 Top 1 の **42.1% が Gold root の完全5度上**、24.6% が長3度上（走るベースの通過音）。

**しかし validation で再現しない。**

| split | rootPresence 寄与率 | dominant |
|---|---|---|
| dev | 66.7% | rootPresence |
| **validation** | **0.0%** | **shellSkeleton** |
| holdout-v2 | 98.9% | rootPresence |
| regression-v3 | 100.0% | rootPresence |

加えて Gold walking window で product は **93.8%（335/357）**、失敗は stress に集中（clean top1 93.3% / stress 10.7%）。

### 2.5 F3b — quality 三値判定を Primary へ

| 指標 | product | shadow |
|---|---|---|
| triad | **91.6%** | 84.4% |
| seventh | **89.7%** | 85.6% |
| quality | **86.5%** | 79.3% |
| **canonicalExact** | **78.7%** | **72.8%** |

correction cost **1271 → 1620（+349）**。

**形が重要**: 助けたい subset（plain-triad / pedal / inversion / rootless）は**すべて cost 差 0 の同点**で、悪化は普通の window に集中。**接続すれば純損失。**

### 2.6 F5b — 独立 tension 検出

| 指標 | product | shadow | 差 |
|---|---|---|---|
| precision | **74.6%** | 46.3% | **−28.3pp** |
| recall | 58.7% | **61.3%** | +2.6pp |
| F1 | **65.7%** | 52.7% | −13.0pp |
| **FP / window** | **0.082** | 0.290 | **3.5倍** |
| canonicalExact | **78.7%** | 68.6% | −10.1pp |

correction cost **+601**。**recall だけ上がって false positive が増える**形であり、事前に定めた非推奨条件に該当。

---

## 3. 現行製品の既知制約

Stage F で**定量化された**制約。いずれも修正していない。

| 制約 | 実測値 | 出典 |
|---|---|---|
| **pedal / slash 誤認** | pedal/slash subset の canonicalExact **56.3%**、root 精度 87.5%。bass が upper と別のことを言う window が全体の **16.6%** | F1 / F2 / F3a |
| **rootless の一部誤認** | rootless subset の canonicalExact **85.5%**。root 精度は 99.4% で高いが、和音全体の同定では落ちる | F2 / F3a |
| **walking の一部誤認** | corpus 注釈 walking window で root 精度 **93.8%**。F1 の walking 分類は precision 90.5% / **recall 25.0%** | F2A |
| **alteration recall 0%** | `b9` / `#9` / `#11` / `b13` / `b5` / `#5` の **recall 0.0%**。製品は alteration を1つも検出していない | F5a |
| **tension 脱落** | tension recall **58.7%**、precision 74.6%。`A7#5` から `A7` への脱落は個別の不具合ではなく **alteration 検出が存在しないことの一例** | F5a |
| **arpeggio 境界問題** | arpeggiated subset の canonicalExact **62.7%**（全体 78.7%）、root 精度 92.7%、tension recall 52.1% | F2 / F3a / F5a |
| **humanized 境界問題** | humanized subset の tension precision **65.7%**、FP/window 0.121。canonicalExact 87.7% は高いが装飾音と拡張の区別が弱い | F5a |
| **quality の未支持断定** | triad がどれも supported でない window **11.6%**、seventh **7.9%**。製品は canonicalExact 78.7% で残り 21.3% を黙って断定しており、根拠の有無を区別する手段が無い | F3a |
| **Chord Drip corpus の低精度** | canonicalExact **29.7%**、root 精度 62.1%、tension recall 26.2%。生成記録との不一致が最も大きい corpus | F2 / F3a / F5a |

---

## 4. Manual Candidate Rescue が正式な補正経路

**検出を直せないことは確定した。直せるのはユーザーである。** P4.1.3 で実装済みの経路が正式な補正手段となる。

| 操作 | 実装 | 状態 |
|---|---|---|
| **任意範囲から候補を作成** | `createCandidateFromTimelineRange` / Full Timeline の「範囲から候補を作成」 | **既定で利用可能** |
| **コードを追加** | `insertSuggestedEditableChordAfter` | 利用可能 |
| **コードを置換** | `replaceEditableChord` | 利用可能 |
| **コードを削除** | `deleteEditableChord` | 利用可能 |
| **イベントを分割** | `splitEditableChord` | 利用可能 |
| **イベントを結合** | `mergeEditableChords` | 利用可能 |
| **Undo / Redo** | `editHistory.ts` | 利用可能 |
| **範囲の伸縮** | 8方向（開始/終了 × 1拍/1小節 × 前後）+ 選び直し | 利用可能 |
| **試聴** | 保存対象と同一のイベント列を再生 | 利用可能 |
| **Vault へ保存** | 既存の `SaveProgressionPopover` から `applyVaultChange`、autosave | 利用可能 |
| **Chord Dojo で利用** | 普通の `SavedProgressionBlock` として `progressionBlocks` に入る | 利用可能 |

実測（P4.1.3-M5、Manual Recoverability Hard Gate 17項目すべて PASS）:

| 指標 | 値 |
|---|---|
| 自動候補が完全一致しない区間への到達 | **10/10**（現行UI以前は 0/10 が表現不能） |
| 1操作で Gold 一致 | **9/10** |
| 平均操作数 | **1.5**（中央値 1） |
| 任意長 range 作成 | **910/910**、64種類の長さ |

**上記「既知制約」のすべてが、この経路で手動修正可能である。** alteration 脱落も、範囲を選んでコードを置換すれば保存できる（S24_stress で実測 6操作）。

---

## 5. F3a / F5a の診断は将来の曖昧性 UI 用バックログとして保持

**削除しない。** 製品判断には接続しないが、以下は「この和音は確定していない」と伝えるための材料として価値がある。

| 診断 | 実測 | 保持先 |
|---|---|---|
| triad の三値判定（supported / contradicted / underdetermined） | triad 未支持 **11.6%**、seventh 未支持 **7.9%** | `shadowQuality.ts` |
| 反証による除外 / 欠落のまま生存 | 除外 7.12/window、**欠落のまま生存 1.50/window** | 同 |
| tension の支持（presence / duration / metric / voice-role / sustained） | `underdetermined` 6.00/window | `shadowTension.ts` |
| bass-upper relation とその margin | pedal 16.6% / walking 6.7% | `shadowEvidence.ts` |
| ambiguity 種別 | rootless-inferred 24.7% / pedal-or-root 17.3% / inversion-or-added 12.4% | 同 |

**方向が違う。** 精度を上げるのではなく、**不確かさを見せる**。Stage F の8段階が示したのは、前者は行き止まりで後者だけが残ったということである。

---

## 6. F6 / F7 は任意バックログへ

| Stage | 旧扱い | **新扱い** |
|---|---|---|
| F6 | 必須工程 | **任意バックログ**。未着手 |
| F7（曖昧性 UI） | 必須工程 | **任意バックログ**。未着手。§5 の診断が入力になる |

**どちらも Phase 4.x の完了条件ではない。**

---

## 7. `phase4-v1` を正式既定として固定

```ts
export const phase40DefaultAnalyzerMode = "phase4-v1" as const;
export const defaultAnalyzerMode = phase40DefaultAnalyzerMode;
```

| 項目 | 状態 |
|---|---|
| **`defaultAnalyzerMode`** | **`phase4-v1`（正式既定・固定）** |
| root / bass / triad / seventh / tension | すべて `phase4-v1` の値 |
| Candidate Catalog | `phase4.1.2-v1` 系で **opt-in**（未昇格） |
| Manual Candidate Rescue | **既定で利用可能** |
| G2（two-pass selection） | opt-in |
| `phase4.1-v1` | 削除していない |
| 保存 schema / `fileVersion` | **無変更 / 1** |
| F0 から F5a | 診断基盤として保持、製品経路へ非接続 |
| F2W 音響 heuristic | **製品判断へ使用しない**（531 中 7 window しか拾えない） |
| F4 Primary root routing | **禁止** |

---

## 8. rollback 方法

Stage F は**製品の既定を一度も変えていない**。すべての Stage が独立したマージコミットで、診断モジュールはどこからも呼ばれていない。

| 範囲 | 手順 |
|---|---|
| Closeout のみ | 本 PR を revert（ドキュメントのみ） |
| F5a | PR #210 を revert |
| F3a | PR #209 を revert |
| F2A | PR #208 を revert |
| F2W | PR #207 を revert |
| F2R | PR #206 を revert |
| F2 | PR #205 を revert |
| F1 | PR #204 を revert |
| F0 | PR #203 を revert |
| **Stage F 全体** | #203 から本 PR までを新しい順に revert |
| **P4.1.3 Manual Rescue** | #198 から #202 を新しい順に revert |
| **P4.1.2-H Catalog** | #191 から #195 を新しい順に revert |

いずれも保存データの移行を伴わない（`fileVersion` 1、schema 無変更）。手動候補を保存済みのユーザーがいても、保存物は普通の `SavedProgressionBlock` なので revert 後も読める。**force-push は一度も使っていない。**

---

## 9. 全検証

| コマンド | 結果 |
|---|---|
| `npm run lint` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm test -- --run` | **1592 passed / 183 files** |
| `cargo test` | **PASS** |
| `npm run build` | **PASS** |
| `npm run tauri build` | **PASS**（msi + nsis） |
| `git diff --check` | **clean** |
| `npm run check:staged` | **clean** |
| `git ls-files "*.mid" "*.midi"` | **0 files** |

---

## 10. Phase 4.x — complete

### 到達したもの

| Phase | 成果 |
|---|---|
| **4.0** | Chord Label 契約、Candidate Block v2、評価指標 v2、`phase4-v1` を既定へ |
| **4.1** | Pattern / Occurrence モデル、Coverage Selector、Section Segmentation |
| **4.1.1** | Endless 不具合の再現と Stage 特定、`phase4-v1` へ rollback |
| **4.1.2** | Synthetic Gold / Long-form / regression-v3 コーパス、**Candidate Catalog v1**（非破壊在庫）、動的 Recommendation、Catalog UI |
| **4.1.3** | **Manual Candidate Rescue** — 任意範囲から候補を作成・編集・試聴・保存 |
| **Stage F** | root / quality / tension の8段階 shadow 研究。**すべて非昇格**、既知制約を定量化 |

### 中心的な結論

**検出器の判断を置き換える試みは、8段階すべてで悪化した。**

| Stage | 製品 | shadow |
|---|---|---|
| F2（root 精度） | 92.1% | 80.2% |
| F3a（quality canonicalExact） | 78.7% | 72.8% |
| F5a（tension F1） | 65.7% | 52.7% |

**残ったのは2つ。**

1. **ユーザーが直せる経路**（Manual Candidate Rescue）— 0/10 が表現不能だった区間が 10/10 到達、平均 1.5 操作
2. **不確かさを見せる材料**（F3a / F5a 診断）— 曖昧性 UI のバックログとして保持

Phase 4.x はここで **complete** とする。既定は `phase4-v1`、補正はユーザーの手で、残る精度改善は任意バックログである。
