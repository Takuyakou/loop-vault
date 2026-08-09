<!-- phase-id: 5.18.1 -->

# Phase 5.18.1 Work Instructions
# Bassline Preset Library & Vault Source Picker

## 0. Mission

Bassline Echo の練習用コード進行を、既定1件から実用的なプリセット群へ拡張する。
さらに Bassline Echo 内から直接 Vault の保存進行を選択できるようにする。

この Phase の中心は、**コード進行ソースの選択体験**である。
新しいベースライン生成器、コード伴奏エンジン、録音エンジンは作らない。

---

## Scope

- Curated deterministic Bassline Echo preset progressions.
- A read-only Vault source picker exposed directly inside Bassline Echo.
- Safe integration with the existing Bassline generator, P5.18 Chord Context, P5.17 Record & Compare, and factual History.

## Non-goals

- Random progression generation, source MIDI bassline extraction, automatic scoring, Root Motion Echo, Vault schema changes, Vault mutation, AI recommendation, and P5.19.
- Changes to P5.15, the Analyzer, MIDI Exporter, Chord Dojo, Live MIDI, FreePats assets, P5.17 recording storage, or an unbounded/unrelated P5.18 accompaniment-engine redesign outside Contract 06.

---
# 1. Start-up audit

開始前に次を確認する。

- branch / HEAD
- master HEAD
- `git status --short`
- worktree 一覧
- merge / rebase / cherry-pick 状態
- P5.18 completion / merge commit が master の祖先
- P5.17 / P5.16 が master の祖先
- P5.15 commits が master の祖先でない
- `docs/CURRENT_STATE.md` が存在しない
- phase workflow / validator
- `docs/phase5.18.1` の整合

dirty な場合は reset / stash / 破棄せず停止。

Phase ID pattern が `x.y.z` を拒否する場合、P5.18.1-00で validator / schema を
最小限拡張し、`5.18.1` の正常系と不正形式の異常系 test を追加する。
既存 `5.17` / `5.18` を壊さない。

---

# 2. Required audit

## Current default progression

必ず特定する。

- source file
- ID
- display name
- chord sequence
- key / BPM / meter
- section
- tests / fixtures
- History / settings / serialized data reference
- deterministic seed への影響
- P5.18 Chord Context との接続

現在の既定進行は削除しない。

## Current source model

監査対象:

- Bassline Echo source type
- preset / generated / vault 等の現在の表現
- Progression Detail handoff
- P5.18 read-only snapshot
- section selector
- History source metadata
- source edit / delete logic

新しい duplicate source model を作らず、既存 model を拡張する。

## Vault UI / repository

監査対象:

- Vault list / search
- existing selector / dialog / combobox
- progression title / key / BPM / bar display
- favorites / recents が既にあるか
- virtualization / pagination
- empty / loading / error
- stable progression ID
- no raw path / no raw MIDI boundary

favorites / recents が既存 schema にない場合、P5.18.1で新設しない。

---

# 3. Preset library

## 3.1 Required catalog

`proposal/PRESET-CATALOG.md` の8候補を基準にする。

- 4度・5度の基礎
- Pop Four Chords
- Turnaround
- ii–V–I
- Minor Descent
- Modal Rock
- Descending Bass
- 12-bar Blues

現在の既定進行が上記のどれかと同一なら、その既存 ID を維持して統合する。
同一でなければ、既存進行を追加の legacy preset として残す。

## 3.2 Internal representation

UI に literal chord strings を散在させない。

既存 domain に合わせ、次の概念を表せる data-driven catalog とする。

- stable preset ID
- schema / catalog version
- name
- category
- difficulty label（ロック解除には使わない）
- default key / tonal center
- default BPM
- meter
- degree / borrowed degree
- chord quality
- slash-bass degree
- chord duration
- sections
- skill tags
- description

実際の型名は repository audit に合わせる。

## 3.3 Deterministic transposition

同じ:

- preset ID
- selected key / tonal center
- selected section
- bassline level
- generator seed

