# Loop Vault Phase 5.16 PLAN
## Bass Practice Mode — Incremental Delivery Plan

この文書はPhase 5.16.1〜5.16.3の共通計画である。
個別の実装仕様は`contracts/`と`stages/`を正とする。

---

## 1. 目的

Loop Vaultの既存`Practice`ワークスペースへ、ベースの耳・指板・リズム・フレーズ保持を結ぶ練習機能を追加する。

学習ループ:

```text
Listen
→ Recall
→ Sing
→ Think in Degrees
→ Play
→ Self Review
→ Transfer
```

自動採点がなくても毎日使えることを優先する。

---

## 2. 分割理由

旧仕様は3モード、Generator、Playback、指板、保存、履歴、適応出題、Vault連携を同時に実装する構成だった。
これはPhase 5.15と同様に、成果を触れるまでの時間と回帰範囲が大きくなりすぎる。

新構成では、共通ArchitectureをPhase 5.16.1で完成させ、後続はmode-specific contentとして追加する。

```text
5.16.1 = Practice Systemそのもの
5.16.2 = Rhythm content
5.16.3 = Bassline content + Vault source
```

---

## 3. Phase構成

### Phase 5.16.1 — Degree Echo Core

出荷するもの:

- `Practice`内の`Chord Dojo / Bass Practice`切替
- Degree Echo
- 共通State Machine
- 決定論的Generator
- Listen / Sing / Play / Self Review / Transfer
- Hint 0〜4
- 歌唱参照音のoctave移動
- Sing最低滞在時間と明示skip
- Again / Hard / Good / Easy
- 次に直す1点
- Session Queue
- Practice Repository
- History
- Homeの今日の練習カード
- 4/5弦、左/右利き指板
- Local / Offline
- Keyboard-only
- E2E / visual / accessibility / build

この時点で実用MVPとして完成する。

### Phase 5.16.2 — Rhythm Echo

追加するもの:

- Rhythm Echo
- rhythm vocabulary
- metronome
- count-in
- muted practice timbre
- tempo / meter / subdivision hints
- rhythm-specific review
- tempo / start-position Transfer
- Rhythm履歴と弱点

5.16.1のState Machine、Storage、Review、Historyを再利用する。

### Phase 5.16.3 — Bassline Echo & Vault

追加するもの:

- Bassline Echo
- Generated source
- Vault Progression source
- 1〜2小節切出し
- root / chord tone / approachの段階難度
- progression-aware hints
- key Transfer
- source snapshotとprovenance
- source削除時の安全表示

Source MIDI Bassは開始時に監査する。
既存保存データから元Bass NoteEventを復元でき、schema変更・個人MIDI複製なしで成立する場合だけ同Phaseへ含める。
成立しない場合はPhase 5.16.4候補として提案し、5.16.3を止めない。

---

## 4. Phase 5.17との境界

Phase 5.16.1〜5.16.3には含めない。

- microphone permission
- DI録音
- pitch detection
- onset detection
- duration detection
- cent判定
- automatic score
- fake score
- fake input meter
- low-B detector研究
- recording保存
- audio calibration

Phase 5.17で、golden audio fixtureに合格した軸だけ自動採点へ移行する。

---

## 5. 共通Source of Truth

優先順位:

1. Active stage document
2. `contracts/*.md`
3. この`PLAN.md`
4. `docs/CURRENT_STATE.md`
5. `AGENTS.md`
6. Full-Autonomy Amendment
7. repository conventions

旧1,469行のPhase 5.16文書はreferenceであり、分割後はactive instructionにしない。

---

## 6. 自動運用

各Phaseの内部では全自動で進める。

```text
Audit
→ Implementation
→ Targeted Tests
→ Failure Repair
→ Self Review
→ Stage Gates
→ Full Gates
→ Report
→ Commit
→ Phase Final Report
```

通常のtest failure、build failure、fixture不備、report不備、accessibility failure、resource leakは停止理由ではない。
Codexが自律的に修正する。

停止は以下に限定する。

- 個人データ漏洩
- 保存データ破壊
- 不可逆schema migration
- force push / history rewrite
- 仕様矛盾で正解を決められない
- 必須外部資源がなく続行不能
- 同じ根本原因へ3種類以上の合理的修正でも解決不能
- ユーザーの音楽的判断なしでは正解を定義不能

各Phaseの完了後は、そのPhaseの最終報告で停止する。
次のPhaseを勝手に開始しない。

---

## 7. Product Observation

Phase 5.16.1完成後、最低5セッションの実使用を推奨する。

確認項目:

- Singが形骸化していないか
- Hint順序
- Self Reviewの負担
- phrase長
- Transferの価値
- Home導線
- Queue量

これは5.16.1の実装Gateではない。
5.16.2の仕様微調整に使うProduct observationである。
実使用結果を自動scoreの正解データとして扱わない。

---

## 8. Architecture

```text
src/features/bass-practice/
  domain/
  application/
  ui/
  infra/
    playback/
    repository/
```

共有可能な最小型だけを既存music domainから参照する。

禁止:

- PracticeからAnalyzer実装へ依存
- Practice storeからVault storeへ書込み
- Chord Dojo stateと共有
- modeごとのState Machine複製
- modeごとのStorage複製
- modeごとのReview rule複製

---

## 9. Feature Flags

```text
enableBassPracticeDegreeEcho
enableBassPracticeRhythmEcho
enableBassPracticeBasslineEcho
```

要件:

- Vault schema外
- Phaseごとに独立
- rollbackで履歴を消さない
- OFFで既存Chord Dojo不変
- 後続flagが前Phaseのflagを暗黙有効化しない
- Product接続前に全Gateを通す

---

## 10. Git / PR

Phaseごとに独立stackを使う。

- Phase 5.16.1 stack
- Phase 5.16.2 stack
- Phase 5.16.3 stack

共通:

- `git add -A`禁止
- 明示pathだけstage
- personal MIDI禁止
- `.local-evaluation`禁止
- build artifact禁止
- force push禁止
- history rewrite禁止
- main mergeは明示指示時のみ

---

## 11. 最終ロードマップ

```text
5.15 Analyzer Accuracy
        ↓
5.16.1 Degree Echo Core MVP
        ↓
実使用 5 sessions推奨
        ↓
5.16.2 Rhythm Echo
        ↓
5.16.3 Bassline Echo + Vault
        ↓
5.16.4候補 Source MIDI Bass Clips
        ↓
5.17 DI Recording & Automatic Scoring
```
