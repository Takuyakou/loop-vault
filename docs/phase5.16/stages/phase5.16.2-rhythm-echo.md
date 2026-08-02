# Loop Vault Phase 5.16.2 FINAL 作業指示書
## Rhythm Echo — Metronome, Count-in & Rhythm Review

この文書をPhase 5.16.2のactive instructionとする。

前提:

- Phase 5.16.1完了
- Practice State Machine / Repository / Review / Historyを再利用
- Product observationがある場合はscope内で反映
- 新しいPractice Architectureを作らない

---

## 0. 成功定義

短いrhythm phraseをcount-in後に聴き、音程に頼らず再現し、自己評価し、tempoや開始位置を変えてTransferできる。

出荷:

- Rhythm Echo
- metronome
- count-in
- muted timbre
- rhythm vocabulary
- rhythm hints
- rhythm review
- rhythm history
- Home / History integration

非対象:

- automatic onset scoring
- microphone
- ghost-note detection
- Bassline Echo
- Vault source

---

## 1. Rhythm Vocabulary

初期cell:

```text
quarter
eighth
offbeat eighth
rest-start
dotted eighth + sixteenth
simple sixteenth syncopation
tied duration
anticipation
two-beat cell
one-bar cell
```

Difficulty:

```text
subdivision
restComplexity
syncopation
durationContrast
accentPattern
tempo
phraseLength
countInBars
listenLimit
```

同じseedと設定で同じevents。

---

## 2. Playback

### Timbre

- Muted Bass
- click
- optional accent click

### Metronome

- same audio clock
- tempo / meter一致
- accent downbeat
- volume設定
- M toggle
- playback終了で安全停止

### Count-in

- 1 / 2 bars
- ON / OFF
- C toggle
- start cue
- exercise attemptへ設定snapshot
- count-inをlisten countへ含めない

### Timing

- beat-based events
- triplet / sixteenth表現
- floating drift禁止
- visual playheadとaudio scheduleを同じtimelineから生成

---

## 3. Learning Flow

共通State Machineを使う。

Rhythm固有prompt:

```text
Listen:
音数・休符・開始位置

Sing:
ダッ / タ / 口唱歌で再現

Think:
subdivisionと開始位置

Play:
ミュート弦または任意の単音

Review:
Rhythm / Duration / Recall

Transfer:
tempo変更 / start-position変更 / accent変更
```

Sing Referenceのpitchは固定またはMutedでよい。
歌唱用octave設定を無理に使用しない。

---

## 4. Hints

```text
Hint 1: tempo / meter
Hint 2: start position
Hint 3: rhythm syllable / subdivision
Hint 4: full visual rhythm grid
```

Hint 4でもauto successにしない。

Visual gridはReviewまたはHint 4まで隠す。

---

## 5. Review

Self Review:

- Again / Hard / Good / Easy

Issue:

- Rhythm
- Duration
- Recall

Pitch / FretboardはRhythm Echoでは表示しないかsecondaryにする。

Next Focus例:

```text
8分裏の開始が難しいと自己評価しています。
次は単一音・80 BPMで同じcellを出題します。
```

自動onset解析をした文言は禁止。

---

## 6. UI

Phase 5.16.1のBass Practiceへmode tabsを追加。

```text
Degree Echo | Rhythm Echo
```

主表示:

- tempo
- meter
- count-in
- metronome
- listen count
- waveform / rhythm bars
- hidden grid
- primary CTA
- self review

FretboardはRhythm Echoでは縮小または非表示にできる。
代わりにRhythm Viewを主役にする。

---

## 7. Stage / PR

### P5.16.2-00 — Audit

```text
docs/p5162-00-audit
```

監査:

- 5.16.1共通contract
- playback clock
- metronome assets
- rhythm components
- History / Home
- feature flags

### P5.16.2-01 — Rhythm Domain

```text
feature/p5162-01-rhythm-domain
```

- rhythm event model
- vocabulary
- seeded generator
- difficulty
- hints
- transfer

### P5.16.2-02 — Metronome / Playback

```text
feature/p5162-02-metronome-playback
```

- click
- count-in
- timeline
- visual playhead
- safe stop

### P5.16.2-03 — UI / Review / History

```text
feature/p5162-03-ui-review-history
```

- tab
- Rhythm screen
- review
- next focus
- Home due
- History summary

### P5.16.2-04 — Release Gates

```text
test/p5162-04-release-gates
```

成果物:

```text
docs/phase5.16.2/00-audit.md
docs/phase5.16.2/01-rhythm-generator.md
docs/phase5.16.2/02-metronome-timing.md
docs/phase5.16.2/03-ui-review.md
docs/phase5.16.2/04-runtime-memory.md
docs/phase5.16.2/05-final-report.md
```

---

## 8. Tests

- every vocabulary cell
- same seed
- tempo range
- 3/4 / 4/4 / 6/8
- triplet
- count-in 1 / 2
- metronome on / off
- rapid toggle
- route leave
- no stuck click
- timing drift
- Hint 0〜4
- keyboard
- review
- transfer tempo
- transfer start position
- app restart
- mode switch
- Degree regression
- Chord Dojo regression

Property:

- event start nonnegative
- event end within phrase
- no overlap where forbidden
- same timeline audio / visual
- deterministic

---

## 9. Acceptance

1. Rhythm Echo完走
2. metronome
3. count-in
4. muted playback
5. timing deterministic
6. Hint 0〜4
7. visual grid hidden until allowed
8. self review honesty
9. tempo Transfer
10. start-position Transfer
11. Home / History
12. Degree Echo unchanged
13. Practice storage migration safe
14. microphone 0
15. auto onset score 0
16. lint / typecheck / tests PASS
17. Playwright / visual / a11y PASS
18. Web / Tauri build PASS
19. main unmerged
20. Bassline / Phase 5.17未着手

Phase内は全自動。
最終報告後に停止する。
