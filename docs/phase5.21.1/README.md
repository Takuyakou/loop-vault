<!-- phase-id: 5.21.1 -->

# Phase 5.21.1 — Mixed Voice Harmonic Extraction
## Intra-Voice Melody Evidence Suppression for Harmonic Core

## Status

`P5.21.1-05 AUTOMATED GATES PASS — HUMAN ACCEPTANCE NOT RUN`

## Required Reading Order

Start with [execution state](execution-state.json), then [work instructions](work-instructions.md), the linked contracts below, and the active Stage report.

この `README.md` を Phase 5.21.1 の単一入口とする。

Codex / Claude Code は着手・再開時に次を順番に読む。

1. repository root `AGENTS.md`
2. repository root `CLAUDE.md`
3. `docs/phase5.21.1/README.md`
4. `docs/phase5.21.1/execution-state.json`
5. `docs/phase5.21.1/work-instructions.md`
6. `docs/phase5.21.1/proposal/P5.21.1-DESIGN-REVIEW.md`
7. `docs/phase5.21.1/contracts/01-scope-failure-case-contract.md`
8. `docs/phase5.21.1/contracts/02-note-evidence-contract.md`
9. `docs/phase5.21.1/contracts/03-shadow-promotion-contract.md`
10. `docs/phase5.21.1/contracts/04-harmonic-core-integration-contract.md`
11. `docs/phase5.21.1/contracts/05-evaluation-regression-contract.md`
12. `docs/phase5.21.1/contracts/06-privacy-test-hygiene-contract.md`
13. Active Stage の audit/report
14. `docs/phase5.21.1/evaluation/LOCAL-FAILURE-FIXTURE.md`

Git reality と docs が食い違う場合は Git を優先し、差異をStage reportに記録する。

---

## Purpose

P5.21 の Voice-level Role Evidence v2 / `和声コア` では解けない、
**同一Voice内に伴奏和音とメロディが同居するMIDI**を扱う。

代表failure caseはユーザー提供の `all_instruments.mid`。
P5.21.1-00で実ファイル構造を再確認し、private local evaluation fixtureとして固定する。

問題の概念構造:

```text
one pitched Voice
├─ sustained / polyphonic harmonic bed
└─ shorter independent top-line melody
```

Voice単位weightでは両者に同じ重みが掛かるため、
P5.21.1では **note-level harmonic contribution weight** を導入する。

ただし、raw MIDIや表示ノートを削除・改変しない。

---

## Product boundary

P5.21.1のnote-level処理は **`和声コア` preset専用** とする。

変更しない:

- default analyzer mode
- default preset
- `自動`
- `伴奏のみ`
- existing role inference semantics
- raw MIDI
- display MIDI
- Voicing Memory

これにより、note-level分類のリスクをopt-in presetへ隔離する。

---

## Core algorithm principle

**「最上声だからメロディ」では判定しない。**

melody-like note evidenceは複数条件の融合で決める。

候補feature:

- local topness / pitch rank
- lower-support count
- lower-support coverage ratio
- note duration vs lower-bed duration
- independent onset from lower bed
- top-line continuity
- melodic motion continuity
- sustained-chord-tone protection
- local texture stability

禁止feature:

- detected chord label membership
- chord-tone / non-chord-tone classification
- Analyzer output chord boundaryをfirst-pass evidenceに使うこと

コード結果に依存してnoteを消す循環を作らない。

---

## Safety philosophy

P5.21.1の優先順位:

```text
1. harmonic/tension noteを誤って弱めない
2. melody-like overlayを弱める
3. recall不足は許容できる
4. false suppressionは許容しにくい
```

つまり **precision / harmonic-retention優先**。

melody-likeと判断してもweightを0にしない。

---

## In scope

- `all_instruments.mid` failure-case baseline
- synthetic note-role fixtures with known labels
- note-level texture feature extraction
- melody-like candidate scoring
- Shadow evaluation
- confidence/evidence diagnostics for evaluation
- Harmonic Core only note multiplier
- regression against official chord corpora
- deterministic behavior
- product acceptance on `all_instruments.mid`

---

## Non-goals

- source MIDI rewriting
- visual MIDI rewriting
- note deletion
- melody stem extraction
- audio separation
- generic melody transcription
- performance scoring
- chord scoring formula rewrite
- boundary detector rewrite
- candidate generator rewrite
- default preset change
- P5.22

---

## Preconditions

Preferred:

- P5.21 formally closed/merged, or
- exact accepted P5.21 code candidate explicitly locked as base

P5.21 visual-test maintenance must not be silently mixed into P5.21.1.
If P5.21 remains unmerged, Stage00 must stop and request an exact base-candidate decision before production implementation.

Recommended branch:

`feat/p5211-mixed-voice-harmonic-extraction`

---

## Stages

### P5.21.1-00 — Failure-case Audit / Baseline / Contract Lock

No production behavior change.

- audit P5.21 Harmonic Core weighting seam
- audit raw note/evidence path
- register local `all_instruments.mid`
- freeze current Harmonic Core output
- create privacy-safe structural fingerprint
- generate synthetic note-role fixture set
- lock note-label evaluation semantics
- lock promotion gate

### P5.21.1-01 — Note Texture Features / Shadow Extraction

Pure feature pipeline only.

- topness
- lower support
- support coverage
- duration contrast
- onset independence
- top-line continuity
- sustained-tone protection

Production chord output must remain identical.

### P5.21.1-02 — Melody-like Note Classifier / Shadow Evaluation

- candidate note score
- Shadow labels
- synthetic ground-truth evaluation
- protected-tension fixture evaluation
- threshold / confidence policy locked before promotion

No production weighting yet.

### P5.21.1-03 — Harmonic Core Note Weight Integration

Only after Stage02 PASS.

- convert melody-like evidence to non-zero note multiplier
- apply only under `和声コア`
- raw note remains unchanged
- existing Voice role weight remains first layer
- note multiplier is second layer

### P5.21.1-04 — Regression / Real Failure Case / Hardening

- current official chord corpora
- deterministic benchmark
- `all_instruments.mid` old/new comparison
- protected tension / arpeggio / inversion cases
- performance/resource checks
- no default-path change

### P5.21.1-05 — Product Acceptance / Release

- full automated gates
- Web/Tauri if required
- artifact build
- human acceptance on `all_instruments.mid`
- master未mergeで停止

---

## Completion conditions

- Harmonic Core can reduce melody-like contribution inside a mixed pitched Voice
- `all_instruments.mid` no longer exhibits the same obvious melody leakage according to human acceptance
- protected sustained top tensions remain represented in adversarial tests
- pure arpeggio/chord voicings are not treated as melody solely because they are high notes
- note weights never reach 0
- default/other presets are unchanged
- scoring/boundary/candidate generator source remains unchanged unless Stage00 proves an unavoidable seam conflict and user re-authorizes
- official chord metric non-regression within locked tolerance
- deterministic output
- full gates PASS

---

## Stop conditions

- P5.21 exact base is unresolved
- insertion requires raw MIDI mutation
- insertion requires chord scoring formula rewrite
- classifier depends on detected chord identity to decide suppression
- protected tension tests cannot be made safe
- Stage02 promotion gate FAIL
- official corpus regression exceeds tolerance
- `all_instruments.mid` improvement requires hard note deletion
- test-output hygiene regression
- unexpected existing changes

停止時は reset / stash / discardしない。

---

## Next action

`P5.21.1-00 — Failure-case Audit / Baseline / Contract Lock`

最初は監査・fixture準備・baseline固定のみ。
P5.21.1-01へ自動で進まない。