から同じ progression snapshot と bassline exercise を作る。

- `Math.random()` 直接使用禁止
- chord spelling policy は既存 canonical policy を再利用
- slash bass を正しく移調
- borrowed degree を保持
- quality を黙って簡略化しない

## 3.4 Representability Gate

P5.18.1-00で8候補を現在の parser / chord vocabulary / playback vocabulary に照合する。

判定:

- exact representable
- canonical alias で同一 identity
- accompaniment unavailable but Bass-only possible
- unsupported

禁止:

- `maj7` を major triad に黙って変更
- slash bass を root に黙って変更
- unknown chord を別 chord に置換

unsupported 候補がある場合は、意味的に最小の代替を report に提案し、
P5.18.1-00で停止する。承認なしに変更しない。

## 3.5 Sections

- 4-bar preset は通常1 section
- Descending Bass は1つの8-bar section とする
- 12-bar Blues は1つの12-bar section とし、暗黙分割をしない
- UI は Contract 06 の完全な 1 / 2 / 4 / 8 / 12-bar section だけを見せる

---

# 4. Source selector UX

## 4.1 Bassline Echo setup

Bassline Echo 内に常設する。

```text
練習するコード進行

[プリセット] [Vaultから選ぶ]

選択中:
Pop Four Chords
C | G | Am | F
Key: C / 4 bars / 92 BPM
[変更する]
```

色だけに依存しない。

## 4.2 Preset view

最低限:

- category
- preset name
- progression preview
- purpose / skill tags
- current key
- bars / section
- default BPM

カテゴリ:

- Foundation
- Functional
- Practical

難易度は情報表示だけで、unlock / score / level gate に使わない。

キー変更は preset source だけに適用する。
Vault source の key を Practice 側で勝手に書き換えない。

## 4.3 Vault button

Bassline Echo から直接 `Vaultから選ぶ` を開く。

Progression Detail 経由しか選べない状態を acceptance failure とする。

ボタンは:

- Bassline Echo setup から認識可能
- keyboard reachable
- accessible name が明確
- source が既に Vault でも再選択可能

## 4.4 Vault picker

最低要件:

- loading
- empty
- error
- search
- list
- selected state
- preview summary
- section selection
- confirm
- cancel

表示候補:

- title / safe label
- key / mode
- BPM
- meter
- bars / duration
- chord preview
- current section compatibility

既存 search/filter があれば再利用する。
新しい Vault index / schema を作らない。

## 4.5 Selection transaction

- picker を開いただけでは source を変更しない
- row click だけで Practice を破壊しない
- `この進行を使う` 等の confirm で確定
- Cancel で元 source を維持
- confirm 後に previous playback / generated queue / recorder context を安全に reset
- retained takes を削除しない

---

# 5. Vault source contract

- read-only snapshot
- stable reference
- safe label
- key / mode
- original BPM
- meter
- chord sequence / onset / duration
- slash bass
- selected section
- snapshot signature

保持禁止:

- source filesystem path
- personal absolute path
- raw MIDI
- raw track name に個人情報がある場合の無加工保存
- user-identifying metadata

## Edited source

- 新規練習は最新 source
- 過去 History は当時 snapshot
- 変更を検出できる場合は事実表示
- 過去 attempt を書き換えない

## Deleted source

- 過去 History / retained take は利用可能
- 新規練習は不可
- picker で再選択を促す
- 別 source に自動置換しない

---

# 6. Integration

選択 source は次すべてで同じ正本を使う。

- Bassline generator
- Bassline Echo Listen
- P5.18 Chord Context
- section
- tempo default
- P5.17 Record & Compare context
- Review / History

UIだけ切り替わり、playback/generatorが旧進行のままになる不整合を許さない。

source change 時:

- active target playback stop
- chord accompaniment stop
- metronome stop
- recording は安全停止 / 明示確認（既存P5.17契約を優先）
- old exercise queue を破棄または source signature で無効化
- new source から deterministic regenerate
- stuck sound 0

