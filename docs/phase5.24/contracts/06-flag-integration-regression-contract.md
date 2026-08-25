# Contract 06 — Flag Integration / Regression

Feature flag default OFF.

OFF:
- exact/deep-equal legacy behavior for affected outputs

ON:
- Harmonic State input changes
- downstream chord labels, boundaries and candidates may intentionally change

Protected implementation:
- no chord vocabulary rewrite
- no scoring formula rewrite
- no candidate-ranking formula rewrite
- no raw/display MIDI mutation
- no Vault schema/fileVersion change
- defaultAnalyzerMode unchanged

Rollback must remain local and explicit.
