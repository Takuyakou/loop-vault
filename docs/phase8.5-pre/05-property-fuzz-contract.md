# P8.5-PRE-04 — Seeded property and fuzz contract

The 98 canonical cases remain fixed. Mutated cases are generated in memory from a fixed seed at test time and are never committed as a large static corpus. `scripts/phase85-pre/generate-mutations.mjs` is a research-only deterministic generator. Phase 8.5 will connect its output to the new parser and publish the seed, mutation count, and failure shrink path in each result.

## Runtime mutations

Use a stable PRNG and a bounded case budget. Mutations include spaces, tabs, LF/CRLF changes, selected Unicode substitutions, duplicate/missing delimiters, repeated control tokens, leading/trailing whitespace, empty sections, unexpected punctuation, unknown tokens, very long lines, and very long chord symbols. Preserve a pointer to the originating canonical fixture and the mutation name. Do not assume that every mutation preserves musical meaning: classify it as meaning-preserving or potentially invalid before asserting semantic equivalence.

## Properties

1. No crash, uncaught exception, hang, or unbounded memory growth within documented input limits. Over-limit input fails promptly with a resource diagnostic.
2. No silent token, chord, bar, comment, or metadata loss. Every source span is accounted for by a parsed element or diagnostic.
3. Original raw source bytes/code units survive parse, preview, Draft creation, and any proposed persistence round trip. Normalized text is additional data, not a replacement.
4. Every diagnostic span lies within the original UTF-16 input and its line/column points to the same span under LF and CRLF.
5. Fixed seed, fixture version, and code commit produce identical mutated cases, outcomes, and diagnostic order.
6. Meaning-preserving mutations yield the same normalized event timeline; potentially invalid mutations either resolve unambiguously or produce an actionable diagnostic. They must never silently reinterpret a malformed chord.
7. Conversion is atomic: an error or unresolved ambiguity cannot save a subset of events.

## Reproducibility and failure handling

Default seed `0x85a501`, 200 generated cases per run, bounded input length with separate over-limit stress cases. Log only fixture ID, mutation ID, seed, minimized synthetic input, and parser result for a failure. A reducer may remove bars/tokens while preserving the failing property. Add only stable, human-reviewed minimized bugs to the next canonical fixture version through an erratum. Do not tune the frozen canonical expected results to match parser output.
