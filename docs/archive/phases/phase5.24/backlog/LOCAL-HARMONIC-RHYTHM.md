# Backlog — Local Harmonic Rhythm Estimation

Status: `DEFERRED — out of P5.24`

P5.24 v1 uses Global harmonic-rhythm estimation with conservative fallback.

Fixture K prevents unsafe promotion on material whose harmonic rhythm changes by section.

Consider a future Local estimator only if real use shows:
- frequent mixed harmonic rhythm
- Global often falls back
- product value is materially limited
- a privacy-safe evaluation set can validate local transitions

Do not introduce a section detector by default.

Future design should validate:
- local windowing
- confidence
- boundary hysteresis
- fallback
- no oscillation among 1/2/4/8-beat estimates
