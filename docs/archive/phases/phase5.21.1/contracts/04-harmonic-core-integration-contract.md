<!-- phase-id: 5.21.1 -->

# Contract 04 — Harmonic Core Integration

Only the opt-in `Harmonic Core` preset may consume a note-level multiplier.

## Locked integration

`finalContribution = existingVoiceContribution × noteContributionMultiplier`

- `harmonic`: `1.0`
- `uncertain`: `0.9`
- `melody-like`: `0.25`

Every multiplier is strictly greater than zero. No note or event is deleted, shortened, moved, hidden, or rewritten.

Eligible Voice roles are exactly `harmony`, `pad`, and `mixed`. Bass and percussion are excluded. A pure melody Voice remains on its existing Voice-level attenuation and is not boosted by note-level weighting.

## Repository seam

The future Stage03 seam is inside `buildVoiceAwarePitchProfile` after existing `noteFeatures`/overlap `baseWeight` calculation and before root/bass/quality/tension evidence accumulation. The multiplier may be derived only from pre-chord local texture evidence.

The following remain unchanged:

- normalized/raw/display notes and persistence
- ornament extraction and segment boundaries
- chord templates, candidate generation, winner selection, and scoring formulas
- Role v2 and authoritative non-drum manual Voice overrides
- default, Auto, accompaniment-only, and custom paths

The Harmonic Core caller must opt in explicitly. When the preset is absent or not Harmonic Core, the legacy evidence path must remain exact.
