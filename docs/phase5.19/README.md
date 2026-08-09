<!-- phase-id: 5.19 -->
# Phase 5.19 — Root Motion Echo

## Status
`P5.19-06 ADJUSTABLE CHAIN LENGTH - automated gates pass; human product acceptance pending`

## Required Reading Order

1. [Root safety rules](../../AGENTS.md)
2. [Claude entry point](../../CLAUDE.md)
3. [Phase README](README.md)
4. [Execution state](execution-state.json)
5. [Work instructions](work-instructions.md)
6. [Original proposal](proposal/ORIGINAL-PROPOSAL.md)
7. [Design review](proposal/P5.19-DESIGN-REVIEW.md)
8. [Scope and learning contract](contracts/01-scope-learning-contract.md)
9. [Motion and objective-evidence contract](contracts/02-motion-objective-evidence-contract.md)
10. [Fretboard and fingering contract](contracts/03-fretboard-fingering-contract.md)
11. [Generator and Vault-source contract](contracts/04-generator-vault-source-contract.md)
12. [Session, History, and metrics contract](contracts/05-session-history-metrics-contract.md)
13. [Privacy and safety contract](contracts/06-privacy-safety-contract.md)
14. [Stage00 audit](audit/P5.19-00-repository-audit.md)
15. [Stage00 report](reports/P5.19-00-audit-baseline.md)
## Single entry point
このREADMEをPhase 5.19の単一入口とする。着手・再開時は以下の順で読む。

1. ルート `AGENTS.md`
2. ルート `CLAUDE.md`
3. `docs/phase5.19/README.md`
4. `docs/phase5.19/execution-state.json`
5. `docs/phase5.19/work-instructions.md`
6. `docs/phase5.19/proposal/ORIGINAL-PROPOSAL.md`
7. `docs/phase5.19/proposal/P5.19-DESIGN-REVIEW.md`
8. `docs/phase5.19/contracts/` 全ファイル
9. Active Stageのaudit/report

Gitとexecution-stateが矛盾する場合はGitを優先し、差異をreportへ記録する。

## Purpose
Bass PracticeにRoot Motion Echoを追加する。2音または短いroot列を聴き、**どちらへ・どれだけ動いたか**を答え、歌い、指板で弾き、別の開始音へTransferする。

Degree Echoが「調の中での位置」を扱うのに対し、Root Motion Echoは「直前の音からの相対移動」を扱う。

## Learning ladder
```text
Root Motion Echo
  ↓
Degree Echo
  ↓
Rhythm Echo
  ↓
Bassline Echo
  ↓
Chord Context Practice
```
推奨順序であり、既存モードのロック条件にはしない。

## Core flow
```text
Listen → Identify → Sing → Play → Review → Transfer
```

Identifyだけは音声解析なしで客観判定可能。Sing/Playは自己評価のまま維持し、両者を単一スコアへ合成しない。

## Levels
- Level 1: 2音・方向のみ
- Level 2: 2音・大区分
- Level 3: 2音・正確な音程
- Level 4: 3〜4音のRoot Motion chain
- Level 5: 同じchainを別の開始音へTransfer

## Important ambiguity rule
コードrootのpitch classだけでは上行4度と下行5度を一意に決められない。Vault由来教材は決定的なpitch-placement ruleで演奏可能音域へ配置し、**原曲の実ベースライン**とは表示しない。表示は `Vault由来のルート経路` 等の正直な表現にする。

## Fretboard principle
指板ヒントは「1本上/下」ではなく、
- 高音側の隣弦
- 低音側の隣弦
- 同じ弦
- 同フレット
- ±nフレット
を使う。左利き表示でも意味を変えない。

開始音/到達音にはdeterministicなcanonical fingering solverを用いる。成立しない教科書的shapeを嘘表示しない。

## Hint ladder
- Hint 1: 方向
- Hint 2: 大区分
- Hint 3: 正確な音程
- Hint 4: 指板シェイプ

assistanceは `independent / assisted / revealed` を分離。答え表示後の正解を独力正解に数えない。

## Sources
### Generated
重み付きdeterministic generation。4/5弦・演奏可能音域・fingering solverを考慮。

### Vault-derived root path
P5.18.2までのsafe Vault sourceを再利用。ライブtitleはpicker UI専用で、exercise/Historyには保存しない。root列からdeterministic pitch pathを作る。

## In scope
- Root Motion Echo mode
- objective Identify
- separate self-review
- Hint 0〜4
- fretboard shape
- Transfer
- 3〜4 note chain
- Generated source
- Vault-derived root path
- P5.17 Record & Compare reuse
- History / objective metrics
- accessibility / release / human acceptance

## Non-goals
- Sing/Play自動採点
- DI/MIDI演奏採点
- 元MIDIベースライン抽出
- 絶対音感訓練
- 五線譜中心UI
- composite skill score
- gamification
- Vault schema変更/mutation
- P5.20着手

## Preconditions
P5.18.2が正式完了・master統合済み、test-output hygieneがmasterに含まれ、P5.15 frozen commitsが祖先でないこと。

推奨branch: `feat/p519-root-motion-echo`

## Stages
- P5.19-00 — Repository Audit / Contract / Baseline
- P5.19-01 — Motion Domain / Generator / Fingering Solver
- P5.19-02 — Identify / Core Two-note Flow
- P5.19-03 — Fretboard / Transfer / History / Record & Compare
- P5.19-04 — Vault-derived Source / Motion Chain
- P5.19-05 — Product Hardening / Release / Human Acceptance
- P5.19-06 — Adjustable Chain Length / Persistence / Compatibility

## Completion conditions
- Identifyを客観判定できる
- first answerと後の訂正を分離
- IdentifyとReviewを合成しない
- assistance stateを保持
- deterministic fingering/shape
- Transfer
- 3〜4音chain
- Vault-derived root path
- original basslineと誤表示しない
- Record & Compare利用可能
- objective/self-rated History分離
- 既存Bass Practice非退行
- full gates PASS
- human acceptance待ちでmaster未merge停止

- Selectable two through eight-note Root Motion phrases, with factual first-transition evidence and full-sequence rehearsal.

## Stop conditions
Practice schema破壊的migration、Vault schema変更、P5.15依存、虚偽shape、Vault root pathをoriginal basslineと誤認させる必要、Identify/Review合成、Analyzer/MIDI Exporter変更、test-output hygiene退行、resource leak、意図不明な既存変更。

停止時にreset/stash/discardしない。

## Next action
Implement only P5.19-06 adjustable Root Motion chain length. Do not merge, push, or start P5.20.