# Contract 04 — Canonical Explicit Notation

## Canonicality

Equivalent identity descriptors must format to one deterministic canonical symbol.

## Explicitness

Do not use ambiguous `alt` as the canonical analyzer output for newly supported
altered identities. Prefer explicit alterations/omissions actually represented.

## Stable ordering

Audit current repo style, then freeze a deterministic ordering for extensions,
alterations, omissions, and slash bass.

## Round-trip

Where parser/text intake supports the new identity:

```text
identity -> canonical symbol -> parser -> canonical identity
```

must round-trip.

If the existing parser cannot safely support a new symbol during shadow stages,
classify that separately and do not pretend representability is production-ready.

## Backward compatibility

Existing supported canonical symbols must remain byte/canonical-equivalent unless
an existing confirmed notation bug is explicitly in scope and separately gated.
