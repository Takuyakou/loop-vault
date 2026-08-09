<!-- phase-id: 5.19 -->
# Phase 5.19 Work Instructions — Root Motion Echo

## 0. Mission
Bass Practiceに、2音間または短いroot列の相対移動を学ぶRoot Motion Echoを追加する。

新規性:
1. Bass Practice初の客観Identify判定
2. 指板シェイプ学習
3. 同一motionのTransfer
4. Vault進行root列の教材化

Sing/Playの自動採点は行わない。

## Scope

- Root Motion Echo learning flow, deterministic generated and Vault-derived root paths,
  canonical fingering, objective Identify evidence, Transfer, and factual History.
- Reuse existing Bass Practice playback and P5.17 Record & Compare lifecycle contracts.
- P5.19-00 changes only audit, contracts, reports, execution state, and baseline evidence.

## Non-goals

- No Stage01 product implementation during P5.19-00.
- No Vault schema or mutation, no Analyzer/MIDI Exporter/P5.15 changes, no automatic scoring,
  no source-MIDI bassline interpretation, no P5.20 work, and no merge or push.
## 1. Start-up audit
- branch / HEAD / master HEAD
- `git status --short`
- worktrees / merge/rebase/cherry-pick
- P5.18.2 completion ancestor
- P5.18.1/P5.18/P5.17 ancestors
- test-output hygiene ancestor
- P5.15 non-ancestor
- `docs/CURRENT_STATE.md` absent
- phase-doc validator

dirtyならreset/stash/discardせず停止。

## 2. Required repository audit
### Practice
`PracticeExercise`, mode union, targetEvents制約, generator, session reducer, Review queue, Hint, Transfer, PracticeAttempt, History, schema/zod/migration。

### Fretboard
4/5-string tuning、fret range、pitch↔position、left/right、existing hint representation、canonical solver有無。

### Audio / recording
FreePats playback、preview/stop/dispose、P5.17 Record & Compare integration。

### Vault
P5.18.2 picker、safe snapshot、stable source reference、chord roots、section、title privacy、edit/delete lifecycle。

## 3. Motion domain
概念上は direction と interval magnitude を分離する。signed deltaだけでUI意味を潰さない。

Invariant:
- sameは0
- up/downはdirectionとdeltaが矛盾しない
- octave-equivalent destinationでもdirectionを保持
- source/target MIDI pitchを明確化

## 4. Objective Identify evidence
最低限:
- expected direction
- expected category / exact interval
- first answer
- directionCorrect
- categoryCorrect
- exactIntervalCorrect
- replayCountBeforeFirstAnswer
- answerAttempts
- assistance: independent / assisted / revealed

後から正解してもfirst answerを上書きしない。

Review (Again/Hard/Good/Easy) は自己評価。Identify結果から自動変換しない。

## 5. Levels
- L1 direction
- L2 broad category（P5.19-00で語彙固定）
- L3 exact interval
- L4 3〜4 notes chain
- L5 same chain Transfer

## 6. Generator
候補motion: same, ±1, ±2, ±3, ±4, ±5, ±6, ±7 semitones。
重みはP5.19-00で固定。4th/5th highest、2nd high、semitone/3rd medium、tritone low、same mediumを基準にする。

Requirements:
- deterministic seed
- playable range
- 4/5 string
- max fret
- bounded retry
- no hidden octave substitution
- no `Math.random()`

## 7. Canonical fingering solver
Input: bass config, source/target pitch, allowed fret range。
Output: source string/fret, target string/fret, shape, tie-break reason。

Tie-break policyはP5.19-00で固定しtest化。
優先候補: playable → small practical shift → stable mid-neck → edge avoidance → deterministic order。

教科書shapeが成立しない場合は別位置を選ぶか実際のshapeを示す。嘘表示禁止。

## 8. Shape language
UIは `高音側の隣弦 / 低音側の隣弦 / 同じ弦 / 同フレット / nフレット高い・低い`。
Handednessは描画方向のみ変え、semantic labelは変えない。

## 9. Hint ladder
Hint 0 none / 1 direction / 2 category / 3 exact / 4 fretboard shape。
assistance classificationと独立正解判定を分離。

## 10. Session integration
`Listen → Identify → Sing → Play → Review → Transfer`
既存Bass Practice conventionsを再利用。Root Motion failureで他modeやPractice全体を壊さない。

## 11. Vault-derived root path
safe Vault chord/root dataを使用。titleはpicker UI専用。

rootだけではoctave direction不明なので、P5.19-00でdeterministic placement policyを固定する。
- practical starting register
- each next pitch-class occurrenceをdeterministic選択
- playable range
- exerciseにchosen directionを保持

UIは `Vault由来のルート経路` 等。original basslineと称さない。

## 12. Motion chains
L4: 3〜4 notes。Practice schemaのtargetEvents制約をP5.19-00で監査。
安全に表現できない場合は無理に拡張せず停止して設計提案。

