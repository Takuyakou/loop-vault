# Loop Vault Phase 7 — Required Experiment Matrix

## 1. Role × Boundary Oracle

| Boundary | Role | Required |
|---|---|---|
| Product | Product | Yes |
| Gold | Product | Yes |
| Product | Gold | Yes |
| Gold | Gold | Yes |

Run on:
- clean/chord-focused synthetic
- melody-containing Harmony Support Gold or equivalent

---

## 2. Copy Baselines

| ID | Boundary | Note source | Chord inference |
|---|---|---|---|
| Copy-Oracle | Gold | Gold target notes | None |
| Copy-Simple | Frozen simple heuristic | source target notes | None |
| Copy-ProductBoundary | Current product | source target notes | None |

---

## 3. Identity × Decoder

At minimum:

| Identity | Decoder | Required |
|---|---|---|
| old | old | Yes |
| new/factorized | old | Yes |
| old | C1 | Yes |
| old | C2 | Yes if C2 exists |
| new/factorized | C1 | Yes regardless of isolated score |
| new/factorized | C2 | Yes if C2 exists regardless of isolated score |

---

## 4. Temporal categories

Every shortlisted configuration must report:
- ordinary sustained chord
- repeated chord
- arpeggio same voicing
- voicing-only change
- single passing note
- neighbor/appoggiatura
- 1-beat passing chord
- half-beat passing chord
- bass-only change
- pedal point
- sustain residual
- syncopated/offbeat change

---

## 5. Long-tail harmony categories

Where corpus support exists:
- rootless
- slash/inversion
- sus2/add9 ambiguity
- sus4/7sus4 ambiguity
- altered dominant
- multiple alterations
- omissions/no5/no3
- 6 / 6-9 family
- extensions 9/11/13
- dense neo-soul/jazz voicing

---

## 6. Tournament result table

For every config record:
- Tier1 exact
- Tier1 note F1
- voicing-boundary F1
- harmonic-boundary F1
- passing-chord preservation
- melody leak
- harmony false-removal
- candidate recall@K
- Top1 / Top3
- correction-cost vector
- runtime
- peak memory
- determinism
- regression flags

Do not rank by one column only.
