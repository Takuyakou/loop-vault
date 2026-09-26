# R05 — Loop Vault Product-surface measurement

Measurement commit: `a6e2cd7` (R04, before Product bulk evaluation). The site-only row count was frozen at 29,848 in `fde61c4` before this bulk run. The Product entry point was `parseExtendedTextProgression` on one synthetic bar per row, with version `extended-text-v1` and semantic policy `p8.8-explicit-factors-v1`. The direct `parseTextChordLabel` result was separately recorded; 22 labels are accepted only through the Text Intake normalization/tokenizer, so direct parser acceptance is not substituted for actual Text Intake acceptance.

| Product checkpoint | Rows |
|---|---:|
| Frozen current-site accepted rows | 29,848 |
| Direct Product chord parser accepts | 602 |
| Text Intake converts | 624 |
| Text Capture Preview emits notes | 624 |
| Saved text card resolves to generated audition | 624 |
| Preview / saved Vault note mismatch | 0 |
| Voicing Loop `basic-full` supported | 444 |
| Voicing Loop `UNSUPPORTED_RULE` among Text Intake-accepted | 180 |
| Supported Voicing Loop concrete notes differ from Preview | 438 / 444 |
| Harness errors | 0 |

Text Capture notes were taken from `extendedTextPlaybackNotes`; the saved-card path used `extendedTextSaveData` followed by `resolveTimelineItemVoicing`. These paths share `voiceChordForPreview` for source-free text cards, and the 624-row measured equality confirms the connection. Voicing Loop used `resolveProgressionPracticeVoicings` with the existing `basic-full` selection and no source/custom override. An unsupported rule means no Generated notes are played for that style; it is not silently treated as a matching voicing. The full per-row output is joined to the R06 matrix.

The current site's deployed scoreMaker is chord-local. Product `basic-full` can depend on sequence context because it optimizes candidate groups. Four synthetic predecessor/follower combinations for each of six required high-risk labels produced 24 comparisons; 12 changed concrete notes relative to isolation. This is a voicing/context result and does not by itself prove a semantic change.