## 13. Transfer
同じsigned motion sequence + 新しいstarting pitch → new path。
range/fingeringを再計算し、deterministicにする。

## 14. History / metrics
Objective: first-answer accuracy, direction/category/exact, assistance, replay, motion confusion。
Subjective: Review, weakness tags, Record & Compare usage。

表示はobjective/self-ratedを明示。`4th up: 8/10 first answers`は可、`Interval skill 80`は禁止。

## 15. Record & Compare
P5.17を再利用。新しいrecorder/storeは作らない。take contextへlive Vault titleを保存しない。

## 16. Accessibility
keyboard Identify、correct/incorrect非色依存、hint label、shape text equivalent、4/5-string、left/right、320px、200%、reduced-motion、focus安全。

## 17. Stage instructions
### P5.19-00 — Audit / Contract / Baseline
production変更禁止。schema、motion vocabulary/weights、L2 categories、assistance、fingering tie-break、playable range、chain length、History fields、Vault placement policy、feature flagを固定。
Gate: phase docs, validator, baseline tests, lint, app/E2E typecheck, Rust, Bass Practice regression, diff check。停止。

### P5.19-01 — Motion Domain / Generator / Fingering Solver
Domain、generator、placement、solver、shape、boundary/property tests。

### P5.19-02 — Identify / Core Two-note Flow
mode entry、Listen/Identify、objective evidence、first answer、Hint 0〜4、Sing/Play/Review、feature flag、production-default E2E。

### P5.19-03 — Fretboard / Transfer / History / Record & Compare
shape UI、4/5-string、left/right、Transfer、objective/self-rated History、Record & Compare、restart persistence。

### P5.19-04 — Vault-derived Source / Motion Chain
Generated/Vault source selection、root extraction、deterministic path、honest labeling、L4 chain、L5 Transfer、edit/delete/privacy。

### P5.19-05 — Hardening / Release / Acceptance
invalid source、no legal fingering、edge strings/frets、repeated hints/Transfer/source switch、route/tab leave、resource benchmark、a11y、Web/Tauri、artifacts、human acceptance。

Final pre-human: `READY FOR PRODUCT ACCEPTANCE — Root Motion Echo`。master未mergeで停止。

## 18. Automated test matrix
### Domain
same, ±1..±7, direction consistency, label/category, deterministic identity。
### Generator
seed, weights sanity, range, 4/5 string, low B, high fret, bounded retry, each vocabulary item。
### Fingering
multiple equivalent positions, edge strings, max fret, left/right visual equivalence, no false shape。
### Identify
first correct, wrong→correct, direction/category/exact, replay, hints, revealed, Review independence。
### Chain/Transfer
3/4 notes, signed sequence preservation, legal transfer, impossible handling, determinism。
### Vault
normal, repeated root, slash chords, title privacy, edited/deleted, ambiguous pitch-class direction, deterministic root path, no original-bassline label。
### History/Recording
objective/self-rated split, no composite, restart, retained take, legacy compatibility, title absent。

## 19. Full release gates
- phase docs + validator
- lint
- app/E2E TypeScript
- P5.19 focused
- Bass Practice
- P5.18.2/P5.18.1/P5.18 regressions
- full Vitest
- Rust
- production-default/full Playwright
- a11y/keyboard/reduced-motion/320px/200%
- Web/Tauri build
- P5.16 benchmark
- P5.17/P5.18/P5.18.1 resource regressions
- P5.19 benchmark
- `git diff --check`
- post-test/build clean status

Protected: tracked MIDI/recordings/.local-evaluation/personal paths/title persistence = 0、P5.15/Vault schema/mutation/Analyzer/MIDI Exporter diff 0、test-output hygiene維持。

## 20. Artifacts
Direct exe / MSI / NSIS。relative path, bytes, SHA-256, build commit, version/date, feature flag, vocabulary version, fingering policy version, Vault root-path policyをreport。

## 21. Human acceptance
1. Root Motion open
2. L1/L2/L3
3. correct/incorrect
4. Review independence
5. Hint 1〜4 / assistance
6. 4/5-string / left-right
7. natural shape / no false edge shape
8. Transfer
9. L4 chain / L5 transfer
10. Vault source / honest label
11. title privacy
12. Record & Compare
13. History objective/self-rated split
14. restart / edit/delete
15. stuck sound 0
16. existing modes non-regression
17. 1日5分程度で使いやすい

## Definition of Done

- Every stage has a separately committed report, execution-state update, and all of its
  required gates recorded as `pass` at the committed HEAD.
- P5.19 is complete only after the Root Motion flow, privacy and protected-surface contracts,
  release gates, and explicit human product acceptance are complete. Do not merge or push
  without a separate user instruction.
## 22. Git rules
Each Stage: status, diff, diff-check, intended paths, no add-A/add-dot, staged review, commit, post-commit clean, state update。master merge/push/P5.20禁止。
