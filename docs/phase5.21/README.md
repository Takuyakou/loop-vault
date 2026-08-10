<!-- phase-id: 5.21 -->
# Phase 5.21 — Harmonic Core / Role Evidence v2

## Status

- **Status:** P5.21-04 complete — the opt-in Harmonic Core preset is available.
- **Active stage:** P5.21-05 — Full Evaluation / Release / Product Acceptance.
- **Completed stages:** P5.21-00, P5.21-01, P5.21-02, P5.21-03, P5.21-04
- **Next action:** P5.21-05 may begin on the recovery branch. Do not start P5.21.1/P5.22, merge, or push before the applicable Stage 05 gates and human product acceptance pass.

Git is the source of truth. The shared worktree initially contained untracked
phase documents on another branch, so this phase uses its own clean worktree
from local `master`; the discrepancy is recorded in the Stage 00 audit.

## Required Reading Order

1. [Root safety rules](../../AGENTS.md)
2. [Claude entry point](../../CLAUDE.md)
3. [Phase README](README.md)
4. [Execution state](execution-state.json)
5. [Work instructions](work-instructions.md)
6. [Original proposal](proposal/ORIGINAL-PROPOSAL.md)
7. [Design review](proposal/P5.21-DESIGN-REVIEW.md)
8. [Scope and non-goals contract](contracts/01-scope-non-goals-contract.md)
9. [Ground truth and baseline contract](contracts/02-role-ground-truth-baseline-contract.md)
10. [Feature extraction contract](contracts/03-feature-extraction-contract.md)
11. [Shadow and promotion contract](contracts/04-role-v2-shadow-promotion-contract.md)
12. [Confidence and correction-log contract](contracts/05-confidence-correction-log-contract.md)
13. [Harmonic Core contract](contracts/06-harmonic-core-preset-contract.md)
14. [Evaluation and safety contract](contracts/07-evaluation-safety-contract.md)
15. [Stage 00 repository audit](audit/P5.21-00-repository-audit.md)
16. [Stage 00 report](reports/P5.21-00-audit-baseline.md)
17. [P5.21.1 deferred backlog](backlog/P5.21.1-MIXED-VOICE-NOTE-FILTERING.md)
Git realityとdocsが食い違う場合はGitを優先しreportへ記録する。

## Purpose
`伴奏のみ`等のrole-aware presetが効かない根因を、preset不足ではなくVoice role inferenceの証拠不足として扱う。

```text
Current baseline + human role ground truth
→ Feature v2をShadow計算
→ Role classifier v2をShadow比較
→ Gate PASS時のみproduction昇格
→ confidence / 要確認UI
→ 和声コア preset
→ full evaluation / human acceptance
```

## Explicit exclusion
**Voice内 mixed note filtering / note-level role weighting はP5.21から完全除外。**
必要性が残った場合のみ `P5.21.1 — Mixed Voice Note Filtering` として再設計する。P5.21のPASS条件には含めない。

## Design corrections
- GM programは万能hard overrideにせず複数evidenceの一つとして融合する。
- MIDI percussionは文書/UI上 `MIDI Channel 10 (zero-based index 9)` と明記。
- legato repairはrole-feature用proxyのみ。raw Analyzer NoteEvent、元MIDI、表示MIDI、Voicing Memory、duration scoringを変更しない。
- chord detection結果依存のharmonic-rhythm featureはfirst-pass Role v2から除外。
- confidenceはHigh/Medium/Low + evidence。未校正の%表示は禁止。
- 過去の97.73%等をGateへ転記せず、P5.21-00でcurrent HEADのofficial evaluationを再測定してbaseline lockする。

## Stages
### P5.21-00 — Audit / Current Baseline / Human Role Ground Truth
production behavior変更なし。current classifier/evidence/program/channel/name/correction log/pre-analysis/official corpusを監査し、current baseline、human expected role、ambiguous policy、promotion gate、privacy policyを固定。

### P5.21-01 — Role Feature v2 / Shadow Extraction
feature-only legato proxy、time-weighted monophony、robust duration、pitch-center rank、stepwise ratio、program/name/percussion evidenceを純粋計算。production roleは変更しない。

### P5.21-02 — Role Classifier v2 / Shadow Evaluation
old vs v2をhuman ground truthと比較。role accuracy、melody recall、harmony precision、bass/percussion precision、mixed率、manual correction count、confusion matrixを測定。Gate FAILなら停止。

### P5.21-03 — Promote Role v2 / Confidence / Review UI
Stage02 PASS時のみproductionへ昇格。High/Medium/Low、evidence summary、要確認、manual overrideを維持。

### P5.21-04 — Harmonic Core Preset
`和声コア`を追加。proposal candidate: harmony/pad 1.3、bass除外、mixed 0.8、melody 0.15、percussion除外。0.8/0.15は最適値と断定しない。melody=0禁止。defaultにはしない。

### P5.21-05 — Full Evaluation / Release / Product Acceptance
real MIDI + current official corpora + determinism + UI/build + protected diff。pre-humanで `READY FOR PRODUCT ACCEPTANCE — Harmonic Core / Role Evidence v2`、merge/pushせず停止。

## Primary success
**手動role correction負担が減ること。** 数値目標はP5.21-00のbaseline計測後に固定。

## Protected
scoring / boundary / candidate generation / defaultAnalyzerMode / default preset / Vault schema / fileVersion / Voicing Memory / P5.15 / test-output hygiene。

## Next action
P5.21-04 completed at code candidate `0e8a21bab6ee6de30ba36f97361c6e4ec31a314f` on `recovery/p521-role-v2-promotion`. P5.21-05 may run the separately required release evaluation and prepare human product acceptance; P5.21.1, P5.22, merge, and push remain out of scope.
