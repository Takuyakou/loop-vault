# Contract 04 — Harmonic Activity

Use `MidiProgressionAnalysis.fullTimeline` only. No raw MIDI, Analyzer pass, candidate score/confidence/quality, recommendation, or section detector.

For each bar, sum clipped timeline-event overlap beats, divide by beats-per-bar, and clamp to [0,1]. Ignore non-finite/non-positive events. Bucket deterministically: inactive 0; low (0,.25]; medium (.25,.75]; high (.75,1].

Render a thin non-interactive activity strip below candidate bars. Candidate bars remain primary. Exact lane names: JA `和声活動`; EN `Harmonic activity`. Exact terms: JA `活動なし / 低 / 中 / 高`; EN `inactive / low / medium / high`. Exact segment ARIA: JA `和声活動: Bar <bar>、強度 <term>`; EN `Harmonic activity: Bar <bar>, intensity <term>`. Never say quality, accuracy, or recommendation.
