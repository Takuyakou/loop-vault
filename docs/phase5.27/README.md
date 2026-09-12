<!-- phase-id: 5.27 -->

# Phase 5.27 — Progression Voicing Practice

## Status
`P5.27-00 COMPLETE — STOPPED BEFORE P5.27-01`

## Product goal

保存したコード進行を、

```text
好きな進行
→ 好きなVoicing
→ 自動送り
→ 無限Loop
→ 何周も弾く
→ 作曲時に頭と手から取り出す
```

ための新しいPractice modeを追加する。

このモードの目的はピアノ演奏の採点ではない。

> **コード進行と実用的なVoicingを、作曲語彙として頭・耳・手へ定着させる。**

---

## Required Reading Order

着手・再開時:

1. [root AGENTS.md](../../AGENTS.md)
2. [root CLAUDE.md](../../CLAUDE.md)
3. [execution-state.json](execution-state.json)
4. [work-instructions.md](work-instructions.md)
5. [original design](proposal/DESIGN-v0.1.md)
6. [integrated review](proposal/REVIEW-INTEGRATED-v0.2.md)
7. [product/session contract](contracts/01-product-session-contract.md)
8. [no-scoring contract](contracts/02-no-scoring-contract.md)
9. [practice clock contract](contracts/03-practice-clock-contract.md)
10. [voicing source contract](contracts/04-voicing-source-contract.md)
11. [lesson rule contract](contracts/05-lesson-rule-contract.md)
12. [source/custom fidelity contract](contracts/06-source-custom-fidelity-contract.md)
13. [Open Voicing deferral contract](contracts/07-open-voicing-deferred-contract.md)
14. [UI/UX skill contract](contracts/08-ui-ux-skill-contract.md)
15. [persistence/privacy contract](contracts/09-persistence-privacy-contract.md)
16. [integration protection contract](contracts/10-integration-protection-contract.md)
17. [Lesson Rule Audit](references/LESSON-RULE-AUDIT.md)
18. [UI Skill Reference](references/UI-SKILL.md)
19. [approved mock](mock/progression-voicing-practice-approved-mock.html)
20. [active repository audit](audit/P5.27-00-repository-audit.md)
21. [active Stage00 report](reports/P5.27-00-audit-baseline.md)

Git realityを正とする。

---

# Product placement

Product上は新しいPractice mode。

ただしChord Dojoと同じ素材/部品を再利用する。

推奨taxonomy:

```text
Practice
├─ Chord Practice
│  ├─ Chord Dojo
│  └─ Voicing Loop
└─ Bass Practice
```

Stage00で現行navigationを監査して最小変更を選ぶ。

---

# Core difference from Chord Dojo

## Chord Dojo
- 演奏を目標Voicingと照合
- success/failureが存在
- skill progression
- 達成によって進行する

## Progression Voicing Practice
- **採点しない**
- **ユーザー演奏を待たない**
- **時間で進む**
- **最後まで行ったら先頭へ戻る**
- **通常終了条件はユーザーStop/Exitのみ**

### Termination Contract

正常セッションは:

```text
User starts
→ timeline runs
→ loops forever
→ user pauses/stops/exits
```

演奏内容・正誤・Loop回数・達成率によって自動終了しない。

---

# Must-have Voicing groups

## MY VOICINGS

### Source MIDI
元MIDIから保存されたSource Voicingを使用。

### Custom
ユーザーがLive MIDI等で保存したCustom Voicingを使用。

この2つはv1 Must。

目的:

> **実際に気に入った響き / 自分で作った響きを覚える。**

---

## LESSON

### Basic 1–7–3

段階:

```text
Shell
1 + 7
```

↓

```text
Basic Full
1 + 7 + 3
```

6th family等は勝手に7thを足さない。
Stage00でLesson Rule Tableを固定する。

### Left-hand Voicing

既存Chord DojoのRootless系と、
ユーザーの過去レッスン資料の規則を監査して再利用する。

一般Jazz理論で未定義部分を勝手に埋めない。

---

# Open Voicing

P5.27 v1ではproduction Mustにしない。

理由:

```text
Open Voicing
=
harmonic support
+
3rd
+
Top Note / Melody
```

だが、Text ProgressionにはTop Noteが存在しない。

曖昧なAuto Melodyを「正解」として学習させない。

別Phase候補:

`Top-note / Melody Voicing`

---

# Practice flow

```text
Progression Detail / Text Save
        ↓
[Voicing Loop]
        ↓
Voicing Sourceを選択
        ↓
BPM / Metronome / Count-in
        ↓
Start
        ↓
Current / Next / Beat
        ↓
Auto Advance
        ↓
End
        ↓
Loop Count +1
        ↓
First chord
```

---

# Required indicators

- Current chord
- Next chord
- Beat indicator
- progression position
- Loop count
- selected Voicing source/family
- pitch + degree
- keyboard visualization

全表示は単一Practice Clockから導出する。

---

# Learn / Recall

v1:

```text
Voicing表示
```

と

