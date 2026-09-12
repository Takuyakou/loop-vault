# P5.27 Design Review — Integrated v0.2

## Adopted

### 1. Separate mode/session model
採用。

決定的理由はTermination Contract。

Chord Dojoは達成ベース。
Voicing Loopはuser-stopベース。

### 2. Source MIDI / Custom → Must
強く採用。

作曲目的では「実際に好きな響き」を覚えることが中心価値。

### 3. Basic / Left-hand
Must維持。

ただしSource/Customのfallbackではない。

分類:

```text
MY VOICINGS
- Source MIDI
- Custom

LESSON
- Basic 1–7–3
- Left-hand
```

目的が違うため並列に扱う。

### 4. 6th family
採用。

`1-7-3`を無理に適用しない。
Lesson Rule Tableで明示する。

### 5. Left-hand rule table
全面採用。

一般論で未定義Chord Familyを補完しない。

`UNSUPPORTED_RULE` と `GENERATION_ERROR` を分離。

### 6. Open Voicing
P5.27 v1から延期。

Top Note / Melody contractが必要。

### 7. History
最小化。

Loop countはsession fact。
score/streak/mastery等は導入しない。

## Explicitly ignored

P5.19.1 prerequisite discussion is excluded by user decision.

P5.27 Stage00 may still audit existing shared Practice components,
but P5.19.1 completion is not a prerequisite or dependency gate.
