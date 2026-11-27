# Phase 9 Core v2 — Architecture Freeze v5

**Status:** Freeze Candidate
**Purpose:** Phase 7・8 で固めた Core v2 方針を再設計せずに統合し、Phase 9 の研究・実装順序・昇格条件・修正支援契約を固定する。
**Product priority:** 解析時間が多少増えても、MIDI 取り込み後の修正量を減らし、元 MIDI の音・配置・境目を壊さず、誤解析時にも素早く人間が直せることを優先する。

---

# 0. 結論

Phase 9 では Core v2 をゼロから考え直さない。

Phase 7・8 で採用した **Architecture A = Source-preserving architecture** を土台にする。

Core v2 の原則:

1. Source Truth と Harmonic Interpretation を分離する
2. Tier 1 を最優先にする
3. Boundary / Segmentation を独立問題として扱う
4. Voice / Role / Bass / Root を分離する
5. Candidate Recall → Ranking → 必要なら Decoder の順に扱う
6. Top-K / Ambiguity / UNKNOWN を内部表現として扱う
7. **音を落とす誤りを、余計な音より重く扱う**
8. **除外した音を捨てず、理由付きで復元可能にする**
9. **修正用 Evidence を Core Result の正式出力にする**
10. Correction Cost を主要 Product KPI にする
11. 研究結果を shadow 比較してから Product に昇格する
12. 勝った共有修正は、必要なら Tournament 前でも独立昇格できる
13. モードごとに別 Core を作らない

Phase 9 の仕事は、

> **Phase 7・8 で研究済みだが未昇格の部品を、正しい順番・同じ評価契約で比較し、勝ったものだけ Core v2 として昇格させること**

である。

---

# 1. Architecture A

```text
MIDI Source
   │
   ├──────────── Source Truth / Tier 1 ───────────────┐
   │                                                   │
   │                                                   ▼
   │                                           Source Playback
   │
   └─ Boundary / Event ─→ Harmonic Interpretation / Tier 2
                              │
                              ├─ Candidate
                              ├─ Ranking
                              ├─ Top-K
                              └─ Display / Search / Degree
```

**コード名が間違っても、元 MIDI の音まで変わってはいけない。**

---

# 2. Tier 1

Tier 1 は以下の Source Fidelity。

- MIDI note number
- octave
- bass placement
- onset / offset
- duration
- boundary
- SourceSnapshot
- save / reload
- card playback
- Capture playback
- Whole playback

最重要条件:

> **和声・伴奏として残すべき元 MIDI の構成音が、元の配置・オクターブで鳴ること。**

コード名 exact は Tier 2 であり、Tier 1 より優先しない。

---

# 3. Excluded Note は捨てない

「和声解釈から除外」と「Source Truth から削除」を分離する。

最低限:

```ts
ExcludedNoteEvidence {
  noteId
  midiNote
  sourceTick
  duration
  roleReason
  confidence
}
```

を Core Result に持つ。

目的:

- 何を外したか分かる
- なぜ外したか分かる
- confidence が分かる
- 人間が戻せる

## 復元可能性

**復元可能性そのものは Core v2 の必須条件。**

ただし保存形式は Phase 9.8 まで固定しない。

- 取り込み中: 必ず復元可能
- 保存後: Product Integration 時に、復元可能性を維持できる persistence 方式を必ず選ぶ
- 元 MIDI 全体を Vault に保存する必要はない
- optional field / compact evidence / fileVersion 3 のどれを使うかは Phase 9.8 で決める

「保存しない」ことは選択肢にしない。
**保存後も復元可能であることが要件、保存形式だけが未決。**

---

# 4. Missing / Extra の非対称 Gate

Missing と Extra を同じ重さで扱わない。

## Hard Guardrail

以下の増加は不合格。

- Bass Missing
- Defining Tone Missing
- Support / Harmony Note Missing
- Support Note Recall 低下

例外は、Human Gate で明示承認し、理由と影響を記録した場合のみ。

## Extra Note

別指標で管理する。

- Extra Note Precision / Count
- Extra Note Guardrail

