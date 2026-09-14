# Contract 01 — Scope / Non-goals

## In

- bounded ReChord-style score-text compatibility;
- existing Loop Vault text syntax exact regression;
- compact adjacent chord segmentation;
- root/type whitespace;
- comments;
- `%`, `_`, `=`;
- slash-bass preservation;
- chord alias normalization only where unambiguous;
- Text → Vault → Voicing Loop round-trip;
- human-approved Upper Structure + Separate Slash Bass policy using existing
  Left-hand upper-structure lesson rules (see [decision](11-human-approved-product-decisions.md));
- minimal explicit `#5` chord type/save-validation support without old-data rewrite;
- compact unsupported diagnostics.

## Out

- fetching ReChord URLs;
- scraping web pages;
- lyrics/chord-sheet extraction;
- key/BPM/capo scraping;
- arbitrary rhythmic notation;
- 3-cell bars;
- Comping Pattern Library;
- groove/swing/bossa engine;
- new scoring;
- Analyzer changes;
- wholesale chord-parser replacement;
- Vault schema/fileVersion migration without explicit new authorization.
