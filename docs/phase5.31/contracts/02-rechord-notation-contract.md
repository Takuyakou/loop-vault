# Contract 02 — ReChord Notation Compatibility

Observed current official ReChord score examples establish:

- `|` separates measures;
- a line beginning with `#` is a memo/comment;
- `%` means repeat/re-strike;
- `_` means rest;
- `=` means extend the previous chord;
- `/` specifies on-chord/slash-bass lowest note;
- chord root and type may contain whitespace: `A m7`, `G 7`, `F M7`, `C add9`.

P5.31 accepts this bounded notation while retaining Loop Vault's existing syntax.

Important: this is a compatibility subset, not a promise to clone every ReChord
parser behavior. Ambiguous or unsupported text fails closed with a location and
repair hint.
