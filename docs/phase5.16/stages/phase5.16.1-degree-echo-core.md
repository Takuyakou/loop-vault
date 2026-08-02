# Loop Vault Phase 5.16.1 FINAL 作業指示書
## Degree Echo Core — Learning Loop, Storage, History & Home

この文書をPhase 5.16.1のactive instructionとする。

共通契約:

- `../PLAN.md`
- `../contracts/01-honesty-scope-and-autonomy.md`
- `../contracts/02-practice-domain-state-and-storage.md`
- `../contracts/03-playback-singing-hints-and-timing.md`
- `../contracts/04-shared-ux-home-history-and-accessibility.md`

---

## 0. 成功定義

未知の短いdegree phraseを1〜2回聴き、歌い、度数として捉え、ベースで弾き、自己評価し、別KeyへTransferできる。

Phase 5.16.1終了時に毎日使える。

出荷:

- Degree Echo
- 共通Practice State Machine
- Practice Repository
- Session / Queue
- Hint 0〜4
- Sing gate / skip / octave reference
- Self Review
- Transfer
- History
- Home導線
- Fretboard
- keyboard
- full build

非対象:

- Rhythm Echo
- Bassline Echo
- Vault source
- metronome
- count-in必須化
- microphone
- auto score

---

## 1. 着手条件

- Phase 5.15が安全なbaseとして固定済み
- 5.15をpausedして別worktreeで始める場合、未コミット変更へ触れない
- base branch / commitを記録
- worktree clean
- tracked MIDI 0
- tracked `.local-evaluation` 0
- Practice / Chord Dojo / Home / History / Audio contractを監査可能

Phase 5.15未完了でも、5.14または安全な最新baseから独立worktreeで開始可能。
Analyzerへ依存しない。

---

## 2. User Flow

```text
Home
→ 今日のベース練習
→ Practice / Bass Practice
→ Degree Echo setup
→ Listen 1
→ Listen 2 / sing-along optional
→ Solo Sing
→ Think in Degrees
→ Play
→ Answer Reveal
→ Self Review
→ Transfer optional
→ Next
→ Session Summary
```

---

## 3. Degree Generator

### Input

```text
generatorVersion
seed
key
scale / tonal context
allowedDegrees
noteCount
phraseLength
tempo
pitchSpan
instrument
tuning
fretRange
handedness
rhythmPreset
singingReferenceMode
```

### Initial Vocabulary

```text
1
1–5
1–5–8
1–b3–4–5
1–5–6–b7
1–2–b3–5
5–b7–1
chromatic approach to 1 / 3 / 5
```

初期releaseでは無理に全語彙を実装しない。
Level presetへ明示的に割り当てる。

### Constraints

- 1〜6 notes
- 1 beat〜1 bar
- monophonic
- playable bass range
- unplayable jump禁止または難度管理
- same seed determinism
- invalid generationでinfinite retry禁止
- max attempts後は明示error

### Difficulty

```text
noteCount
phraseLength
tempo
pitchSpan
degreeComplexity
rhythmComplexity
positionShift
listenLimit
hintAvailability
transferDistance
```

単一level整数だけを正にしない。

---

## 4. State / Sing

共通State Machineを実装する。

Sing:

- Listen 1は静かに聴く
- Listen 2は一緒に歌う選択可
- playback終了後にSolo Sing
- gateDuration経過後に`歌えた`
- `歌唱をスキップ`
- skip時はindependentSuccess false
- microphone permission 0
- recording 0

Singing Reference:

- Auto / Original / +1 / +2
- target answerは変更しない
- referenceだけoctave shift
- settingをAttemptへsnapshot

---

## 5. Review / Transfer

Self Review:

```text
Again
Hard
Good
Easy
```

Optional issue:

```text
Pitch
Rhythm
Duration
Recall
Fretboard
```

Degree Echoでは`Pitch`はユーザー自己申告であり自動測定ではない。

Transfer:

- same degree sequence
- different key
- optional different start string / fret
- same rhythm
- relationを保存
- Good / Easy後に提示
- Again / Hardではまずretryを優先

---

## 6. UI

### Practice

```text
Chord Dojo | Bass Practice
```

Bass Practice内:

- Degree Echo title
- session progress
- 自己評価badge
- Challenge Card
- stepper
- Key / Tempo / Length / Notes
- Replay / listen count
- current prompt
- Hint
- Primary action
- Session side panel
- Fretboard
- Review
- Transfer
- Summary

未実装のRhythm / Bassline tabを押せる状態で表示しない。

### Home

最小カードを追加する。

- first run
- due exercises
- completed today
- next focus
- start button

### History

Practice Repositoryからsummaryを派生表示する。

---

## 7. Storage

実装:

- PracticeExercise
- PracticeAttempt
- PracticeSession
- PracticeSettings
- Queue state
- Review schedule
- versioned repository
- atomic write
- corruption isolation
- restart restore

禁止:

- Vault schema変更
- Chord Dojo storage再利用
- raw MIDI
- audio
- personal path

