# Changelog

## 3.1.0 - 2026-11-23

- Text import: one input instead of the Standard / Extended switch (both notations still read); paste chord sheets as they are (lyric lines are skipped, full-width symbols are normalised, with a one-line notice and "replace with the tidied text"); `[Section]` headings divide the preview; wavy underlines and a list of fixes, with a one-click fix for German `H` and lower-case roots; cards and input text select each other; right-click or Delete removes a card; new time-signature (1/4–12/4) and key menus.
- Keyboard entry: press "鍵盤で入れる" in text import and add one chord per release from a MIDI keyboard, with the played notes kept as the card's sound, lengths (bar / 2 beats / 1 beat), rests and undo.
- Sample progressions: an empty Vault offers three samples (王道進行, 丸サ進行, 循環進行) tagged `サンプル`.
- Chord Dojo Guided Course: Lv1–Lv2 ear questions accept inversions; Lv4 to the capstone give specific round tips with a compare-with-the-example player; missing keys are green with a clearer dotted ring.
- Voicing Loop: recall mode hides the next shape; octave and detail changes during playback or pause now reach the sound; pause returns to the card's head; stopping fades out without a click.
- Shared Home resume band and button across Bass Practice, Chord Dojo and Voicing Loop (each keeps its own colour); screen text is no longer drag-selectable except inputs, titles, chord lines and notes.
- Keep Vault `fileVersion` 2. v3.0.0 data opens as it is; text progressions saved from now keep repeated chords (`| C | C |`, `%`) as separate attacks. See [release notes](docs/release/v3.1.0/release-notes.md).

## 3.0.0 - 2026-11-22

- Redo the whole interface: new fonts, colours and surfaces, the Home screen (today's loop, practice records, resume), Import (MIDI / text entry and the pre-analysis check), the Vault list and preview, the progression header, the Correction Workspace, Settings, the toast and the sidebar. Search from anywhere with Ctrl+K.
- Show chord names with ♯ / ♭ and Roman-numeral degrees, give an unset key automatically when a progression is imported, and share one BPM across the practice screens.
- Voicing Loop: a new practice screen and progression picker; right-click inside the range clears it, and the range is amber.
- Chord Dojo: a two-column Home; the Guided Course (Lv1–Lv8 and a capstone) with its own stage, restart dialog and course map; 2-5-1 Master top row; Ear Practice (choose, record, judge, result); Voicing Drill.
- Bass Practice: a three-stage practice screen with automatic judging of a played bassline (a guide for single-note playing), and a calmer Home.
- Dependencies: zod 4, vitest 4, vite 7.3.8 and four Rust crates; `npm audit` reports 0 vulnerabilities.
- Keep Vault `fileVersion` 2. v2.1.0 data opens as it is; the new practice records (`guided-course-v1`, `guided-course-advanced-v1`, `voicing-drill-v1`) get their own files on first use. See [release notes](docs/release/v3.0.0/release-notes.md).

## 2.1.0 - 2026-11-08

- Rebuild Chord Dojo: 定番の進行 across 12 keys and random keys, Original Practice, long progressions, 2-5-1 Master, saved progressions, and one visible answer step per judged chord.
- Add Jazz Progressions: 12 keys with random key, octave +1, BPM, listening playback, ① 見て弾く and ② 覚えて弾く, and the shared practice frame with repeats.
- Add Bass Practice (degree / rhythm / bassline / root-motion echo, Record & Compare, MIDI bassline judging) with its own storage namespace.
- Unify MIDI connection across the app, add ear practice, and consolidate the practice screens' layout.
- Capture: delete code cards, cut whole bars and close the gap; smoother preview fades.
- Voicing Loop: MIDI-keyboard sound, smooth navigator fill, audio-clock painting on resume, a sectioned progression picker with two-line rows, and Vault favourites pinned on top.
- Vault: backup rotation counts only real backups, resolves `legacy-import.json` correctly, and still loads when tidying backups fails.
- Text intake: read `minMaj7` and `alt`, keep the classification through save and registered Dojo practice, in a separate storage namespace.
- Test hygiene (R-01) and Rust security advisories (R-02): RUSTSEC fixes via `cargo update`, reviewed audit ignores, and the repaired test gates.
- Keep Vault `fileVersion` 2 and the unchanged Vault schema; new practice records use their own namespaces. See [release notes](docs/release/v2.1.0/release-notes.md).

## 2.0.0 - 2026-10-03

- Unify MIDI / Standard and Extended Text intake through the Correction Workspace; improve timeline/range operations and saving.
- Preserve explicit source/custom pitches across playback and source switching; handle the SMF 120 BPM default without changing Vault v2.
- Integrate the Voicing Loop timeline, keyboard, four explicit sources, generated detail settings and session-only A–B Range Loop.
- Improve restart/first-chord audio, popover dismissal, desktop/narrow layouts and accessibility.
- Use the approved E1-T/inverse/lambda2/gamma1 fingering ranker with fixed Saved anchors and session Developer CURRENT fallback; preserve notes and hand assignment.
- Improve test runner diagnostics/cache boundaries and full release verification.
- Remove the formerly advertised AI Advisor UI from the feature list; its earlier saved API key can still be removed in Settings.

Core v2 NO-GO / diagnostic-only proposals remain unpromoted. Vault fileVersion remains 2; no release-specific data migration is introduced. See [release notes](docs/release/v2.0.0/release-notes.md).

## 1.1.0 - 2026-08-12

Historical notes: [v1.1.0](docs/releases/v1.1.0.md).

## 1.0.0 - 2026-08-04

Initial published Windows release.
