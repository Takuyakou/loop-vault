# P8.5-PRE-01 — Syntax delta and saturation

Research date: 2026-09-25. Source-specific URLs, revisions, public score material, and extraction notes are in ignored local research storage. No score text or external parser implementation is reproduced here.

## Method and evidence levels

The previous text-input contract was compared with a current official input sample, a current public source revision, its tests and release notes, an author article (historical context only), and 140 public user scores sampled as seven independent pages of twenty. Public-example counters are screening heuristics; a family is **CONFIRMED** only after checking the official sample or current source. A public score's notation is evidence of use, not proof that its playback succeeds. Metadata fields were recorded as independent controls, not score-text directives.

Queries and source reading were divided into basic syntax, complex/altered symbols, slash bass, compact input, comments/markers, metadata, Unicode, legacy, malformed, and whitespace variants. Public scores were used only to find structural patterns and usage frequencies. The raw material remains local-only.

## Confirmed syntax families (18)

| ID | Family | Evidence | Extended-v1 disposition |
| --- | --- | --- | --- |
| S01 | ASCII bar delimiter | official + source + examples | accept |
| S02 | full-width/letter-like bar delimiter | source + examples | accept only explicitly enumerated glyphs; warn on confusable text |
| S03 | re-attack previous chord | official + source + examples | accept with predecessor |
| S04 | rest/stop controls (`_`, `N.C.`) | official/source + examples | accept as silence, preserve spelling |
| S05 | continuation control | official + source + examples | accept with sounding predecessor |
| S06 | line-leading comment | official + source + examples | retain raw text; no music event |
| S07 | slash bass | official + source + examples | accept as semantic bass, distinguish `6/9` |
| S08 | `on`/full-width slash bass spelling | source + examples | alias only when unambiguous |
| S09 | compact adjacent chord symbols | official + source + examples | parse only unique full segmentation |
| S10 | internal root/type whitespace | official + source + examples | normalize only within one chord |
| S11 | ASCII and selected Unicode accidentals | source + examples | explicit normalization and source mapping |
| S12 | symbolic quality glyphs | source + examples | verify semantics before save |
| S13 | altered/parenthesized tensions | source + examples | verify each alteration independently |
| S14 | omit/no tone modifiers | source + examples | semantic gap until represented faithfully |
| S15 | leading/trailing and repeated delimiters | source + examples | define empty-bar behavior, no silent bar loss |
| S16 | blank lines and line breaks | source + examples | preserve text and bar order |
| S17 | start/end playback markers | source/release notes | recognize but do not silently trim pasted content |
| S18 | key, beat, BPM, capo as separate metadata | current UI/source | capture explicitly; no invented inline syntax |

`N.C.`/`on` and repeated delimiters occurred in public samples despite being absent from the official sample text. No family was established **solely** from a public example without source corroboration. Full-width spaces, compact adjacency, leading/trailing pipes, and repeated pipes were observed as structural variants; the detection counts are approximate.

## Public sample screening

Across 140 public scores, the screening script found ASCII pipes in 127, slash-like bass patterns in 92, continuation controls in 80, line-leading comments in 59, repeat controls in 27, underscore rests in 25, Unicode accidental forms in 18, half-diminished glyphs in 6, `N.C.` in 3, and `on` bass in 3. These are per-score occurrence counts and can overlap. Metadata beat/BPM/capo fields were present in all 140 records; their actual values were not promoted into a syntax rule. The compact-adjacency detector reported 79, but it may flag other letter transitions, so this number is not a validated parse rate.

## Pass ledger and saturation

| Pass | Independent material | New syntax families | New chord families | New structural patterns | New whitespace patterns | New metadata patterns |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | current official sample, current source, tests/release history | 18 | 18 | 10 | 5 | 4 |
| 2 | public scores 1–60 | 0 | 0 | 3 | 1 | 0 |
| 3 | public scores 61–80 | 0 | 0 | 2 | 0 | 0 |
| 4 | public scores 81–100 | 0 | 0 | 0 | 0 | 0 |
| 5 | public scores 101–120 | 0 | 0 | 0 | 0 | 0 |
| 6 | public scores 121–140 and legacy comparison | 0 | 0 | 0 | 0 | 0 |

**SATURATION_REACHED for the enumerated syntax/structure inventory:** passes 4 and 5 had zero new syntax and structural families; pass 6 was an additional check. This is a bounded research claim, not proof that every public score is supported. The sample is sorted by update time and may not represent older or less visible material.

## Unknown, ambiguous, and version-dependent

| ID | Classification | Reason / required handling |
| --- | --- | --- |
| U01 | AMBIGUOUS | Adjacent labels with multiple valid segmentations: diagnostic and explicit separator request. |
| U02 | AMBIGUOUS | A space can be internal to a chord or separate events; use complete parse, never first-match guessing. |
| U03 | VERSION_DEPENDENT | Historical editor whitespace removal differs from current paste behavior; preserve input and test current app before promising normalization. |
| U04 | UNKNOWN | Inline key/BPM/capo/meter directives have no confirmed grammar; do not reinterpret arbitrary text. |
| U05 | SOURCE_CONFLICT | Historical local grammar contract rejects `%`, while current product code accepts it; current code is authoritative for standard-v1. |
| U06 | UNKNOWN | Duplicate/empty delimiter intent, especially at line boundaries; retain explicit empty-bar diagnostic unless a documented structural rule applies. |
| U07 | AMBIGUOUS | Visually similar Unicode punctuation and dash variants are not automatically equivalent. |

No unrecognized token, bar, comment, or metadata may be silently discarded. A known external lexical form with unsupported musical semantics is a semantic gap, not a successful chord import.