---

# 7. History / compatibility

## New factual metadata

既存 schema を backward-compatible に拡張する場合の候補:

- `sourceKind: "preset" | "vault"`
- preset ID / catalog version
- Vault stable reference
- snapshot signature
- safe label
- selected key
- selected section
- original BPM
- effective BPM
- bassline level

型名と保存場所は audit に合わせる。

## Legacy data

- old History は読み込み可能
- source metadata がない old attempt は `Legacy default` 等の事実表示
- 既存 default ID を削除しない
- destructive migration 禁止
- future version は既存 policy を維持

---

# 8. Feature rollback

既存 P5.18 / Bassline feature flag で安全に rollback できるなら再利用する。

不足する場合だけ独立 flag を検討:

`enableBasslineProgressionSourcePicker`

要件:

- production default true
- local explicit false rollback
- false でも既存 default Bassline Echo が利用可能
- false にしても History / retained take を削除しない
- test から true 注入せず production default E2E

不要な flag 増加を避け、P5.18.1-00で決定する。

---

# 9. Stage instructions

## P5.18.1-00 — Audit / Contract / Baseline

production feature は実装しない。

実施:

- phase ID validator
- current default progression / ID / fixture
- source model
- Vault picker reuse candidates
- section contract
- History / migration
- 8 preset representability
- current baseline gates

固定:

- final catalog count
- current default compatibility
- preset IDs
- exact chord formulas / sections
- category
- key / BPM range
- source union
- picker architecture
- History fields
- feature flag policy

Gate:

- `npm run validate:phase-docs`
- validator tests
- baseline Vitest
- lint
- app / E2E typecheck
- Rust
- current Bassline / P5.18 regression
- `git diff --check`

停止し report。

## P5.18.1-01 — Preset Domain / Catalog

実装:

- data-driven preset catalog
- versioning
- current default alias / compatibility
- deterministic transposition
- section model
- validation
- catalog tests
- representability tests

## P5.18.1-02 — Vault Picker

実装:

- direct Bassline Echo button
- dialog / drawer / current design-system component
- search / list / empty / error
- selection transaction
- section
- read-only snapshot
- keyboard / screen reader
- large-list behavior

## P5.18.1-03 — Source Integration

実装:

- source selector
- selected summary
- preset key selection
- generator / playback / Chord Context integration
- Record & Compare context
- source switch lifecycle
- History metadata
- E2E from Bassline Echo → Vault picker → practice

## P5.18.1-04 — Migration / Hardening

実装:

- legacy History
- legacy default
- deleted / edited Vault
- unsupported chord
- long progression
- 20× source switch
- route / tab leave
- feature rollback
- accessibility
- 320px / 200%
- visual regression

## P5.18.1-05 — Release / Acceptance

実施:

- full release gates
- direct exe / MSI / NSIS
- acceptance report
- master unmerged
- push not performed

最終状態:

`READY FOR PRODUCT ACCEPTANCE — Bassline Preset Library & Vault Source Picker`

---

# 10. Automated test matrix

## Presets

- catalog IDs unique
- count / compatibility rule
- current default preserved
- each preset exact formula
- transposition all 12 roots where supported
- borrowed degree
- slash bass
- sections
- default BPM within locked range
- deterministic snapshot
- deterministic bassline
- unsupported quality does not silently simplify
- 12-bar section boundaries

## Source selector

- default preset shown
- switch to preset
- open Vault picker
- cancel preserves source
- confirm changes source
- switch back to preset
- source summary
- active playback stopped on source change
- recording lifecycle safe
- queue regenerated
- no stale source

## Vault picker

- loading
- empty
- error
- search no result
- search result
- keyboard navigation
- confirm
- cancel
- long progression section
- deleted between open and confirm
- edited source
- unsupported chord
- large Vault
- read-only
- no path leakage

## History

- preset attempt
- Vault attempt
- old attempt without source metadata
- restart persistence
- edited/deleted source
- retained recording
- no score fabrication

