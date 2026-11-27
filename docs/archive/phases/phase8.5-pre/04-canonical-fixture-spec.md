# P8.5-PRE-03 — Canonical fixture freeze

`extended-v1-canonical-v1.json` contains 98 authored synthetic cases. They were written from a feature inventory, not copied from songs and not generated from a product parser's predictions. The frozen split is 71 positive, 22 negative, 2 ambiguous, and 3 empty/idle. Expected outcomes are a forward contract for Phase 8.5; some positive cases require a future shared semantic parser and are not claims about the current product.

## Record contract

Each case has `fixtureId`, `category`, `disposition`, `rawText`, `inputMetadata`, `expectedTokens`, `expectedBars`, `expectedEvents`, `expectedSections`, `expectedMetadata`, `expectedDiagnostics`, `expectedNormalizedMeaning`, and `sourceFeatureIds`. `expectedBars` preserves ordered lexical slots. `expectedEvents` describes each slot with one-based bar/slot/beat, duration, kind (`attack`, `reattack`, `hold`, `rest`), and normalized chord when sounding. `expectedNormalizedMeaning` is an independent, compact sequence assertion. Comments and range markers are in `expectedSections` and never silently become chords. `inputMetadata` is out-of-band; `expectedMetadata` is the canonical result. Source spans are tested by the property contract rather than duplicated as hand-maintained offsets in 98 cases.

`expectedDiagnostics` lists **required** stable diagnostic codes, allowing an implementation to emit an additional more specific actionable issue. A positive case must have no ERROR or unresolved ambiguity. A negative case must fail conversion. An ambiguous case must request disambiguation without guessing. An empty case must remain `EMPTY`/`IDLE`, without an error. A lexical positive that cannot retain its correct chord meaning is represented as a negative `SEMANTIC_GAP` pending Phase 8.5 implementation.

## Coverage and limits

The corpus covers simple chords, bars, multi-event bars, compact adjacency, root/type spacing, slash bass, repeat, rest, sustain, comments, metadata, key, BPM, capo, Unicode, complex chords, alterations, omissions, headers/markers, malformed input, ambiguity, empty, and whitespace-only input. Bar timing is explicit for the authored selected meter. Three-slot 4/4 timing is intentionally a diagnostic until an exact supported rhythm policy is chosen.

All fixture text is synthetic and short. `extended-v1-canonical-v1` is frozen at PRE completion. If a fixture expectation proves wrong, add an erratum with before/after values, reason, and a new fixture version. Do not silently rewrite expected output to match a parser under development. The canonical JSON digest is recorded in the manifest and validated by the research-only script.
