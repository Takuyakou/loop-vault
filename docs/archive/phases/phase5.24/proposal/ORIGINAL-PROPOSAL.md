<!-- phase-id: 5.24 -->
# Loop Vault 提案書 Phase 5.24 — Harmonic Rhythm & Performance Fragment Consolidation(統合版)

対象: 演奏キャプチャ由来MIDIで、1つの和音がバッキングの断片に割れて複数コードとして検出される問題。

**本書は初版のレビューを反映した統合版である。** レビューが指摘した重大な欠陥(包含判定)を修正し、Hard Negative Cases と循環参照回避を取り込んだ上で、Stage構成は軽く保っている。

**本書は提案であり作業指示書ではない。** 実装時は `PLAN.md` + `stages/*.md` へ分割すること。

---

## 1. 結論

**「演奏上の打鍵」と「和声上の変化」を分離する。**

1. **和声リズムの推定** — 曲ごとに「何拍でコードが変わるか」を先に決め、その単位で集約する
2. **Voice内のベースレーン追跡** — 断片ごとの最低音をrootにしない
3. **証拠ベースの断片統合** — 「同一和声状態の証拠」と「変化の証拠」を突き合わせて判定する

## 2. 初版からの変更点(レビュー反映)

| # | 初版 | 統合版 |
|---|---|---|
| **1** | 「PC集合が包含関係なら統合する」 | **破棄。** 包含は補助証拠にすぎない(§5.2) |
| 2 | Hard Negative の明示なし | **A–K fixtureをStage 00で固定**(§6) |
| 3 | 循環参照への言及なし | 和声リズム推定は**コードidentity以前の証拠のみ**を使う(§4.3) |
| 4 | 指標の定義なし | Fragmentation Ratio 等を定義(§8) |

### 2.1 最重要の修正 — 包含判定は誤り

次のpitch setは包含リスクだけを示すために人工的に作ったsynthetic exampleである。初版の包含規則を実装すると、正しい進行を破壊する。

```
C     = {C E G}
Am7   = {A C E G}      →  {C E G} ⊂ {A C E G}
```

包含が成立するが、**C → Am7 は本物のコードチェンジ**である。同型の危険例が多数ある:

`C → Cmaj7` / `F → Dm7` / `G → Em7` / `Am → Am7` / `C → C6`

**ダイアトニック進行の大半が包含関係を持つ。** 初版の規則は、この機能が最も壊してはいけないものを壊す。

## 3. 抽象的なfailure model

演奏入力では、同じ和声状態を支える音が同時ではなく複数のattackへ分散しうる。
個々のattackだけを和声単位として扱うと、左手・右手・装飾音・再打鍵を別の
コード変化と誤認しやすい。P5.24はこの一般的な構造を対象にする。

以降の具体例とA–K fixtureは、すべて仕様検証のために人工的に構成した
synthetic dataである。実キャプチャ、外部MIDI、ユーザーデータから得た
小節数、ノート数、テンポ、拍位置、pitch set、集計値は本書に保持しない。
## 4. 和声リズムの推定

### 4.1 出力

```
harmonicRhythm: 1 | 2 | 4 | 8 beats | unknown
```

**まずGlobal(曲全体で一定)から始める。** Local推定は本Phaseではdeferredとし、mixed evidenceはunknownへfail closedする。

### 4.2 証拠

| 証拠 | 内容 |
|---|---|
| ベース変化周期 | 低音域ノートのPCが変わる間隔 |
| セル内一貫性 | 各単位で集約したときのクロマ安定度 |
| セル間分離度 | 隣接セルのクロマがどれだけ異なるか |
| 新規性の周期 | クロマ新規性カーブの自己相関ピーク |
| 強拍整列 | オンセットが小節頭・半小節に集中しているか |

### 4.3 循環参照の回避(必須)

**推定に現在のコード判定結果を使わない。** `detectedChord === Cmaj7` のような identity を主証拠にすると循環する。

使ってよいのは**コードidentity以前の証拠**のみ:
note activity / bass lane / pitch-class activity / onset structure。

