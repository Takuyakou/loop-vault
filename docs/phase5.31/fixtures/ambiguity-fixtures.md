# Ambiguity fixtures

The tokenizer must not select a parse just because the first valid prefix is found.

Create automated ambiguity fixtures from the actual repository parser during
P5.31-00/01. Required categories:

- root accidental adjacent to a possible new root;
- slash bass adjacent to a new chord;
- tension parentheses followed by a root;
- whitespace that may be inside a chord type or between chords;
- aliases where two complete segmentations are syntactically valid.

If multiple complete parses produce different normalized chord-identity
sequences, return `ambiguous-compact-progression` and a repair hint.