---

## 8. Stage / PR

### P5.16.1-00 — Audit

Branch:

```text
docs/p5161-00-audit
```

成果物:

```text
docs/phase5.16.1/00-repository-audit.md
docs/phase5.16.1/00-baseline-lock.json
docs/phase5.16.1/00-product-contract.md
docs/phase5.16.1/00-data-contract.md
```

監査:

- Practice route
- Chord Dojo
- Home
- History
- Playback
- degree / key
- local repository
- tokens
- Playwright
- keyboard

コード変更なし。

### P5.16.1-01 — Domain / Generator

```text
feature/p5161-01-domain-generator
```

実装:

- types
- State Machine
- seeded PRNG
- Degree Generator
- difficulty
- Hint
- Transfer
- singing reference
- property tests

Gate:

- determinism
- playable range
- valid transition
- no infinite loop
- octave reference correctness

### P5.16.1-02 — Playback / Sing

```text
feature/p5161-02-playback-sing
```

実装:

- timeline
- Clean Bass
- Singing Reference
- play / stop / replay
- listen count
- sing-along optional
- dwell gate
- skip
- safe cancellation

Gate:

- same seed same events
- no stuck sound
- route leave stop
- one audio graph
- no microphone
- no fake meter

### P5.16.1-03 — UI / Fretboard / Home

```text
feature/p5161-03-ui-home
```

実装:

- subnav
- Degree screen
- Challenge Card
- stepper
- primary CTA
- side panel
- fretboard
- Home card
- responsive
- keyboard
- accessibility

Gate:

- viewport matrix
- Chord Dojo unchanged
- Home unchanged outside card
- Hint 4 marker
- left hand / 5-string
- visual regression

### P5.16.1-04 — Review / Storage / History

```text
feature/p5161-04-review-storage-history
```

実装:

- rating
- issue
- independentSuccess
- Queue
- retry
- Transfer
- summary
- repository
- restore
- History

Gate:

- no fake score
- deterministic Queue
- corruption isolation
- atomic write
- History honesty
- app restart

### P5.16.1-05 — Release Gates

```text
test/p5161-05-release-gates
```

成果物:

```text
docs/phase5.16.1/01-generator-report.md
docs/phase5.16.1/02-playback-sing-report.md
docs/phase5.16.1/03-ui-home-accessibility.md
docs/phase5.16.1/04-storage-history-report.md
docs/phase5.16.1/05-runtime-memory.md
docs/phase5.16.1/06-final-report.md
```

---

## 9. Tests

### Generator

- same / different seed
- all supported keys
- level presets
- 4 / 5 string
- left / right
- fret range
- note count
- phrase length
- transfer
- invalid config
- max attempt failure

### State

- valid / invalid transition
- replay limit
- Hint order
- Sing gate
- Sing skip
- abandon
- restore
- session complete

### Playback

- single note
- phrase
- rapid replay
- stop
- route leave
- mode leave
- no leak
- octave reference

### Review / Storage

- every rating
- no issue / issue
- independentSuccess
- retry schedule
- Transfer relation
- first run
- reload
- corruption
- write failure
- feature flag OFF

### E2E

- Home start
- Practice switch
- full Degree flow
- Hint 0〜4
- Sing gate
- skip
- keyboard-only
- review
- Transfer
- summary
- restart
- long labels
- viewport
- reduced motion

---

## 10. Performance

- single exercise generation: perceptually immediate
- 1000 generation benchmark
- Queue generation non-blocking
- playback start no major delay
- route leave audio leak 0
- 1000 attempts display paginate / virtualize
- repeated sessions no retained growth
- bundle delta report
- Live MIDI / Dojo / Analyzer regression 0

Accuracy First型の長時間処理は本Phaseに存在しない。
UI freezeを許可しない。

---

## 11. Acceptance

1. Degree Echo完走
2. Listen / Sing / Think / Play / Review / Transfer
3. deterministic
4. Hint 0〜4
5. Sing dwell
6. Sing skip
7. octave reference
8. self review
9. independentSuccess honesty
10. Queue / retry
11. Transfer
12. Home card
13. History
14. local restore
15. 5-string
16. left-handed
17. keyboard-only
18. Chord Dojo unchanged
19. fake score 0
20. microphone permission 0
21. Vault schema unchanged
22. Analyzer unchanged
23. MIDI Exporter unchanged
24. lint PASS
25. app typecheck PASS
26. E2E typecheck PASS
27. Vitest PASS
28. Rust PASS
29. Playwright PASS
30. visual PASS
31. accessibility PASS or documented exception
32. Web build PASS
33. Tauri build PASS
34. tracked MIDI 0
35. worktree clean
36. main unmerged
37. Rhythm / Bassline未着手
38. Phase 5.17未着手

---

## 12. Final Behavior

Phase 5.16.1は内部で途中確認なしに完走する。
通常failureは自動修正する。

最終報告後に停止し、Phase 5.16.2へ自動で進まない。