Extra Note は無制限に許可しない。

方針:

> **Recall 優先。ただし Precision も guardrail を持つ。**

---

# 5. Support Note Recall の定義

corpus ごとに ground truth の意味が違うため、同じ指標名へ無理に統合しない。

## Synthetic Usage Profile

generator が note role を生成する。

最低限:

- support / harmony
- melody-like
- ornament
- bass

を ground truth として持つ。

ここでは:

**Support Note Recall**

を測る。

## Public Harmony

role label が無い場合、Gold note set を利用する。

ここでは:

- Gold Note Recall
- Gold Note Precision
- Bass agreement

を測る。

Synthetic Support Note Recall と同じものとして合算しない。

## Private witness

ground truth tuning に使わない。

最後の aggregate regression / human listening のみ。

---

# 6. Tier 2

Tier 2 は Harmonic Interpretation。

以下を区別する。

- canonical identity
- root
- bass
- quality
- extensions
- alterations
- omissions
- pitch-class agreement
- acceptable alternate interpretation
- notation-only difference
- defining-tone loss
- UNKNOWN / ambiguity

surface exact だけで評価しない。

---

# 7. Boundary 3種

1. Harmonic Boundary
2. Voicing Boundary
3. Note Event / Ornament / Re-strike

短い装飾音ではカードを割らない。

全声部が同時に動く短い経過和音は、短くても Harmonic Event 候補。

---

# 8. Root と Bass

```text
Observed Bass != Harmonic Root
```

を前提にする。

slash chord / rootless / pedal bass を扱える構造にする。

---

# 9. Voice / Role Evidence

最低限 evidence として:

- bass-like
- inner harmony
- upper harmony
- melody-like
- ornament-like
- pedal / sustained

を扱える。

完全な voice separation は必須ではない。

---

# 10. Candidate / Ranking

```text
Candidate Generator
        ↓
Candidate Set
        ↓
Factorized Ranking
        ↓
Top-K / UNKNOWN
```

Candidate は Recall 重視。

Ranking は候補から妥当なものを選ぶ。

巨大な monolithic if 文は禁止。

---

# 11. Decoder

Decoder は前提ではない。

Ranking が固まった後に比較:

- No Decoder
- Current Decoder
- C1
- C2

9.6 開始前に Promotion Contract を Freeze。

最低条件:

- Tier 1 非悪化
- Boundary 非悪化
- Tier 2 acceptable 改善
- Correction Vector 改善
- Review metrics 非悪化
- runtime budget 内

同等なら **No Decoder**。

---

# 12. Canonical Identity

内部 identity と表示文字列を分離する。

`alt` のような曖昧表記を Product 表示の基準にしない。

---

# 13. UNKNOWN / Ambiguity

Top-K と confidence / margin を内部保持できる構造を維持する。

Persistence は Phase 9.8 で決める。

---

# 14. Core Result Contract

Phase 9.0 で固定する。

最低限:

```text
AnalysisResult
├─ SourceTruth
├─ HarmonicInterpretation
├─ ExcludedNotes[]
│    ├─ note
│    ├─ reason
│    └─ confidence
├─ BoundaryCandidates[]
│    ├─ position
│    ├─ type
│    └─ confidence
├─ TopKIdentities[]
│    ├─ identity
│    ├─ score
│    └─ evidence
├─ Uncertainty
├─ Attack / Re-strike Evidence
└─ ReviewReasons[]
```

目的:

> **Core が間違っても、人間が数クリックで直せる材料を失わない。**

Core Result Contract と Vault Schema は分離する。

---

# 15. Usage Profile Synthetic Corpus

## Clean / DAW-like

- block chord
- split bass
- repeated chord / re-strike
- pedal tone
- upper-note motion
- inner voice motion
- arpeggio
- delayed support tone
- anticipations
- short passing harmony
- 1 beat / half beat passing harmony
- rootless
- omitted fifth
- extensions / alterations
- dense / sparse voicing
- register variation
- quantized DAW MIDI

## Audio-to-MIDI / transcription-like

