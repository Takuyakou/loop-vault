<!-- phase-id: 5.21.1 -->

# P5.21.1 Work Instructions
# Mixed Voice Harmonic Extraction

## Scope

P5.21.1 is limited to note-level evidence weighting inside the opt-in Harmonic Core path. Stage00 creates evaluation/support artifacts and locks contracts only; it does not change production analysis.

## Non-goals

- no raw or display MIDI mutation
- no Vault or persistent schema change
- no default, Auto, accompaniment-only, custom, or Role v2 behavior change
- no pitch-only classifier and no chord-identity, winner, or boundary circularity
- no Stage01+ work during P5.21.1-00

## Definition of Done

The active Stage is done only when all required gates pass on its exact candidate commit, phase docs validate, privacy/protected-surface checks pass, and the worktree is clean. Human acceptance remains mandatory for the final real-file judgment.

## 0. Mission

`和声コア`で、同一Voice内のharmonic bedとmelodic top lineを
note-level evidenceで分離し、メロディ寄りnoteのコード検出寄与だけを弱める。

**音を消す機能ではない。Analyzer evidence weightingの機能である。**

---

# 1. Start-up audit

確認:

- branch / HEAD / master
- `git status --short`
- worktrees
- merge/rebase/cherry-pick
- exact P5.21 accepted base
- P5.21 Harmonic Core implementation
- visual-baseline maintenance state
- P5.15 ancestry
- test-output hygiene
- `docs/CURRENT_STATE.md` absent

P5.21 baseが曖昧ならimplementationへ進まない。

---

# 2. Local failure fixture — all_instruments.mid

User-provided `all_instruments.mid` is the required real failure case.

Rules:

- Git commitしない
- `.local-evaluation`等のexisting ignored areaを使用
- personal absolute pathをreportへ残さない
- fixture IDは `p5211-real-001` 等の匿名ID
- SHA-256はlocal manifestへ保存可
- raw notes/full path/private titleをreportへ出さない

Codex should auto-discover exact filename only in:

- repository root
- shared worktree roots
- existing local evaluation directories
- user-approved source path if already present in configuration

PC全体をscanしない。

見つかったらignored evaluation areaへ自動登録する。
見つからない場合だけ、ユーザーへSource path 1つを求める。

Stage00で検証すべきfailure topology:

- pitched Voice内にpolyphonic/sustained lower supportがある
- 同じVoice内により短い独立したtop-line note sequenceが存在する
- Voice-level weightだけでは両者を分けられない

過去チャットの推測値ではなく、実ファイルから再測定する。

---

# 3. Synthetic note-role evaluation fixtures

Human note-by-note labelingを要求しない。

Stage00でdeterministic synthetic fixturesをgeneratorで作る。
Ground truth is known by construction.

最低fixture:

## A. Sustained chord + melody overlay

```text
C3 E3 G3 B3 --------
D4 -> E4 -> G4 -> A4
```

Expected:
- lower bed = harmonic
- short top sequence = melody-like

## B. Sustained Cmaj9

```text
C3 E3 G3 B3 D4 --------
```

Expected:
- D4 is harmonic/tension
- MUST NOT suppress just because top note

## C. Inversion

```text
E3 G3 B3 C4 --------
```

Expected:
- C4 protected harmonic

## D. Arpeggio

```text
C3 E3 G3 B3 E4 G4 ...
```

Expected:
- not automatically melody
- use texture/context evidence

## E. Pedal/chord + repeated top melody

## F. Dense staccato harmony

## G. Broken-chord ostinato

## H. Pure monophonic melody

## I. Two-layer rhythmically aligned chord voicing

## J. Long sustained 9th/11th/13th top extensions

Generator + labels should be deterministic.
Prefer generator source committed, generated MIDI/JSON ignored if existing project policy requires tracked MIDI 0.

---

# 4. Note feature model

Do not classify from pitch alone.

Recommended transient feature record:

```ts
{
  noteId,
  isLocalTop,
  pitchRank,
  lowerSupportCount,
  lowerSupportCoverage,
  durationRatioToLowerBed,
  onsetIndependence,
  topLineContinuity,
  melodicMotionContinuity,
  sustainedExtensionProtection,
  localTextureStability
}
```

