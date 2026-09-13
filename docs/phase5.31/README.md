<!-- phase-id: 5.31 -->
# Phase 5.31 — ReChord-compatible Text Intake + Left-hand Slash-Chord Hardening

## Status

Stage00 audit; full fixture and Left-hand slash tracks blocked. See [report](reports/P5.31-00-report.md) and [live state](execution-state.json).

## Required Reading Order

1. [Safety](../../AGENTS.md)
2. [Claude entry](../../CLAUDE.md)
3. [Live state](execution-state.json)
4. [Work instructions](work-instructions.md)
5. All supplied contracts and references listed by [start prompt](00-start-prompt.md)

## Purpose

Complete this user flow with minimal manual cleanup:

```text
ReChord / other chord-score text
→ copy
→ Loop Vault Text Progression
→ deterministic parse
→ Vault save/reload
→ Voicing Loop
→ practice with the existing P5.30 UI/clock/audio path
```

This phase is intentionally **not** a new accompaniment system and **not** a generic web-page importer.

The target is a bounded compatibility layer for chord-score text, plus the known
Lesson Left-hand slash-chord gap (`Am11/B`, `Am9/C`, etc.) where an approved rule exists.

## Why now

P5.29 established canonical Text → Draft → Vault → Voicing Loop timing for
1 / 2 / 4 chord cells per 4/4 bar. P5.30 then finished the Voicing Loop polish
and expanded Text capacity. P5.31 must reuse those foundations rather than build
a second parser, clock, voicing engine, audio driver, or persistence model.

At Phase start, **Git is truth**. Audit the actual P5.30-integrated HEAD and its
phase reports before editing production code. This package does not guess the
P5.30 commit hash.

## Must deliver

1. ReChord-style score text can be pasted without manually inserting spaces
   between adjacent chord symbols in the accepted bounded grammar.
2. Existing Loop Vault Text syntax remains exact-compatible.
3. ReChord root/type whitespace such as `A m7`, `G 7`, `F M7`, `C add9` is accepted.
4. ReChord line comments (`# ...`) are ignored as comments, not parsed as chords.
5. `/` remains slash/on-chord bass syntax and is never a chord delimiter.
6. `%`, `_`, `=` receive explicit bounded semantics:
   - `%` = re-strike the previous chord,
   - `_` = rest,
   - `=` = hold the immediately preceding sounding chord without re-attack.
7. 4/4 bar cells remain bounded to 1 / 2 / 4 cells. No invented 3-cell timing.
8. The supplied 16-bar compact fixture parses with **34 chord attacks** and the
   intended 4/2/1-beat harmonic rhythm.
9. Save/reload preserves timing and Voicing Loop behavior.
10. Left-hand slash-chord handling is extended only from the existing Lesson Rule
    Table / lesson evidence. No generic jazz rule may be invented silently.
11. Unsupported results remain explicit and same-reason duplicate diagnostics are
    presented compactly.
12. P5.30 Playhead, slim timeline, card audition, reference sound, keyboard,
    transport, single clock, and no-scoring contract remain intact.

## Non-goals

- No URL scraping/fetching from ReChord.
- No lyrics/page mixed-text extraction.
- No Key/BPM/Capo import from the ReChord page UI.
- No Comping Pattern Library.
- No swing/bossa accompaniment generator.
- No scoring/mastery/XP.
- No Analyzer/chord-detection change.
- No Vault schema/fileVersion change unless Stage00 proves the requested notation
  is impossible without one. If that happens: **stop and report; do not improvise**.
- No duplicate voicing generator.
- No silent fallback for Lesson Left-hand slash chords.
- No auto merge/push/tag/release/P5.32.

## Stages

| Stage | Scope |
|---|---|
| P5.31-00 | Repository/parser/rule audit, baseline, contracts, representability gate |
| P5.31-01 | ReChord-compatible tokenizer + chord-notation normalization |
| P5.31-02 | `%` / `_` / `=` timing semantics + save/reload/Voicing Loop integration |
| P5.31-03 | Lesson Left-hand slash-chord rules + unsupported diagnostic aggregation |
| P5.31-04 | End-to-end hardening, full regressions, product-acceptance report |

Start only with **P5.31-00** unless the user explicitly authorizes running remaining stages.