## E2E

1. production default shows source selector
2. current legacy default still works
3. eight-role catalog available
4. choose preset
5. change preset key
6. start Bassline Echo
7. Chord Context uses selected preset
8. open `Vaultから選ぶ` from Bassline Echo
9. search Vault
10. select progression
11. select section
12. start practice
13. Record & Compare remains available
14. Review / History records Vault source
15. restart
16. switch back to preset
17. explicit rollback
18. keyboard / a11y / viewport

---

# 11. Full release gates

P5.18.1-05:

- `npm run validate:phase-docs`
- validator tests
- `npm run lint`
- app TypeScript
- E2E TypeScript
- P5.18.1 tests
- Bass Practice tests
- P5.18 tests
- full Vitest
- Rust
- production-default Playwright
- full Playwright
- accessibility
- keyboard
- reduced motion
- 320px
- 200% scale
- Web production build
- Tauri release build
- P5.16 benchmark
- P5.17 resource regression
- P5.18 resource regression
- P5.18.1 source-switch benchmark
- `git diff --check`

Protected surfaces:

- tracked MIDI 0
- tracked real recordings 0
- tracked `.local-evaluation` 0
- personal absolute path 0
- P5.15 diff 0
- Vault schema diff 0
- Vault mutation 0
- Analyzer diff 0
- MIDI Exporter diff 0
- Chord Dojo non-regression
- Live MIDI non-regression
- FreePats non-regression
- Record & Compare non-regression
- Chord Context non-regression
- `docs/CURRENT_STATE.md` absent

---

# 12. Product acceptance

生成:

- direct executable
- MSI
- NSIS

report:

- relative path
- bytes
- SHA-256
- build commit
- app version
- build date
- catalog version / preset count
- current default compatibility result
- feature flag value

Human checklist:

1. Bassline Echo を開く
2. source selector が見える
3. プリセット一覧を開く
4. 既存 default が利用できる
5. 役割の異なるプリセットを確認
6. preset key を変更
7. Bassline を開始
8. Chord Context が同じ進行
9. `Vaultから選ぶ` を押す
10. picker が開く
11. 検索
12. 保存進行を選択
13. section を選択
14. Bassline を開始
15. Chord Context
16. Record & Compare
17. Review / History
18. restart
19. source edit / delete の安全動作
20. Vault mutation 0
21. source switch で stuck sound 0
22. UI が分かりやすく選択負荷が過大でない

master merge は人間 acceptance 後の別指示。

---

# 13. Commit rules

各 Stage:

- `git status --short`
- `git diff`
- `git diff --check`
- intended path list
- `git add -A` 禁止
- `git add .` 禁止
- staged diff / name-status
- generated artifact 0
- explicit-path commit
- post-commit clean
- execution-state update

master merge / push / P5.19 禁止。

---

## Definition of Done

- Every supported preset is represented by a deterministic, versioned catalog entry without silently simplifying a chord identity.
- Bassline Echo offers accessible Preset and Vault source selection; Vault input is read-only and crosses only as a safe detached snapshot.
- Legacy History remains readable, source switching releases playback resources safely, and release gates plus human product acceptance pass.
- Protected surfaces remain unchanged, master is not merged automatically, push is not performed, and P5.19 is not started.

---
# 14. Final report

- final determination
- branch / HEAD
- Stage commit chain
- audit findings
- final preset catalog
- current default compatibility
- source model
- Vault picker architecture
- selection transaction
- section behavior
- History migration
- feature rollback
- test counts
- Playwright / Rust / Web / Tauri
- resource benchmark
- protected surfaces
- artifacts / SHA-256
- git status
- master unmerged
- push not performed
- P5.19 not started
- human checklist

Final determination:

- `READY FOR PRODUCT ACCEPTANCE — Bassline Preset Library & Vault Source Picker`
- `BLOCKED — compatibility or Vault picker contract incompatible`
- `FAIL — source selection is not production-safe`
