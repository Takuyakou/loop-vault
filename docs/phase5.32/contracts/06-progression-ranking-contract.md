# Contract 06 — Progression-aware Ranking

Ranking considers progression context.

Allowed score components:
- guide/family prior deviation;
- spacing-fit heuristic;
- same pitch/same finger continuity bonus;
- same pitch/different finger small cost;
- same finger movement distance;
- stable deterministic tie-break.

Common pitch does not require same finger.

Voicing Loop is cyclic: last→first transition participates.
Use bounded DP, not greedy-only ranking.