### 4.4 フォールバック

confidence が閾値未満なら `unknown` とし、**legacy path へ戻す**。推定値を無理に作らない。

## 5. 断片統合の判定

### 5.1 二方向の証拠を突き合わせる

```
同一和声状態か = 同一状態の証拠 − 変化の強い証拠
```

**「同一である証拠」だけで決めない。** 変化の証拠が強ければ、いくら似ていても分割する。

| 同一状態の証拠 | 変化の強い証拠 |
|---|---|
| 同じ和声リズムセル内にある | **ベースPCが変わった** |
| ベースレーンが安定している | **持続する新しいPCが出た** |
| 断片が互いに矛盾しない | 新しいテクスチャが安定した |
| 時間的に連続している | **強い拍節境界**(小節頭など) |
| 支持音が繰り返し現れる | 局所的な和声リズム境界 |

### 5.2 包含関係の扱い(初版からの修正)

**包含は統合の判定基準ではなく、補助証拠である。** 次のpitch setも人工的に構成したsynthetic exampleである。

```
{C D E G} ⊂ {C D E F G A}   → 同一状態「かもしれない」という補助証拠
```

この補助証拠は、**§5.1 の他の証拠と併せて初めて意味を持つ**。単独では統合しない。

特に、**包含に加えて「新しいPCが持続的かつ強拍に現れている」場合は、変化の証拠が優先する**(C → Am7 の A、C → Cmaj7 の B がこれに該当)。

### 5.3 Voice内ベースレーン追跡

attackごとの最低音をroot扱いすると、上声の最低音、passing tone、walking
motion、pedal、転回形をBass Stateと誤認しうる。

- 低音域候補を独立したevidence laneとして追跡する
- register / duration / strong beat / continuity / texture separationを併用する
- 単一attackの最低音やBass PC movementだけで和声変化を確定しない

これは既存のrole evidenceを、Voice内部の時間的evidenceへ拡張する設計である。
## 6. Hard Negative Cases(Stage 00 で fixture 化)

次のA–Kはすべて明示的に構成したdeterministic synthetic fixtureである。

| ID | ケース | 期待される挙動 |
|---|---|---|
| A | 同一和音の繰り返しと短いtransient tension | 1つのstable stateへ統合し、flutterさせない |
| B | 部分Voicingの断片 | 1つのstable stateへ統合する |
| C | synthetic C→Am7 | 包含関係でも分割する |
| D | synthetic C→Cmaj7 | persistent structural changeとして分割する |
| E | 1小節に2コード | 正しい境界を保持する |
| F | 2小節に1コード | 再打鍵を過分割しない |
| G | pedal bassと上物変化 | 上物の変化を保持する |
| H | walking bassとstable harmony | Bass movementだけで分割しない |
| I | 転回形 | locked identity policyに従い同一和声を保つ |
| J | anticipation | global toleranceとは別に早期stable boundaryを禁止する |
| K | mixed harmonic rhythm | unknown / legacy fallbackへfail closedする |

C、D、E、G、J、Kはpromotionのhard safety checksに含める。
## 7. 出力

統合結果は「和声状態のタイムライン」として表す。

- 各状態: 開始/終了、PC集合、ベース、**構成した断片の数**、confidence
- 同一状態を構成したsynthetic/performance fragmentのcountを保持する
- 診断出力に、推定した和声リズムとその証拠を残す

## 8. 評価指標

| 指標 | 定義 |
|---|---|
| Fragmentation Ratio | detected harmonic states / ground-truth harmonic states |
| Change Precision | one-to-one matched predicted changes / predicted changes |
| Change Recall | one-to-one matched predicted changes / expected changes |
| False Merge Rate | unmatched expected changes / expected changes |
| Over-segmentation Rate | max(0, detected states - expected states) / expected states |

Boundary matchingは現行official toleranceを再利用し、sorted boundary上の
deterministic maximum-cardinality one-to-one matchingとする。expected changeが
空でpredicted changeがある場合、precisionは0、recallは1、False Mergeは0で、
Over-segmentationが失敗を表す。Jはtolerance内でもground-truthより早いstable
boundaryを独立に不合格とする。
## 9. Stage 構成