```text
コード名のみ
```

を切替。

採点はしない。

分からない場合は表示へ戻すだけ。

---

# Playback

- BPM
- Count-in
- Metronome
- Auto Advance
- Pause
- Resume
- Restart
- Infinite Loop
- Reference playback

進行の保存済みdurationを尊重。

```text
1 chord/bar
2 chords/bar
4 chords/bar
mixed
```

をすべて同じ4拍へ伸ばしてはいけない。

---

# Source priority / fallback

## MY mode
選択したSource/Customが存在する場合のみ使用。

存在しないのに別Voicingへ黙って切替えない。

## LESSON mode
Lesson Rule Table対応コードのみ生成。

Result states:

```text
SUPPORTED
UNSUPPORTED_RULE
GENERATION_ERROR
```

`UNSUPPORTED_RULE`と`GENERATION_ERROR`を区別する。

Unsupported時:

```text
このコードには選択中Lesson Voicingの規則がありません
```

を表示し、

- Source MIDI
- Custom
- Basic
- other explicit choice

へユーザーが切り替えられる。

Silent fallback禁止。

---

# No-scoring contract

P5.27 v1で禁止:

- pitch correctness
- inversion correctness
- timing accuracy
- velocity accuracy
- success/failure
- score
- streak
- mastery
- XP
- automatic progression based on performance

Live MIDIはmonitor/keyboard highlight用途のみ。

MIDI未接続でも開始可能。

---

# Practice history

v1:

```text
Loop count
```

はsession-local。

終了後の永続保存は不要。

保存しない:

- score
- accuracy
- note log
- raw performance
- streak
- achievement

Practice persistenceへ新しいfactual settingを追加する必要がある場合はStage00で監査する。

Vault schema/fileVersion変更は原則禁止。

---

# UI / UX skill

User-facing UI implementationでは
Emil Kowalski `skills` repoの:

```text
$emil-design-eng
```

を使用する。

Install reference:

```text
npx skills@latest add emilkowalski/skills
```

Stage00でSkill availabilityを確認。

未導入ならproduction UI implementationへ進まず報告する。

## Optional

UIを根本的に比較する必要が生じた場合のみ:

```text
$prototype
```

非自明なanimationを追加した場合のみ:

```text
$review-animations
```

を使う。

既存Loop Vault contractがSkill一般論より優先。

必須:

- existing visual language
- existing design tokens/components
- keyboard accessibility
- reduced motion
- 320px
- effective 200% scale
- no horizontal overflow
- no decorative motion overload

承認済みHTML mockをvisual directionとして使用する。

---

## Stages

## P5.27-00 — Repository / Practice Architecture / Rule Audit

No production behavior change.

Lock:

- Chord Dojo reuse seams
- current voicing engines
- Source/Custom persistence/read path
- Practice snapshot
- transport/metronome
- Live MIDI monitor
- Lesson Rule Table
- unsupported semantics
- UI navigation
- `$emil-design-eng` availability
- approved mock delta
- test/build baseline

Stop.

## P5.27-01 — Practice Domain / Clock / Snapshot

Pure/domain first.

Implement:

- immutable practice snapshot
- single practice clock
- current/next/beat/progress
- loop count
- pause/resume/restart
- count-in semantics
- deterministic timing
- no scoring state

No production UI yet.

## P5.27-02 — Voicing Resolution

Implement/reuse:

- Source MIDI
- Custom
- Basic 1–7–3
- Left-hand

Hard requirements:

- reuse existing Voicing engines where appropriate
- no duplicate Chord Dojo generator
- Lesson Rule Table
- explicit unsupported
- deterministic output
- pitch/degree facts
- 6th family contract

## P5.27-03 — UI Integration

Use `$emil-design-eng`.

Implement approved mock direction:

- navigation
- source/family selector
- Current
- Next
- Beat
- Progress
- Loop
- keyboard
- Learn/Recall
- transport controls
- reference playback

No scoring.

## P5.27-04 — Text / Vault Flow Integration

- Text save → Voicing Loop shortcut
- Progression Detail → Voicing Loop
- source validation
- detached practice snapshot
- source edits do not mutate active session
- missing/deleted source fails closed

## P5.27-05 — Hardening / Product Acceptance

- full relevant gates
- long-loop lifecycle
- UI/accessibility
- real Source/Custom
- human acceptance
- no merge/push

Expected pre-human:

`READY FOR PRODUCT ACCEPTANCE — Progression Voicing Practice`

---

# Completion

Must prove:

- no scoring
- endless loop
- manual termination
- timing correct
- Source/Custom first-class
- Basic/Left-hand first-class Lesson modes
- Lesson rules honest
- unsupported explicit
- Chord Dojo behavior unchanged
- no duplicate voicing algorithm
- no timer/audio leak
- approved visual direction retained
- accessibility PASS

---

# Next action

P5.27-00 completed at `4319387e8cb9619084659c9eb75175283e176082`.

Await explicit human authorization for P5.27-01. Do not automatically begin Stage01.
