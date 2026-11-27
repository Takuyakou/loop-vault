<!-- phase-id: 5.19 -->
# Contract 02 — Motion / Objective Evidence
Direction and interval are separate. Persist first answer, direction/category/exact correctness, replay count, attempts, assistance. Never overwrite first-answer facts. Review is independent self-rating. No composite score.
## P5.19-00 contract lock

### Vocabulary and levels

- A motion is `{ direction, semitones }`, where direction is `same`, `up`, or `down`; `same` is exactly zero semitones and `up`/`down` are exactly 1–7 semitones. No octave substitution is hidden in the motion fact.
- Level 1 asks direction only. Level 2 asks the fixed broad category: `same` (0), `second` (1–2), `third` (3–4), `fourth` (5), `tritone` (6), or `fifth` (7). Level 3 asks the exact semitone value. Level 4 is a 3–4-note chain; Level 5 transfers the same signed sequence to a new start.
- The generated-source selection weights are fixed: `same: 2`, `±1: 2 each`, `±2: 3 each`, `±3: 2 each`, `±4: 2 each`, `±5: 4 each`, `±6: 1 each`, and `±7: 4 each`. The selected signed item, not a later display label, is the persisted expectation.

### Objective evidence

- The first Identify submission is immutable: expected direction/category/exact value, submitted values, direction/category/exact correctness, replay count before that answer, attempt count, and assistance classification are captured once.
- Assistance is independently classified as `independent`, `assisted`, or `revealed`. Hints or a later correct answer never overwrite first-answer facts.
- Review remains a separate self-rating. No composite score, automatic rating, or automatic Sing/Play scoring is allowed.
