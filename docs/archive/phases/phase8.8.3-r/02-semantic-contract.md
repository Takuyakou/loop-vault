# R03 — independent chord-symbol semantic contract

Policy ID: `p8.8.3-r-literal-degree-v1`. This is an audit policy, not a Product parser change or an assertion that the external site is music-theory authority.

## Pitch-class and degree rules

- Compare tones by pitch class modulo 12, but retain written spelling, degree, and accidental separately. Enharmonic equivalence alone does not make two written factors equivalent.
- The root is required unless `omit1`/`no1` is written. An explicit slash bass is required as the lowest audition note and may duplicate or differ from the chord root.
- For unaltered major/minor/diminished/augmented chords, the third identifies quality and is required. A suspended second or fourth replaces the third and is required. Power chords require root and fifth, with no third implied.
- The unaltered fifth is optional in seventh and extended chords. In a simple triad, it is required unless explicitly omitted. `#5` or `b5` replaces natural fifth; the written altered fifth is required. A written `omit5` removes the fifth.
- Written seventh quality (`7`, `M7`, `dim7`) is required. In `9`, `11`, and `13` families, the seventh is required by the chosen policy. An added ninth, eleventh, or thirteenth named in the label is required. An unwritten ninth in an eleventh or thirteenth family is optional.
- `m11` requires minor third, minor seventh, and eleventh; fifth and ninth are optional. Dominant `13` requires major third, minor seventh, and thirteenth; natural eleventh is **optional**, not silently required. This deliberately separates a familiar optional-11 policy from the external site's complete stacked-third vector.
- An explicit `#9`, `b9`, `#11`, `b11`, `#13`, or `b13` is a required written degree. For a single altered degree, its unaltered version is prohibited unless it is separately and explicitly written. An explicit `omit`/`no` removes that degree, taking precedence over an implicit family tone.
- When a label writes two different alterations of the **same** degree (for example `b9,#9` or `#5,b5`), both written pitch classes are required by this literal policy; the later token may not silently erase the earlier one. If the two spellings resolve to the same pitch class, the written-degree distinction is retained in provenance even though pitch-class comparison collapses it.

The policy admits literal `add2`, `add4`, `add6`, `add9`, `add11`, and `add13` on a recognized base; `6sus2`, `6sus4`, `11sus2`, `11sus4`, `11o`, and `6o` have explicit family rules in the machine scorer. A written sixth in a 6-chord remains a sixth when `b13` is separately added. Exotic compositions of mutually competing quality words outside this finite grammar are **explicitly rejected by this policy**. An accepted site label in that class is a known `E/EXTERNAL_POLICY_DIFFERENCE` requiring an explicit Product diagnostic, not evidence for a guessed chord meaning. `F/UNKNOWN` is reserved for actual insufficient evidence or an unhandled parsing case. The external site's current single-slot overwrite is recorded on the site axis as `E`, never copied into this theory policy.

## Audition policy

For each supported label, required tones must be present on Text Preview, saved Vault audition, and Voicing Loop. Optional tones may be absent. Octave, spacing, duplication, and voice leading are `D/VOICING_DIFFERENCE` when defining tones survive. The slash bass must be the lowest sounded pitch; a pitch-class match elsewhere in the voicing does not satisfy it. A surface that silently loses a written altered tone is `B/DEFINING_TONE_LOSS` even if another surface sounds it.

## Current-site separation

The current site may sound every stacked degree of a thirteenth, omit one of two same-degree alterations, or produce an incomplete power-chord score. Those are measured current-site facts. `E` means the site's internally consistent policy differs from this audit policy, and does not grant Product permission to substitute a chord silently. Site notes are derived from its deployed runtime and checked against the UI for representative labels; Product notes come from Product functions at the frozen commit.
