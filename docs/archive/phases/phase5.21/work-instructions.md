<!-- phase-id: 5.21 -->
# Phase 5.21 Work Instructions

## Mission
証拠を強化→Shadow評価→PASS時のみRole v2昇格→和声コア、の順序を厳守する。

## Scope

- P5.21-00 audits and locks the current production role inference, official
  corpus availability, approved human Voice role ground truth, and promotion
  metrics before production changes are considered.
- Only after a passing baseline lock may the phase continue to feature-only
  shadow extraction, shadow classification, promotion, Harmonic Core, and
  release evaluation.
- Stage 00 changes no production source; it records the audit, contracts, and
  baseline state only.

## Non-goals

- Mixed-Voice note filtering, per-note role classification, top-note
  suppression, note-level weighting, P5.21.1, and P5.22.
- Changes to scoring, boundaries, candidate generation, default analyzer mode,
  default preset, Vault schema/fileVersion, or Voicing Memory.
- Acquiring, recording, or committing private MIDI, raw recordings, or
  personal paths.
## Start audit
branch/HEAD/master/status/worktrees/merge状態/P5.20 completion/P5.19.1 ancestor/test-output hygiene/P5.15 ancestry/`docs/CURRENT_STATE.md` absenceを確認。dirtyならreset/stash/discardせず停止。

## Stage00
production source変更なし。current role enum/classifier/mixed fallback/thresholds/program changes/name evidence/percussion/channel indexing/manual override/correction log/pre-analysis/note timing/official evaluation/corpusを監査。current HEADでbaselineを再測定し、human role ground truthをVoice単位で固定。`ambiguous`を許可し、評価除外規則を先に固定する。

## Feature-only legato proxy
同Voice・同pitch・小gapをrole feature統計用だけに結合。thresholdはPPQ/timing監査後に音楽時間で固定。raw Analyzer eventsへ適用禁止。deterministic/idempotent/threshold boundaryを自動テスト。

## Time-weighted monophony
`active time with exactly 1 pitched note / active time with >=1 pitched note`。restは分母外。note-count ratioは禁止。

## Evidence fusion
program/name/monophony/duration/pitch rank/stepwise/polyphony/percussionを独立evidenceとして計算。programだけで普遍的role確定しない。track-name巨大辞書を4ローカルファイルへfitしない。harmonic-rhythm/chord-tone依存featureをfirst passへ入れない。

## Percussion
repository conventionを監査し、MIDI Channel 10(zero-based index 9)等のhard evidenceと、program/name/short-high-density-narrow-pitch等のsoft evidenceを分離。signature単独でpitched staccatoをhard除外しない。

## Shadow mode
Stage01/02ではproduction autoRoleを一切変更しない。privacy-safe diagnosticsとして oldRole/candidateRole/feature vector/evidence/confidence candidate/disagreement/expected role(approved fixtureのみ)を記録。

## Promotion metrics
最低限: exact role accuracy、melody recall、harmony precision、bass precision、percussion precision、mixed prediction rate、confusion matrix、manual correction count。Primaryはmanual correction burden。GateはStage00で先に固定し、結果を見て後付けしない。

## Confidence
High/Medium/Lowのみ。根拠要約と`要確認`を表示。%禁止。将来correction logでcalibrationできた場合のみ数値化を別検討。

## Correction log
既存P5.1 logを再利用。現契約で非破壊追加できる場合のみ inferenceVersion/predictedRole/confidenceBucket/evidenceKinds/correctedRole等を保存。raw MIDI/private path/title/raw notesは禁止。schema変更が必要ならenrichmentは延期。

## Production promotion
Stage02 PASS時のみ。manual override優先、determinism維持。scoring/boundary/candidate generation/raw note eventを変更しない。protected Analyzer diffを明示監査。

## Harmonic Core
Stage03 PASS後のみ。名前=`和声コア`。proposal weightsはcandidate。melody>0、not default、existing presets/custom保持。UI copy: `テンションを取りこぼす代わりに、メロディ由来の誤検出を減らします`。

## Explicit exclusion
P5.21では per-note melody classification / top-note suppression / per-note weight / Voice-internal melody mask / note-level role score を実装しない。残存課題はbacklogのP5.21.1へ。

## Stage execution
00 audit/baseline/ground truth → STOP。
01 features shadow → tests/report/commit。
02 classifier shadow evaluation → FAILならSTOP、PASSなら03。
03 production promotion/confidence/UI。
04 Harmonic Core。
05 full regression/release/human acceptance preparation。

## Definition of Done

- P5.21-00 has locked the official current baseline, approved human role ground
  truth, ambiguous policy, promotion metrics/tolerance, and privacy policy
  before results are considered; its required gates are recorded as passed and
  it has an independent commit.
- If the official corpus or approved ground truth is unavailable, Stage 00 is
  recorded as BLOCKED and P5.21-01 and later stages do not begin.
- Every later stage likewise records its required gates, explicit commit, and
  post-commit clean status before entering `completedStages`.

## Full gates
phase docs/validator/lint/typecheck/Role v2 focused/pre-analysis/Analyzer regression/current official corpora/real-MIDI evaluation/determinism/full Vitest/Playwright if UI/Web/Tauri if release/`git diff --check`/post-build clean。

Protected diff: P5.15 unexpected 0、scoring 0、boundary 0、candidate generator 0、Vault schema/fileVersion 0、Voicing Memory 0、tracked private MIDI 0、tracked `.local-evaluation` 0、personal absolute path 0、CURRENT_STATE absent、visual baseline unintended 0、Cargo.toml EOL-only 0。

## Git
各Stage explicit pathsのみstage。`git add -A`/`.`禁止。merge/push/P5.21.1/P5.22禁止。
