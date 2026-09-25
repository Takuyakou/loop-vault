# P8.5-PRE-05 — Chord semantics compatibility

Thirty authored chord labels were traced through the current `parseChordLabel` → factorized identity → pitch classes and bass → `generated-close` / shell / open / rootless voicing plan → left/right hand output. The public reference translator was separately exercised on the same labels. This is a synthetic compatibility audit, not a claim that any user score has a particular note set.

The current product parsed and factorized 26/30. All 26 produced a generated-close voicing with both hand arrays; shell and open each produced 26, rootless 14. The public reference translator returned a voicing for 29/30; the one failure was `Bb6/9`, whose lexical-looking form did not yield external playback notes. Among 25 labels both sides could represent, pitch-class sets matched in 22 and bass pitch class in 25. Three pitch-class disagreements were found in `11`, `13`, and combined altered-dominant cases. Product/reference exact concrete notes are reported separately.

## Family matrix

| Family | Representative authored form | Current root / quality / extension / bass | Generated + hands | Contract status |
| --- | --- | --- | --- | --- |
| Major/minor triad | `C`, `Am` | correct triad and root | yes | compatible |
| Dominant 7 | `G7` | seventh represented | yes | compatible |
| Major 7 aliases | `Fmaj7`, `AbM9`, triangle aliases after lexical normalization | major seventh / ninth represented | yes after normalization | lexical alias work |
| Minor 7 | `Dm7` | minor seventh | yes | compatible |
| Minor-major 7 | `AbmMaj7` | not parsed | no | **SEMANTIC_GAP** |
| Half diminished | `Bm7b5`, `F#ø` after lexical normalization | diminished triad + minor seventh | yes after normalization | compatible if glyph maps exactly |
| Diminished/dim7 | `Fdim7` | diminished seventh | yes | compatible |
| Augmented | `Eaug` | augmented fifth | yes | compatible |
| Suspended | `Csus4`, `G7sus4` | suspension represented | yes | compatible |
| Added tones | `Dadd9`, `Cadd13` | add9 yes; add13 not parsed | partial | **SEMANTIC_GAP** for add13 |
| Six / six-nine | `E6`, `Bb6/9` | sixth and 6/9 distinguished from bass slash | product yes; external 6/9 failed | **SOURCE_CONFLICT** for 6/9 playback |
| Ninth | `A9`, `Dm9` | 9th quality represented | yes | compatible for sampled forms |
| Eleventh | `D11` | parsed as triad with 11th, omitting 7th/9th | yes but wrong reference meaning | **REFERENCE_SEMANTIC_MISMATCH** |
| Thirteenth | `G13` | product omits 11th while reference includes it | yes but different pitch classes | **REFERENCE_SEMANTIC_MISMATCH**; accepted musical convention to decide |
| Single alterations | `G7(b9)`, `G7(#11)`, `G7(b13)` | sampled alterations represented | yes | compatible for sampled forms |
| Multiple alterations | `G7(b9,#11,b13)` | both parse, reference/product pitch-class sets differ | yes but different meaning | **REFERENCE_SEMANTIC_MISMATCH** |
| Omit / power chord | `Aomit3`, `C5` | not parsed | no | **SEMANTIC_GAP** |
| Slash / alternate bass | `C/E`, `E7/G#`, selected `on` aliases | bass pitch class represented; `6/9` protected | yes after lexical normalization | compatible bass semantics; exact register policy differs |

Current `ChordQuality` and `Tension` are closed vocabularies. A label that lexically resembles a chord but cannot be represented exactly must yield `SEMANTIC_GAP`; it cannot be coerced into a nearby quality. The reference translator's intervals are behavioral evidence, not an unquestionable theory oracle. The Phase 8.5 accepted-equivalence policy must adjudicate 11th/13th omission conventions before importing them as equivalent.

## Path-specific risks

- `src/domain/chords.ts` accepts only selected quality spellings and one parenthesized tension group; unsupported omit, mMaj7, add13, power-chord semantics cannot be modeled by the current `ChordSymbol` without extension.
- `src/domain/chordFactorization.ts` factorizes parsed labels but cannot repair an unparsed label. Its presence does not imply production use of a full HarmonicIdentity model.
- `src/domain/chordVoicing.ts` generates pitch classes and a preview register from the parsed symbol. A parse success can still carry a reference semantic mismatch.
- `src/domain/voicingPractice/optimizeProgression.ts` provides generated hand assignments only for representable chords; success must be verified at this final step, not inferred from token acceptance.
- `src/domain/textProgressionDraft.ts` saves canonical events, so a wrong or approximated identity would be persisted. Conversion must fail before Draft creation when meaning is unresolved.

The research-only local audit records each synthetic label's root, quality, tensions, bass, pitch classes, generated profiles, and hand arrays. No external song or raw external implementation appears in this report.