| Stage | 内容 |
|---|---|
| 5.24-00 | repository audit / deterministic synthetic A–K / locked metrics and promotion contract |
| 5.24-01 | Global Harmonic Rhythm + Voice-internal Bass Laneをshadow診断 |
| 5.24-02 | Fragment Consolidationをshadow評価し、promotion decisionを固定contractで実行 |
| 5.24-03 | promotion PASS後だけdefault-OFF flag integrationとOFF equality |
| 5.24-04 | full Tier 3 gate、artifact、Human Acceptance準備 |

Intermediate Stageはfocused Tier 1/2とPhase固有安全Gateを実行し、full Vitest、
full Playwright、Tauri release build等はFinal Stageへ集約する。

## 10. Gate

- exact unique complete A–K metricsであり、truth cardinalityがA1/B1/C2/D2/E4/F2/G2/H1/I1/J2/K6であること
- Bass evidence照合がdeterministic PC interval index/sweepで、state-by-note全走査を行わないこと
- aggregateはfixture metricsから厳密に導出されること
- False Merge Rateが0であること
- hard fixtures C / D / E / G / J / Kが全て安全条件を満たすこと
- predicted stateのlabel + normalized pitchClassesがC/Am7、C/Cmaj7、inversion Iを含むsynthetic truthと一致すること
- Harmonic Rhythmはexact A-K（A-D/G-J=4、E=2、F=8、K=unknown）で、Kのみfallbackすること
- Bass Lane resultはexact A-K、full contiguous coverage、truth equivalence、安全違反0であること
- Jはanticipation位置でstable boundaryを早期確定しないこと
- Kはunknownとlegacy fallbackへfail closedすること
- A / B / F / H / Iは過分割しないこと
- transient tensionがstable-state flutterを作らないこと
- flag OFFで影響出力がlegacyとdeep-equalであること
- raw/display MIDI、Vault schema、fileVersion、rankingを変更しないこと
- NaN / Infinity / out-of-range / incomplete / duplicate入力はpromotion FAILになること
- benchmarkはmeasured E x128 / 3072 notes / warmup durations 3 / sample durations+ratios 7 / derived median+max / timeout enforcement 10000 ms / locked provenanceを証明すること
- privacy、security、determinism、bounded-resource条件を満たすこと

## 11. 実装上の判断

Global-firstはv1の複雑さを制限するための設計判断であり、mixed evidenceを
単一周期へ強制してはならない。Local/section estimatorはP5.24では実装せず、
Kでunsafeなglobal推定を防ぐ。

Fragment Consolidationは変化を減らす方向へ働くため、Fragmentation Ratio
だけで成功を判断できない。False Merge、Change Recall、hard fixtures、
Human Acceptanceを優先し、promotion結果を見てthresholdを緩めない。

A–Kのtruthはsynthetic constructionにより固定する。private MIDI/audio、
外部corpus内容、個人path、device id、raw note dumpはfixture、ログ、report、
proposalへ入れない。
## 12. やらないこと

- **PC包含関係のみによる統合**(初版の誤り)
- 量子化・タイミング補正(**演奏の揺れは直さない**。集約の単位を変えるだけ)
- テンポマップの書き換え
- 和声リズムのハードコード
- 推定が曖昧なときに推定を装うこと
- スコアリング・語彙・候補生成の変更(**本提案は集約の前段のみ**)
- Voice 役割推定そのものの変更(Phase 5.21 の範囲)
- Local(セクションごと)の和声リズム推定(Global の結果を見てから)

## 13. 位置づけ

従来の検出改善が「何の和音か」を主に扱うのに対し、本提案は「どこから
どこまでを1つの和声状態として扱うか」を担当する。対象は演奏入力に一般的な
非同時attack、再打鍵、Voice間の時間差であり、設計根拠はprivate captureの
具体値ではなくsynthetic contractで検証する。
Phase 5.23 が「候補をどう見せるか」なら、本提案は「**候補の切れ目をどこに置くか**」である。
