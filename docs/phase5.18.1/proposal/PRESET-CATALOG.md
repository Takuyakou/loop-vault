<!-- phase-id: 5.18.1 -->

# Proposed Bassline Echo Preset Catalog

## Catalog rule

最低8つの異なる学習役割を持つ。

現在の既定進行は必ず維持する。

- 既存進行が下記の1つと同一なら、その既存IDを維持して統合する。
- 同一でなければ `Existing Default / Classic` として追加保持する。
- したがって最終件数は8または9以上になり得る。

コードは degree-based / data-driven に保持し、キー変更可能にする。
実際の型・quality token・duration token は audit 後に現在の domain へ合わせる。

---

## Foundation

### 1. Fourth–Fifth Foundation

- Formula: `I | IV | V | I`
- Example: `G | C | D | G`
- Default tonal center: G major
- Default BPM candidate: 88
- Purpose:
  - 4度上行
  - 5度上行 / 4度下行
  - tonic return
- Section: 4 bars

### 2. Pop Four Chords

- Formula: `I | V | vi | IV`
- Example: `C | G | Am | F`
- Default tonal center: C major
- Default BPM candidate: 92
- Purpose:
  - popular-music root movement
  - major/minor change
  - loop continuity
- Section: 4 bars

### 3. Minor Descent

- Formula: `i | ♭VII | ♭VI | V7`
- Example: `Am | G | F | E7`
- Default tonal center: A minor
- Default BPM candidate: 82
- Purpose:
  - descending whole steps
  - dominant semitone resolution
  - minor-key center
- Section: 4 bars

---

## Functional

### 4. Turnaround

- Formula: `Imaj7 | vi7 | ii7 | V7`
- Example: `Cmaj7 | Am7 | Dm7 | G7`
- Default tonal center: C major
- Default BPM candidate: 88
- Purpose:
  - functional cycle
  - 3rd/6th/2nd/5th roots
  - preparation for jazz/pop harmony
- Section: 4 bars

### 5. ii–V–I

- Formula: `ii7 | V7 | Imaj7 | Imaj7`
- Example: `Dm7 | G7 | Cmaj7 | Cmaj7`
- Default tonal center: C major
- Default BPM candidate: 84
- Purpose:
  - dominant resolution
  - phrase closure
  - root approach
- Section: 4 bars

### 6. Modal Rock

- Formula: `I | ♭VII | IV | I`
- Example: `E | D | A | E`
- Default tonal center: E
- Default BPM candidate: 100
- Purpose:
  - borrowed flat seventh
  - rock/modal root motion
  - repeated tonic return
- Section: 4 bars

---

## Practical

### 7. Descending Bass

- Formula:
  `I | V/7 | vi | iii/5 | IV | I/3 | ii7 | V7`
- Example:
  `C | G/B | Am | Em/G | F | C/E | Dm7 | G7`
- Default tonal center: C major
- Default BPM candidate: 80
- Purpose:
  - slash bass
  - stepwise descending bass
  - longer phrase memory
- Sections:
  - full 8 bars if current contract supports it
  - otherwise `Bars 1–4` and `Bars 5–8`

### 8. 12-Bar Blues

- Formula:
  `I7 | I7 | I7 | I7 |
   IV7 | IV7 | I7 | I7 |
   V7 | IV7 | I7 | V7`
- Example tonal center: A blues
- Default BPM candidate: 96
- Purpose:
  - form memory
  - tonic / subdominant / dominant
  - repeated bars and turnaround
- Sections:
  - full 12 bars only if safe
  - otherwise `Bars 1–4`, `Bars 5–8`, `Bars 9–12`

---

## Representability policy

P5.18.1-00 must validate every formula against:

- chord parser vocabulary
- canonical identity
- Bassline generator
- P5.18 chord accompaniment
- section schema
- History serialization

If a candidate is not exactly representable:

1. Do not silently simplify it.
2. Record the unsupported token / identity.
3. Propose the smallest semantically faithful alternative.
4. Stop before implementation for approval.