Names/types should follow repository conventions after audit.
Persistent schema change prohibited.

---

# 5. Feature definitions

## 5.1 Local topness

Determine pitch rank among overlapping notes in the same eligible Voice.

Not sufficient by itself.

## 5.2 Lower-support count

How many lower notes overlap the candidate note.

Melodic overlay evidence becomes stronger when a top note rides over a stable multi-note lower bed.

## 5.3 Lower-support coverage

Fraction of candidate duration where >= N lower notes remain active.

Use exact interval sweep, not sample-frame approximation if current model supports exact ticks.

## 5.4 Duration contrast

Candidate duration compared with overlapping lower-bed duration distribution.

Short top note over long lower bed -> melody evidence.

Long top note matching bed -> harmonic protection evidence.

## 5.5 Onset independence

Candidate onset occurring while lower bed is already sustained is stronger melody evidence than all notes starting together.

## 5.6 Top-line continuity

Track a coherent sequence of top candidates over time.

Avoid one isolated high note being suppressed.

## 5.7 Melodic motion continuity

Small/moderate pitch movement across sequential top candidates is supporting evidence.

Do not require stepwise-only motion.

## 5.8 Sustained extension protection

Explicit negative evidence for suppression when:

- top note sustains similarly to lower bed
- onset aligns with chord texture
- note remains stable through texture segment

This protects 7/9/11/13 tensions.

---

# 6. Explicit anti-circularity contract

Forbidden in note classifier:

- `isChordTone(detectedChord, note)`
- current candidate chord label
- winner chord quality
- current boundary result as primary evidence

The classifier must be able to run before chord identity is known.

If a second-pass experiment is desired, defer to a later Phase.

---

# 7. Shadow note classifier

Stage02 produces:

- `harmonic`
- `melody-like`
- `uncertain`

or repository-equivalent candidate state.

Do not persist to Vault.

Diagnostics:

- evidence score
- key evidence kinds
- resulting candidate class
- proposed note multiplier

Do not show end-user probability percentage.

---

# 8. Promotion philosophy

False suppression is more dangerous than missed melody.

Stage00 locks promotion gate **before Stage02 result**.

Recommended hierarchy:

1. zero/near-zero false suppression on protected-tension fixture set
2. high precision for melody-like suppression
3. harmonic retention rate
4. then melody recall

Do not tune threshold on `all_instruments.mid` alone.

`all_instruments.mid` is product failure evidence, not the only training/test set.

---

# 9. Weight integration

Only Stage03 after Shadow PASS.

Concept:

```text
finalContribution =
  existingVoiceRoleWeight
  × noteHarmonicContributionMultiplier
```

Multiplier:

- harmonic => 1.0
- uncertain => near 1.0 or conservative value locked by Stage00
- melody-like => non-zero reduced value

Never 0.

Do not delete events.

Apply only when preset = `和声コア`.

Other presets must be exact legacy path.

---

# 10. Eligible Voices

Do not limit only to current `mixed` role.

Reason:
A piano Voice containing chord+melody may be classified `harmony` while still requiring intra-Voice separation.

Potential eligible set under Harmonic Core:

- harmony
- pad
- mixed
- possibly other pitched non-bass/non-percussion roles after audit

Pure bass/percussion excluded.
Pure melody already receives Voice-level attenuation; note-level layer should not accidentally boost it.

Exact eligibility locked in Stage00.

---

# 11. Performance / complexity

Avoid O(N^2) over all notes if possible.

Preferred:

- sorted interval sweep
- active-note structure
- local neighbor index
- deterministic bounded line tracking

Benchmark:

- synthetic dense fixture
- actual `all_instruments.mid`
- warm-up + multiple samples
- no timeout hiding

P5.21.1 can take longer than current code if accuracy improves, but no runaway complexity/resource leak.

---

# 12. Stage instructions

## P5.21.1-00 — Failure-case Audit / Baseline / Contract Lock

No production feature.

Audit:

