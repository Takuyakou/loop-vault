# Contract 03 — Compact Tokenizer

## Objective

Accept compact copy text such as:

```text
C9B7(#9,#5)
Em9Db7(#9)
Am9Am9/C
```

without corrupting chord identity.

## Required algorithm properties

- parser-backed candidate validation;
- bounded segmentation (max 4 cells/bar);
- parentheses-aware;
- slash-bass-aware;
- accidental-aware;
- deterministic;
- complete-input consumption;
- no greedy regex-only split;
- no split inside tension list;
- no split of slash bass;
- equivalent complete parses may collapse only if their normalized chord identity
  sequence is identical;
- non-equivalent multiple parses => ambiguity error.

Error example:

```text
この小節を一意に解釈できません。
コード間に空白を入れてください。
```

Performance must be bounded with memoization/caching; do not create exponential
search on the full Text capacity.
