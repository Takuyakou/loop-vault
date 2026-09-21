# Contract 05 — Wrong-Root / Slash Score Decomposition

Explain why wrong-root min11/slash candidates beat the intended candidate. Do not modify scoring.

Where exposed, record:

```text
candidate generated?
legacy rank
legacy score
root support
quality support
pitch-class coverage
structural-bass compatibility
slash compatibility
missing/extra evidence
template matched-PC count
smoothing/context contribution
tie-break contribution
```

Do not invent unavailable score components; add read-only diagnostics only.

Differentiate:

```text
bass extraction wrong
```

from:

```text
bass extraction correct + wrong root wins + bass becomes slash bass
```

If intended candidate absent → generation failure. If present and loses → ranking/evidence failure.