- ghost note
- false short note
- octave harmonic duplicate
- missing note
- note-length bleed
- onset smear
- early / late note-off
- duplicate note
- low-confidence spurious note

## Timing / metadata

- tempo metadata mismatch
- barline offset
- downbeat offset
- quantization error
- PPQ variation
- meter representation difference
- 1/4-like exported bar representation

## Instrument behavior

- piano block
- guitar strum / staggered onset
- pad long sustain
- arpeggiated synth
- split bass
- pedal bass
- mixed attack timing

private MIDI の raw pattern をコピーして作らない。

---

# 16. Metamorphic Testing

最低限:

- transpose
- tempo change
- small onset jitter
- velocity variation
- register shift
- meter representation
- semantically equivalent track split / merge

permanent regression corpus とする。

---

# 17. Correction Vector / Interaction Cost

## Phase 9.0〜9.7

重みを付けない raw count:

```text
split
merge
noteAdd
noteRemove
rootFix
bassFix
qualityFix
tensionFix
```

## Phase 9.8

UI が確定した後に **Interaction Cost** へ変換する。

研究指標と UI 操作数を混ぜない。

---

# 18. Review Metrics

- Review Precision
- Review Recall
- Review False Alarm / 100 cards

`要確認` だらけの Core は不合格。

---

# 19. Provenance

最低限:

```text
corpusId
corpusVersion
manifestSha
split
codeCommit
policyId
boundarySource
identitySource
snapshotSource
scoringContract
metricVersion
```

比較対象で意図しない差があれば:

```text
COMPARISON_INVALID
```

---

# 20. Existing MIDI Analysis Modes

既存 UI の:

- chord only
- harmony
- harmony + bass
- accompaniment
- all parts
- custom

等は Phase 9 に関係する。

ただし:

- モードごとに別 Core を作らない
- 新しい AnalysisProfile API を最初から固定しない

Phase 9.0 で既存 role / track / selection 情報がどこまで Core 入口へ渡っているか監査する。

不足が実証された場合だけ structured hint / profile を設計する。

---

# 21. Phase 9 実行順序

## Phase 9.0 — Architecture Consolidation, Baseline & Holdout Seal

### やること

- Architecture Freeze
- Core Result Contract
- Existing MIDI mode audit
- Melody / Exclusion audit
- current master baseline
- Usage Profile Synthetic generator
- Metamorphic harness
- Provenance validator
- Holdout seal
- Gate threshold freeze preparation

### 現行 filter audit

現行 melody / ornament / role filter が、

- support missing
- defining-tone missing
- bass missing

をどれだけ生んでいるか測る。

### Threshold freeze

9.0 baseline を取得後、**9.2 開始前に以下を数値で Freeze**:

- Extra Note Guardrail
- Review Precision minimum
- Review Recall minimum
- Review False Alarm maximum
- Runtime warning / hard budget
- Memory budget
- Card Inflation guardrail

### Sealed Holdout

9.0 で生成・封印する。

単に seed を変えただけは禁止。

holdout は dev と分布をずらす。

例:

- dev に無い tempo range
- dev に無い jitter range
- dev で単独だった scenario の組み合わせ
- 別 register range
-複合 noise 条件
-別 instrument behavior 組み合わせ

固定するもの:

- generator version
- recipe family
- parameter ranges
- seed
- manifest
- SHA

封印手順:

1. manifest 生成
2. recipe/version/ranges/seed/hash 固定
3. sealed storage へ保存
4.通常 evaluator からアクセス不可
5. 9.7 で unlock を記録
6.実行回数を 1 回として記録
7.結果を見た後は再調整禁止

新しい scenario は public stress corpus へ追加し、sealed holdout は変えない。

### 受け入れ条件

- baseline table
- same-provenance comparison
- COMPARISON_INVALID
- deterministic synthetic
- deterministic metamorphic
- exclusion audit
- sealed holdout
- threshold freeze plan
- Product behavior unchanged

---

## Phase 9.1 — Source Independence Research

shadow:

```text
A = Current Product source selection
B = Identity-independent source selection
```

比較:

- Tier 1 exact
- Support Note Recall
- Public Gold Note Recall
- missing / extra
- bass
- defining tone
- octave / register
- save / reload
- card / Capture / Whole
- runtime
- Correction Vector
- Review metrics

Promotion 候補条件:

- Tier 1 改善
- Support Note Recall 非悪化
- Public Gold Note Recall 非悪化
- Bass loss 非悪化
- defining-tone loss 非悪化
- Extra Note guardrail 内
- current MIDI modes 非悪化
- private witness で catastrophic regression なし
- rollback 可能

---

## Phase 9.1-P — Optional Shared Product Promotion

9.1 が明確に勝った場合のみ。

Tournament 前でも先行昇格可。

これは Architecture A の共有修正として扱う。

条件:

- 9.1 の Promotion Gate 全通過
- private witness は aggregate regression / listening のみに使用
- feature flag / rollback
- save/reload non-regression
- card / Capture / Whole non-regression
- current MIDI modes non-regression
- focused + fresh FULL PASS
- Human approval

9.1-P を通過した場合、後続研究はその Product baseline を基準に更新する。

---

## Phase 9.2 — Temporal v2

対象:

- Harmonic Boundary
- Voicing Boundary
- Note Event
- re-strike
- short passing harmony
- delayed support
- pedal
- ornament
- ghost bass
- off-beat octave
- arpeggio

Bounded Selector で card inflation を制御。

KPI:

- Harmonic boundary
- Voicing boundary
- passing chord recall
- re-strike accuracy
- Card Inflation
- Correction Vector
- Review metrics
- runtime

---

## Phase 9.3 — Source Extraction v2

条件付き。

9.0〜9.2 で extraction が主要 bottleneck と証明された場合のみ。

Hard Guardrail:

- Support Note Missing 増加 = 不合格
- Bass Missing 増加 = 不合格
- Defining Tone Missing 増加 = 不合格

例外:

**Human Gate で明示承認し、理由と影響を記録した場合のみ。**

Extra Note は別 guardrail。

---

## Phase 9.4 — Tier 2 Scoring Contract

区別:

- exact canonical identity
- acceptable alternate interpretation
- same pitch-class + bass
- defining-tone loss
- optional-tone omission
- notation-only difference
- unsupported vocabulary
- ambiguous / UNKNOWN

P8.6 candidate results を再採点する。

---

## Phase 9.5 — Candidate Ranking v2

factorized score:

- pitch
- bass
- voice-role
- duration
- boundary confidence
- defining tension
- NCT penalty
- vocabulary prior
- local harmonic context

KPI:

- Candidate Recall
- Tier 2 Top1
- Top-K
- margin
- UNKNOWN calibration
- Correction Vector
- Review metrics

---

## Phase 9.6 — Decoder Decision

開始前に Promotion Contract を数値で Freeze。

比較:

- No Decoder
- Current
- C1
- C2

同等なら No Decoder。

---

## Phase 9.7 — Core v2 Tournament

比較:

- Current Product Core
- Core v2 candidate
- Copy-Oracle
- Copy-Simple
- Copy-ProductBoundary
-必要な historical baseline

別列で評価:

- Tier 1 Exact
- Synthetic Support Note Recall
- Public Gold Note Recall
- Source precision
- Bass loss
- Defining tone loss
- Boundary
- Voicing boundary
- Tier 2 acceptable
- Candidate Recall
- Correction Vector
- Review Precision / Recall
- Review False Alarm
- Card Inflation
- Runtime
- Memory
- Determinism

9.0 で封印した holdout を初めて 1 回だけ開封。

private witness human listening はここで初回。

---

## Phase 9.8 — Product Integration & Persistence Decision

Tournament 通過時のみ。

### Feature flag

Current Core / Core v2。

### Persistence

保存形式はここで決めるが、以下の要件は必須:

-保存後も Excluded Note を復元可能
-既存 Vault 自動書き換え禁止
-round-trip
-backup / rollback

検討:

- attacks
- excluded-note evidence
- UNKNOWN / PARTIAL
- Top-K persistence
- Vault v2 optional fields
- fileVersion 3

