<!-- phase-id: 5.19 -->
# Contract 04 — Generator / Vault Source
Generated source is weighted deterministic and playable. Vault root classes do not encode octave direction; create deterministic performance pitches and label as Vault由来のルート経路, never original bassline. P5.18.2 live title is picker-only.
## P5.19-00 contract lock

- Generated output is deterministic from a versioned seed, fixed configuration, and bounded retry count (maximum 32). It must not use ambient randomness and must return explicit unavailability when no legal result exists.
- A Vault source supplies safe chord-root pitch classes, not an original bassline and not an octave direction. The source title remains picker-only and never crosses into exercise or History persistence.
- Root-path placement policy v1: choose a legal starting root using the canonical fingering rank; for each following pitch class calculate `d = (next - current + 12) mod 12`, then use `d` for 0–6 and `d - 12` for 7–11. Thus the deterministic signed vocabulary is `0..+6` and `-5..-1`; a tritone is represented as upward six. Select only a legal pitch that realizes that exact signed delta. If the full path is not legal, return unavailable; do not substitute an octave or claim an original bassline.
- UI wording is “Vault-derived root path” (or the localized equivalent), never “original bassline.”
