# P8.5-PRE-02 — Neutral extended-v1 syntax contract

Status: research specification, not a production parser. Product labels are **通常** (`standard-v1`) and **拡張** (`extended-v1`). Both dialects must use one chord-symbol lexer and semantic parser. The extended layer owns only document structure, control events, and metadata adaptation.

## Document and source model

Keep the exact pasted UTF-16 text, line endings, and a lossless mapping from normalized tokens to source spans. Structural parsing produces bars, optional comments and playback markers, events, diagnostics, and separately supplied metadata. A token must be accounted for as a parsed event, explicit nonmusical structure, or diagnostic. Unknown text must not disappear. Preserve raw spelling beside normalized meaning. Current Vault v2 does not retain the original text; persistence design is deferred, with no schema change in PRE.

Editor state is `EMPTY` when input has no nonwhitespace content, `IDLE` before parse, `VALID`, `INVALID`, or `AMBIGUOUS`. Empty input is not an error. Conversion is enabled only for a fully resolved, bounded, semantically valid document.

## Lexical rules

| Form | Extended-v1 meaning | Boundary / failure rule |
| --- | --- | --- |
| `|` and confirmed full-width pipe variants | bar boundary | Leading/trailing delimiter may frame bars. Repeated delimiters must not silently remove an intended empty bar. |
| One or more absolute chord labels | one event per label | Compact input accepted only when the entire span has one semantic segmentation. |
| `%` | new attack using preceding chord identity | Error without preceding identity. It is not a previous-bar macro. |
| `_`, `N.C.` | explicit silent slot | No chord identity; no sound. Preserve original spelling. |
| `=` | extend the immediately sounding event | Error after silence or without predecessor. No new attack. |
| Leading `#` comment line | nonmusical text | Preserve line and source positions; `#` inside a chord alteration remains part of that chord. |
| Slash or confirmed `on` bass form | chord bass pitch class | Slash within `6/9` is quality syntax. Disallow malformed or conflicting bass suffix. |
| `<`, `>` at line-leading marker position | optional playback-range markers | Retain the full score; do not trim content to playback range or interpret as section names. |
| Bracketed/label-like section header | unsupported until confirmed | Diagnostic; retain raw text. |

Whitespace between chords separates events; whitespace between a root and a quality may belong to one chord only when the full line has a unique parse. Tabs, full-width spaces, LF, CRLF, leading/trailing spaces, and blank lines require source-preserving tests. Normalize only enumerated accidental and quality aliases, retaining raw text. Glyph shape alone does not establish musical equivalence. Controls adjacent to chords are split only through a complete unambiguous parse.

## Bar/event timing

The document has explicit bar boundaries. A bar with N slots in the selected meter is subdivided only if N divides the bar's supported rhythmic grid and can be represented exactly. `=`, `%`, and rests consume slots. Never silently truncate events beyond a fixed event budget or map an unsupported meter to 4/4. The Phase 8.5 implementation must choose and document supported meters, subdivisions, and budgets before allowing save. Until then, `extended-v1` may reject structures it can read lexically but cannot time exactly. Standard-v1 keeps its existing 4/4, 1/2/4 token contract.

## Metadata

Key, BPM, beat/meter, and capo are explicit fields outside score text in the confirmed external model. A parser may combine those supplied values with score text but must record provenance. Inline directives such as `BPM: 90` are **not** confirmed extended-v1 syntax and receive a diagnostic. Key is user-confirmed or unknown, never inferred as a fact. Capo changes sounding pitch only by an explicit playback rule; it must not mutate the written chord identity. Meter affects event timing and must not be invented from delimiters.

## Diagnostics

Each issue has `severity` (`ERROR`, `WARNING`, `INFO`), stable `code`, localized `message`, UTF-16 `span` (`start`, `end`), derived one-based `line` and `column`, and `rawToken` when applicable. An issue may additionally carry bar/event identifiers and a suggested action. ERROR blocks conversion; AMBIGUOUS blocks conversion even if presented as WARNING until the user resolves it. INFO may suggest a dialect without changing it. Normalization and raw-to-normalized span mapping are testable; diagnostics must point into the original pasted input.

Required diagnostic families: invalid chord, ambiguous segmentation, unsupported semantics, invalid control predecessor, malformed slash, empty interior bar, unsupported header/directive, unsupported meter/rhythm, duplicate marker, input/resource limit, and unrecognized Unicode punctuation. Negative cases should identify the smallest actionable source span.

## Dialect hint, not automatic switch

In standard-v1, a confirmed extended-only marker, Unicode bar separator, `N.C.`, or section-like line can show `拡張記法の形式に見えます` with an explicit `拡張で読む` action. `%`, `_`, `=`, `|`, slash bass, compact labels, and comments already overlap with standard-v1 and are insufficient alone to recommend switching. The hint must never rewrite input, alter the dialect, or save partial content.

## Deliberately unresolved

Arbitrary headers, inline metadata, nested parentheses, arbitrary dash aliases, malformed tolerant input, and an exact external playback-range rule are not silently accepted. Accepted chord spellings are limited by the shared semantic parser; lexical recognition without correct intervals is `SEMANTIC_GAP`.
