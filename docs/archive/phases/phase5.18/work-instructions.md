<!-- phase-id: 5.18 -->

# Phase 5.18 Work Instructions — Chord Context Practice

## 0. Mission
Bassline Echo にコード伴奏の文脈を追加し、
Vault に保存したコード進行を使って「コードの上でベースを弾く」練習を成立させる。

P5.18 は採点器を作る Phase ではない。
P5.16 Bassline Echo と P5.17 Record & Compare を、保存進行とコード伴奏で接続する。
## Scope
Bassline Echo のみに、read-only Vault snapshot、Chord Context accompaniment、
manual BPM、事実ベースのHistory、P5.17の任意再利用を追加する。P5.18-00は
監査・契約・baselineだけであり、production codeは変更しない。

## Non-goals
P5.18は自動採点、演奏内容推定、元MIDI bass抽出、新generator、DI/マイク
workflow、Vault write-back、P5.15再開、Chord Dojo/Live MIDI/Analyzer/MIDI Exporter
の変更を含まない。

# 1. Start-up audit
開始前に以下を記録する。

- branch
- HEAD
- master HEAD
- `git status --short`
- worktree 一覧
- merge / rebase / cherry-pick の進行有無
- P5.17 完了 commit が master の祖先
- P5.15 commits が master の祖先でない
- `docs/CURRENT_STATE.md` が存在しない
- phase-workflow / validator の状態

clean でない場合は reset / stash / 破棄せず停止。

# 2. Required repository audit

## Vault / progression
- progression schema
- repository
- Progression Detail
- snapshot / reference / restore
- key / mode / tempo / meter / chord start / duration / slash bass

## Bass Practice
- Bassline Echo domain / generator / playback
- review queue
- History
- source type
- Progression Detail → Bass Practice handoff
- feature flags

## Audio
- PlaybackController
- chordVoicing
- Chord Dojo chord playback
- metronome
- FreePats
- global master volume
- stop / dispose lifecycle

## P5.17
- RecordCompareSection
- RecordingSessionController
- TargetPlayer / TakePlayer
- IndexedDB takes
- History integration
- permission / channel / device settings

監査結果を `audit/P5.18-00-repository-audit.md` と Stage report に記録する。

# 3. Core product flow

```text
Vault
→ Progression Detail
→ Bass Practice / Chord Context
→ section selection
→ Listen
→ Play with accompaniment
→ Record & Compare (optional)
→ Review
→ History
```

# 4. Practice sources

## 4.1 Vault Progression
Practice 開始時に read-only snapshot を作る。

最低限:
- stable source reference
- safe label/title
- key
- mode
- original BPM
- meter
- chord sequence
- chord onset / duration
- slash bass
- selected section
- snapshot version / signature

禁止:
- 元 MIDI path
- 個人絶対 path
- raw MIDI
- Vault mutation
- Practice から Vault への write-back

## 4.2 Generated Progression
既存 generated flow を維持。
新しい progression generator は作らない。

# 5. Source lifecycle

## Source edited
- 新規 Practice は最新 source
- 過去 History は当時 snapshot
- 過去 attempt は書き換えない

## Source deleted
- 過去 History は表示可能
- retained take は再生 / 削除可能
- 新規 Practice は不可
- 別 progression へ自動置換しない

# 6. Section selection
P5.18-00 で現在 schema / generator / review queue を監査してから対応長を固定。

禁止:
- UI だけ長くして persisted schema を破壊
- target event 上限無視
- Degree Echo multi-bar backlog を混ぜる

最低要件:
- 現行 schema で安全な単位
- section start/end が明確
- chord boundary と一致
- History に section を保存
- 長い progression は安全な単位で選べる

# 7. Chord accompaniment engine

## 7.1 Design
既存 abstraction が十分なら再利用。
不足時のみ Bass Practice 用の player / scheduler / voicing strategy / mix を追加。

## 7.2 Determinism
同じ snapshot + section + BPM + meter + preset → 同じ chord event / voicing / timing。
`Math.random()`禁止。

## 7.3 Bass-safe voicing
- chord accompaniment は中域以上
- 低域 root で実ベースをマスクしない
- slash bass は harmony 情報として尊重
- slash bass を理由に最低音を低くしない
- deterministic voice leading
- chord tone 以外を無断追加しない
- unsupported quality は安全な fallback / unavailable