### Interaction Cost

Correction Vector を実 UI の操作数へ変換。

### Product E2E

- MIDI import
- card playback
- Capture
- Vault
- Progression
- Voicing Loop
- review / restore flow

private witness final human acceptance。

---

# 22. Concurrent Work Boundary

Phase 名に依存しない。

## Research 9.0〜9.7 と並行可能

- Chord Dojo UI
- Bass Practice UI
- Progression UI
-修正画面 prototype

条件:

- separate worktree
- Product default Core を変更しない
- Vault schema を変更しない
- Core Result Contract を無断変更しない
- playback resolver を同時変更しない

## 修正画面 prototype

9.0 で Core Result Contract が Freeze したら開始してよい。

ただし:

- fake / synthetic AnalysisResult を使う
- Product persistence に接続しない
- Core 実装に依存しない
- prototype の目的は操作数と修正フローの検証

対象:

- excluded note restore
- boundary split / merge
- Top-K selection
- ReviewReason display

9.8 の Interaction Cost 設計へ利用する。

## 同時変更禁止

- Capture import path
- playback resolver
- Vault schema
- Progression data contract
- Practice playback input
- Core Result Contract

## Phase 9.8 中

上記 integration surfaces を一時 freeze。

---

# 23. Private MIDI 使用範囲

使用可:

- 9.1-P catastrophic regression / aggregate listening
- 9.7 catastrophic regression / human listening
- 9.8 final human acceptance
- aggregate statistics

禁止:

- tuning
- parameter selection
- model selection
- boundary GT
- raw note dump / path / song name の報告

---

# 24. Test DX

通常:

```text
edit → FAST → FEATURE → next
```

UI / Product integration 時のみ UI gate。

fresh FULL:

- stage candidate
- shared Product Promotion
- shared infrastructure
- merge candidate

PASS 詳細はローカル。
FAIL のみ詳細を見る。

---

# 25. Live MIDI

Phase 9 対象外。

offline Core をそのまま Live へ流用しない。

---

# 26. ML

Phase 9 の主役にしない。

まず:

```text
rule / symbolic
+ candidate search
+ factorized ranking
+ optional decoder
```

将来の component replacement は許可。

---

# 27. 禁止事項

- モード別に複数 Core
- Root = Bass
- chord label だけ保存して Source を捨てる
- excluded note を破棄
- exact surface accuracy だけで勝敗
- candidate recall だけで昇格
- lattice proposal 数だけで成功扱い
- Missing 悪化を Extra 改善で相殺
- holdout 再利用 / 再調整
- private MIDI で tuning
- decoder を惰性で残す
- Vault schema を研究初期に固定
- shadow 前に Product default change
- skip / retry で failing test を隠す

---

# 28. Phase 9 最終成功条件

最低限:

1. Source Fidelity >= current
2. Synthetic Support Note Recall 非悪化
3. Public Gold Note Recall 非悪化
4. Bass loss 非悪化
5. Defining tone loss 非悪化
6. 元 MIDI の voicing / octave / bass を壊さない
7. 除外音は取り込み中に復元可能
8. 保存後も復元可能な persistence を 9.8 で確立
9. Boundary correction 減少
10. Card Inflation 非悪化 / 改善
11. short passing harmony を守る
12. ornament でカードを割りすぎない
13. slash bass を壊さない
14. Tier 2 acceptable >= current
15. Correction Vector 改善
16. Review Precision / Recall が Freeze 基準を満たす
17. Review False Alarm が Freeze 上限内
18. 長尺 MIDI で実用的
19. dirty / transcription-like input で catastrophic failure を増やさない
20. deterministic
21. rollback 可能

最終 Product 判断:

> **MIDI を取り込んだ後の修正の手間が、本当に減ったか。**

---

# 29. Freeze Status

この v5 がレビュー承認されたら、

> **Phase 9 Core v2 Architecture Freeze**

として扱う。

最初に実行するのは **Phase 9.0 Architecture Consolidation, Baseline & Holdout Seal**。

いきなり Core v2 本番実装へ入らない。