- P5.21 exact base
- Harmonic Core role weights
- NoteEvent→evidence path
- raw/display/persistence boundaries
- all_instruments local fixture
- current Harmonic Core output
- current official corpora
- test harness

Create:

- synthetic generator
- note ground truth
- evaluation metrics
- promotion gate
- performance budget methodology

Stop.

## P5.21.1-01 — Note Texture Features / Shadow Extraction

Implement pure features.

Hard Gate:
- production chord outputs unchanged for all presets
- deterministic
- property tests

## P5.21.1-02 — Melody-like Classifier / Shadow Evaluation

Implement classifier shadow-only.

Evaluate:
- melody-like precision/recall
- harmonic retention
- tension retention
- confusion matrix
- all synthetic cases

If gate FAIL: stop.

## P5.21.1-03 — Harmonic Core Integration

Only after PASS.

- note multiplier
- Harmonic Core only
- note weight floor > 0
- diagnostic hooks local/test only
- no raw mutation

## P5.21.1-04 — Regression / Real Failure / Hardening

Run:

- official chord corpora
- all P5.21 role tests
- all Harmonic Core tests
- default/legacy exact-path regression
- all_instruments old/new diff
- performance benchmark
- lifecycle/resource check

Generate human-review summary without private note dump.

## P5.21.1-05 — Product Acceptance / Release

Full gates and build.

Pre-human state:

`READY FOR PRODUCT ACCEPTANCE — Mixed Voice Harmonic Extraction`

No merge/push.

---

# 13. Automated tests

## Feature extraction

- exact overlap boundaries
- same onset
- staggered onset
- nested duration
- same pitch duplicates
- fragmented notes
- long extension
- inversion
- arpeggio
- top-line chain
- no lower support
- rests

## Shadow classifier

- overlay melody positive
- sustained tension negative
- inversion negative
- arpeggio protected/uncertain according to contract
- pure melody
- dense harmony
- broken chord
- repeated top note
- chromatic melody
- large melodic leap

## Integration

- Harmonic Core changed only
- Auto unchanged
- accompaniment preset unchanged
- custom unchanged
- note multiplier never 0
- no raw event mutation
- deterministic

## Privacy

- local real MIDI not tracked
- no absolute path
- no raw note dump in committed reports

---

# 14. Human acceptance on all_instruments.mid

User should only need to do the final product judgment.

Checklist:

1. load same `all_instruments.mid`
2. select current `伴奏のみ`; note current leakage
3. select P5.21 `和声コア` legacy behavior if comparison path is available
4. select P5.21.1 `和声コア`
5. confirm obvious melodic top line affects detected chord names substantially less
6. confirm real chord changes still follow accompaniment
7. confirm useful tensions are not broadly erased
8. compare several sections, not only one bar
9. no other preset changed
10. no stuck audio/UI

Human acceptance is qualitative for the real failure file; automated synthetic/corpus gates protect against overfitting.

---

# 15. Full release gates

- phase docs validation
- validator tests
- lint
- app typecheck
- E2E typecheck
- P5.21.1 focused tests
- P5.21 Role v2 regression
- Harmonic Core regression
- current official chord corpora
- full Vitest
- Rust if affected
- Playwright if UI affected
- Web build
- Tauri build if release flow requires
- deterministic benchmark
- `git diff --check`
- post-test/build clean

Protected diff:

- P5.15 unexpected diff 0
- raw MIDI mutation path 0
- display MIDI mutation 0
- Vault schema/fileVersion 0
- Voicing Memory 0
- scoring formula unexpected diff 0
- boundary detector diff 0
- candidate generator diff 0
- default analyzer/preset change 0
- tracked private MIDI 0
- `.local-evaluation` tracked 0
- personal absolute path 0
- visual baseline unintended diff 0
- Cargo.toml EOL-only diff 0
- `docs/CURRENT_STATE.md` absent

---

# 16. Commit rules

Each Stage:

- status/diff/diff-check
- explicit paths
- no `git add -A`
- no `git add .`
- staged diff review
- commit
- report/execution-state
- post-commit clean

No master merge.
No push.
No P5.22.