register floor / ceiling は P5.18-00 で固定。

## 7.4 Timing
- onset / duration は snapshot
- count-in と開始時刻統一
- tempo override を全 layer に適用
- Bass / Chords / Metronome を同じ時間基準へ
- Stop で全 voice 停止
- route / tab / mode leave で dispose
- overlapping start を安全に置換
- stuck sound 0

# 8. Listen modes
1. Bass only
2. Chords only
3. Bass + Chords
4. Bass + Chords + Metronome

推奨 default: `Bass + Chords`

# 9. Play modes
1. Chords only
2. Chords + Metronome
3. Metronome only
4. No accompaniment

推奨 default: `Chords only`

Play 中に target bass を自動再生しない。

# 10. Mix
分離:
- Bass target level
- Chord accompaniment level
- Metronome level

global master は既存経路。
Chord Dojo 音量仕様や FreePats asset を破壊的変更しない。

# 11. Tempo

## Original BPM
Vault BPM / generated exercise BPM を default。

## Manual override
Practice session 内のみ。
Vault へ書き戻さない。
History に original/effective BPM を区別して保存。

## +4 BPM
明示ボタン。
自動適用しない。
上下限は P5.18-00 で固定。

# 12. P5.17 Record & Compare integration
P5.17 の録音 engine / storage / History を再実装しない。

Chords only / Chords + Metronome 中も録音可能。
app output を capture stream に内部 mix しない。
live monitoring なし。
スピーカー漏れ対策として「ヘッドホン推奨」を事実表示。

Target と My Take の排他的再生を維持。

# 13. History
事実だけ保存。

候補:
- source type
- source reference
- safe source label
- section
- original BPM
- effective BPM
- Listen mode
- Play mode
- metronome used
- Record & Compare used
- retained take reference
- snapshot signature

禁止:
- accuracy
- pitch/rhythm score
- ability score
- skill level
- 推測した演奏内容

# 14. UI
Bassline Echo のみに追加。

- source
- selected section
- Listen layer selector
- Play accompaniment selector
- BPM
- +4 BPM
- P5.17 Record & Compare section

密集時は progressive disclosure。

# 15. Accessibility
- keyboard only
- radio / segmented semantics
- current mode 読み上げ
- BPM / +4 label
- Stop focus維持
- ARIA live
- 色だけに依存しない
- 200% scale
- 320px
- reduced motion
- focus trapなし

# 16. Feature flag
必要なら:
`enableBassPracticeChordContext`

release default `true`、local explicit `false` rollback。
既存 Echo / Record & Compare flags と独立。
production-default E2E は true 注入禁止。

# 17. Stage instructions

## P5.18-00 — Audit / Contract / Baseline
production code変更禁止。

監査:
- Vault snapshot
- source lifecycle
- Bassline schema / safe section length
- PlaybackController / chordVoicing / Chord Dojo
- metronome / FreePats mix
- P5.17 Record & Compare
- History schema
- feature flag pattern
- Tauri/Web timing

固定:
- section contract
- voicing register
- default mix
- BPM range
- source snapshot contract
- History contract
- rollback policy

Gate:
- phase docs validation
- baseline Vitest
- lint
- app / E2E typecheck
- Rust
- current Bass Practice regression

停止して report。

## P5.18-01 — Chord Accompaniment Engine
- playback abstraction
- deterministic voicing
- bass-safe register
- scheduler
- mix
- stop/dispose
- fake player
- offline/deterministic/resource tests

## P5.18-02 — Vault Progression Source / Section Selection
- Vault snapshot
- Progression Detail handoff
- section selection
- edited/deleted behavior
- Generated compatibility
- Vault mutation 0

## P5.18-03 — Bassline Echo Listen / Play Integration
- Listen 4 modes
- Play 4 modes
- layer switching
- lifecycle
- FreePats non-regression
- production-default E2E
- a11y / visual

## P5.18-04 — Record & Compare / Tempo / History
- accompaniment + recording
- headphone recommendation
- manual BPM
- +4 BPM
- History factual fields
- restart persistence
- edited/deleted source History
- P5.17 regression

## P5.18-05 — Product Hardening / Release
- error states
- unsupported chord fallback
- resource benchmark
- viewport / keyboard / reduced-motion
- production identity
- Tauri release build
- Product Acceptance artifacts

