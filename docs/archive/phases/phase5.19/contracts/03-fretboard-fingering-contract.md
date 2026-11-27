<!-- phase-id: 5.19 -->
# Contract 03 — Fretboard / Fingering
Every shape exercise gets deterministic source/target string-fret positions. Consider 4/5 string, playable fret range, edge strings, equivalent positions. No false textbook shape. Semantic labels: 高音側の隣弦 / 低音側の隣弦 / 同じ弦.
## P5.19-00 contract lock

- Use the existing standard tunings: four strings `[28, 33, 38, 43]` and five strings `[23, 28, 33, 38, 43]`. Every result must respect the saved allowed fret range (within the existing 0–36 domain).
- The canonical solver enumerates only legal source/target positions. It ranks pairs by: (1) lowest absolute fret shift, (2) lowest total distance from the allowed-range midpoint, (3) fewest edge strings, then (4) stable lexical `(source string, source fret, target string, target fret)` order. The selected pair and its tie-break reason are explicit output.
- Semantic shape labels are derived from the selected physical pair only: same string, higher-string adjacent, lower-string adjacent, skipped string, same fret, and signed fret shift. Handedness changes visual direction only; it never reverses the semantic label.
- If no legal pair exists, the exercise is unavailable. The UI must not invent a textbook shape or silently change register.
