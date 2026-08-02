# Loop Vault Phase 5.16.3 FINAL 作業指示書
## Bassline Echo — Generated Phrases & Vault Progression Integration

この文書をPhase 5.16.3のactive instructionとする。

前提:

- Phase 5.16.1完了
- Phase 5.16.2完了
- 共通State / Playback / Review / Repositoryを再利用
- Vaultは読み取り専用

---

## 0. 成功定義

コード進行上の1〜2小節basslineを聴き、歌い、度数とコード変化を捉え、ベースで再現し、別KeyへTransferできる。

Sources:

```text
Generated
Vault Progression
```

Source MIDI Bassは監査結果によるoptional。
不成立でも5.16.3を完了する。

---

## 1. Generated Bassline

初期progression:

```text
ii–V–I
I–vi–ii–V
minor tonic loop
simple dominant motion
pedal tone
chromatic approach
```

Difficulty:

```text
Level 1: roots
Level 2: roots + chord tones
Level 3: chord tones + simple approach
```

Constraints:

- monophonic
- 1〜2 bars
- playable range
- chord durationに従う
- slash bassを尊重
- N.C.では休符
- same seed deterministic
- unsupported chordを近似しない

---

## 2. Vault Progression Source

Flow:

```text
Saved Progression
→ read-only snapshot
→ 1〜2 bar extraction
→ Bassline Generator
→ PracticeExercise
```

Snapshot:

- progression reference ID
- key
- tempo
- meter
- chord sequence
- chord durations
- minimal source label
- generator version

保存しない:

- raw MIDI
- personal path
- original filename
- full memo
- audio

元進行削除後:

- past Attemptはsnapshotで表示
- new exercise生成はsource unavailableを明示
- 別進行へ置換しない

Vault mutation 0。

---

## 3. Source MIDI Bass Audit

Phase開始時に監査する。

確認:

- bass role logical voiceが保存後も復元可能か
- source NoteEventが保存されているか
- source asset参照が永続か
- 元ファイル削除後の挙動
- schema変更なしで1〜2小節clipを作れるか
- personal MIDI複製なしで成立するか

### 実装可能条件

すべて満たす場合だけ、第3sourceとして追加可能。

```text
Source MIDI Bass
```

条件:

- existing data only
- Vault schema unchanged
- raw file copy 0
- deterministic extraction
- provenance
- source missing handling
- privacy audit
- no Analyzer dependency change

### 不成立時

- 5.16.3を止めない
- Generated + Vault Progressionを完成
- `docs/phase5.16.3/source-midi-bass-audit.md`
- Phase 5.16.4 proposalを作成
- speculative implementation禁止

---

## 4. Learning Flow

```text
Listen:
line contour + chord change

Sing:
singing reference Auto利用可能

Think:
root movement / degree / approach

Play:
1〜2 bars

Review:
Pitch / Rhythm / Duration / Recall / Fretboard
すべて自己評価

Transfer:
same progression function in another key
```

自動Pitch / Rhythm分析は禁止。

---

## 5. Hints

```text
Hint 1: chord progression
Hint 2: contour / root movement
Hint 3: degree sequence by chord
Hint 4: note names + fretboard markers
```

Reviewではコード進行とtarget lineを対応表示する。

---

## 6. UI

Mode tabs:

```text
Degree Echo | Rhythm Echo | Bassline Echo
```

Source selector:

```text
Generated
Vault Progression
Source MIDI Bass (only if supported)
```

Main:

- progression strip
- current chord
- phrase playback
- count-in
- metronome
- Hint
- fretboard
- self review
- Transfer

Vault entry:

Progression Detailから`Bass Practice`を開始可能にしてよい。

ただし:

- MIDI export controlを壊さない
- code cards firstを維持
- Practice入口はsecondary action
- Vault一覧へ入口を乱立させない

---

## 7. Stage / PR

### P5.16.3-00 — Audit

```text
docs/p5163-00-audit
```

- Vault progression contract
- source deletion
- ChordSymbol / duration
- Source MIDI Bass feasibility
- privacy
- Progression Detail action

### P5.16.3-01 — Bassline Generator

```text
feature/p5163-01-bassline-generator
```

- progression model
- Level 1〜3
- approach rules
- slash / N.C.
- transfer
- property tests

### P5.16.3-02 — Vault Source

```text
feature/p5163-02-vault-source
```

- selector
- snapshot
- extraction
- missing source
- provenance
- read-only integration

### P5.16.3-03 — UI / History / Optional Source Bass

```text
feature/p5163-03-ui-history
```

- mode tab
- progression strip
- Review
- Home / History
- Progression Detail entry
- Source MIDI Bass only if audit PASS

### P5.16.3-04 — Release Gates

```text
test/p5163-04-release-gates
```

成果物:

```text
docs/phase5.16.3/00-audit.md
docs/phase5.16.3/source-midi-bass-audit.md
docs/phase5.16.3/01-generator-report.md
docs/phase5.16.3/02-vault-source-report.md
docs/phase5.16.3/03-ui-history.md
docs/phase5.16.3/04-runtime-memory.md
docs/phase5.16.3/05-final-report.md
```

---

## 8. Tests

### Generator

- progression vocabulary
- Level 1 / 2 / 3
- same seed
- every key
- slash bass
- N.C.
- short chord duration
- 1 / 2 bars
- approach tone
- range
- invalid chord
- source snapshot
- Transfer

### Vault

- valid source
- missing source
- deleted source
- changed source
- past Attempt display
- read-only
- no Vault mutation
- unsupported progression
- deterministic snapshot

### UI / E2E

- source selector
- Generated full flow
- Vault full flow
- progression strip
- current chord
- Hint 0〜4
- self review
- Transfer
- Progression Detail entry
- restart
- source missing
- keyboard
- viewport
- Degree / Rhythm regression

### Optional Source Bass

実装する場合のみ:

- logical voice selection
- exact note extraction
- 1〜2 bar clip
- source missing
- no raw file copy
- privacy
- deterministic
- role filtering

---

## 9. Acceptance

1. Generated Bassline完走
2. Vault Progression完走
3. read-only snapshot
4. 1〜2 bar extraction
5. Level 1〜3
6. slash bass
7. N.C.
8. Hint 0〜4
9. self review honesty
10. key Transfer
11. Home / History
12. Progression Detail入口
13. Vault mutation 0
14. schema unchanged
15. source deletion safe
16. unsupported source explicit
17. Source MIDI Bass監査完了
18. optional不成立でもPhase完了
19. Degree / Rhythm unchanged
20. Analyzer unchanged
21. MIDI Exporter unchanged
22. tests / builds PASS
23. tracked MIDI 0
24. main unmerged
25. Phase 5.17未着手

Phase内は全自動。
最終報告後に停止する。