最終:
`READY FOR HARDWARE ACCEPTANCE — Chord Context Practice`

masterへmergeせず停止。

# 18. Automated test matrix

## Chord voicing
現在の canonical vocabulary を P5.18-00 で取得して test 対象を固定。
推測で vocabulary を増やさない。

最低限:
- major / minor
- dominant7 / maj7 / m7
- m7b5
- sus
- extensions の既存対応範囲
- slash bass
- repeated chord
- voice-leading
- unsupported quality
- bass-safe lowest note
- deterministic output

## Timing
- 4/4
- 3/4
- 現在対応 meter
- 1 beat / 2 beats / 1 bar chord
- representable なら syncopated onset
- tempo override
- +4 BPM
- rapid start/stop
- route leave

## Vault
- normal
- slash bass
- edited/deleted/missing
- long progression
- section boundary
- no title
- generated source

## Resources
- 各 Listen / Play mode
- 20× replay
- 20× layer switch
- 20× Play/Stop
- mode / route leave
- retained playback handle 0

## Record & Compare
- chords while recording
- chords + metronome while recording
- retake / discard / keep
- restart History
- target/take exclusive playback
- explicit feature flag false

# 19. Full release gates
P5.18-05:
- `npm run validate:phase-docs`
- validator tests
- lint
- app TypeScript
- E2E TypeScript
- P5.18 tests
- Bass Practice tests
- full Vitest
- Rust
- production-default Playwright
- full Playwright
- a11y / keyboard / reduced motion / viewport
- Web build
- Tauri build
- P5.16 benchmark
- P5.17 resource regression
- P5.18 resource benchmark
- `git diff --check`

Protected:
- tracked MIDI 0
- tracked real recordings 0
- `.local-evaluation` 0
- personal path 0
- P5.15 diff 0
- Vault schema diff 0
- Vault mutation 0
- Analyzer diff 0
- MIDI Exporter diff 0
- Chord Dojo / Live MIDI / FreePats / Record & Compare non-regression
- `docs/CURRENT_STATE.md` absent

# 20. Hardware acceptance
Target Windows + actual audio interface / bass。

1. Vault の保存進行を選ぶ
2. Progression Detail から開く
3. section を選ぶ
4. Listen 4 modes
5. Play 4 modes
6. BPM 変更 / +4 BPM
7. Vault BPM 不変
8. Record & Compare
9. Target / My Take
10. Keep Take / restart / History
11. source 編集後の過去履歴
12. Stop / tab / route leave
13. stuck sound 0
14. Vault mutation 0

音楽的確認:
- chord がベースをマスクしない
- 低域 root が二重化しない
- slash chord で不自然に低くならない
- chord change timing
- metronome / chord / bass sync
- FreePats Bass の明瞭さ
- 音量バランス

# 21. Product acceptance artifacts
direct executable / MSI / NSIS。

report に relative path / bytes / SHA-256 / build commit / app version / build date / feature flag / voicing preset / register / default mix / BPM range。

生成物はcommitしない。

# 22. Commit rules
- `git status --short`
- `git diff`
- `git diff --check`
- explicit paths
- `git add -A`禁止
- `git add .`禁止
- staged diff / name-status
- generated artifact 0
- commit
- post-commit clean
- execution-state更新

master merge / push禁止。

# 23. Final report
- determination
- branch / HEAD
- Stage chain
- source / section contract
- playback architecture
- voicing / mix
- Listen / Play
- tempo
- Vault lifecycle
- Record & Compare
- History
- accessibility
- test counts
- Playwright / Rust / Web / Tauri
- resource benchmark
- protected surfaces
- artifacts / SHA-256
- git status
- master unmerged
- push not performed
- P5.19 not started
- hardware checklist

Final:
- `READY FOR HARDWARE ACCEPTANCE — Chord Context Practice`
- `BLOCKED — Vault or playback contract incompatible`
- `FAIL — Chord Context Practice is not production-safe`

## Definition of Done
P5.18全体の完了は、READMEのCompletion gates、各Stage report、execution-stateの
recorded pass gates、および明示path commitがGit実態と一致するときだけである。
P5.18-00の完了は、Section 17のP5.18-00 GateをPASSとして記録し、P5.18-01へ
着手せず停止したときだけである。