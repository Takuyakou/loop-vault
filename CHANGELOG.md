# Changelog

## 3.2.0 - 2026-11-27

- Voicing shapes rebuilt: "Basic" stays the default and sounds exactly as before; four practice shapes can be chosen instead — shell, rootless A/B (left hand, four notes), shell + upper triad, and quartal — and shell / rootless take two modifiers, "add tension" and "spread" (in Voicing Loop, Basic takes them too, replacing "Colorを加える" / "Open配置"; the added note and the spread follow the shell rules, and Basic's own notes are kept).
- Voicing Loop: Basic now sounds every chord. Chords it could not build (such as 7alt) use the text-import preview voicing and carry the "代わり" (substitute) mark; chords that already sounded are unchanged. Text import and Voicing Loop share the same shapes and names (they had eleven differently named ones). Chords a shape cannot build fall back to a close shape and show the "代わり" (substitute) mark. Low-register spacing follows the textbook low-interval limits (including sixths and sevenths), and the right hand stays within an octave of the left. The rules are pinned by a golden table of 4,320 cases (`docs/contracts/voicing-shapes-p26/golden.json`).
- Voicing Loop: "基本" and "詳しい設定" are merged into one "形" (shape) menu; "最適化" is renamed "なめらかにつなぐ" and moved into the shape menu (same behaviour). Earlier generated-shape choices are mapped to the nearest new shape.
- Text import: selecting a card opens a voicing dock under the panes — a keyboard with the sounding notes and their chord-tone roles, rings for chord tones not yet sounding and marks for the previous card's notes; click keys to add or remove notes; pick a shape from thumbnails, with "add tension" showing the note it adds (e.g. +9 (D)); inversion, octave and "nearer to the previous card"; an edit range (this card / same chord / all cards); "play on a MIDI keyboard" fills the cards in order; undo; keyboard shortcuts (← → ↑ ↓, Shift+↑ ↓, 1–5, S, M, Enter, Esc).
- When edited notes no longer read as the card's chord, the chord is detected again and the name in the input is rewritten (the same detector as keyboard entry). Hand-edited notes are saved as `manual` voicings and shape choices as `text-shape-v1` snapshots; the Vault schema and `fileVersion` 2 are unchanged, and voicings saved by earlier versions keep their notes.
- Cards show small dots for the register of their notes. "音を細かく直す" is removed; open the saved progression from the Vault to edit it in the progression editor.
- Text import: cards lift on hover and keyboard focus like Voicing Loop's cards (shadow, teal edge; no lift with reduced motion).
- Voicing Loop play-along (off by default, next to "お手本の音"): play on a MIDI keyboard with the progression; keys show correct (green ●) and wrong (red ×) notes, the keyboard legend gains both marks while it is on, cards get ✓ / ✖ as they pass, and the status row shows this loop's count. Two judges: chord match (the default; root and 5th optional) or same voicing (±1–2 octaves allowed). Early chords, late releases and pedal-held notes are not counted as mistakes; the cards follow the audible clock.
- Voicing Loop: "この進行を元MIDIに" becomes "この進行を元の音に", a regular button like "運指を編集": MIDI cards go back to 元MIDI and text cards to their saved sound; custom sounds stay.
- Text import: a "next chord" palette opens from the "+" after the last card. It offers five candidates that fit the progression and key (common moves, colour, smooth bass lines, and what your own Vault tends to use) plus the key's seven chords; click to audition, "+" to append (a bar, two beats or one beat), Ctrl+Z to undo. Everything is computed locally.
- Voicing Loop: Space starts and pauses playback wherever the focus is (buttons and cards included), except in text fields.
- The sound band spells note names by their degree in the chord (the 9th of Em7 is F#, not Gb).
- Text import: the "1 / 8 bars" counter next to the transport is gone.
- Text import: after saving, one bottom-right notice with "Voicing Loopで練習" replaces the panel under the preview ("保存した進行を練習できます"); a progression Voicing Loop cannot play says so without internal codes.
- Keyboard entry: PC shortcuts while playing — 1 / 2 / 3 for the length, 0 for a rest, Backspace to undo, Esc to leave.
- Chord sheets with inline chords (`[C]lyrics[G]more`) are read as one chord per bar.
- Chord sheets: `Key:`, `BPM:` / `Tempo:` and `Time Signature:` lines set the key, BPM and meter (tagged 設定), and `--- A Section ---` lines read as headings. An empty BPM field shows the shared BPM as its placeholder (the "試聴 120" note is gone). Line tags no longer sit under the editor's scrollbar.
- Text import also reads comma- and dash-separated chords (`C, G, Am, F`, `C-G-Am-F`) and `.` as a repeat of the previous chord; dashes that mean minor (`C-7`) are read as before.
- "修正作業場" is renamed "進行エディタ" (Progression Editor) in the app and the README.
- The text-import help ("?") moves to the right end of the top band and lists the notation and the shortcuts.
- Layout: the progression editor's tool row stays on one line at 1280 px, and the progression page fills wide windows.
- Removed the unused AI advisor code (front end and Rust commands, and the HTTP client it needed); the settings screen can still check and delete a previously saved API key.
- Repository: `docs/` reorganised into `current/`, `designs/`, `contracts/`, `release/` and `archive/` with an index (`docs/README.md`); old phase documents, reports and evaluation scripts are archived, not deleted. `npm run validate:docs-layout` checks the layout. The README gains a demo and an architecture section.
- v3.1.0 data opens as it is. See [release notes](docs/release/v3.2.0/release-notes.md).
- Voicing Loop: the rule row under the current chord drops internal names (Teacher Style, Literal…) and shows only "ほかの押さえ方" (other voicings) and omitted notes; "MIDI 未接続" moves next to the bar count.
- Panels, menus and the fingering / play-along toggles now fade and slide in and out (instant with reduced motion).
- Slash chords: no note a semitone directly above the slash bass, and a minor ninth against the bass only when two octaves or more apart (e.g. Cmaj7/B, F#m9/G#), in every shape and modifier including Basic and its substitutes; common slash chords sound as before. The golden table is unchanged; a test sweeps every slash chord through Voicing Loop. Text keeps the typed slash-bass letter (F#m9/G# no longer shows as F#m9/Ab).
- Voicing Loop: clicking a card plays the voicing the loop is playing (it could play the source MIDI after switching sources). Switching source, shape, modifiers, rootless order or "なめらかにつなぐ", recall mode and play-along no longer shifts the layout.
- Text import: "最初から" sits next to ↶; "前に近づける" is renamed "前のコードに近づける"; the dock's right side is a labelled grid (形 / 部品 / 位置) and "play on a MIDI keyboard" swaps in place; the help ("?") is a short table.
- Keyboard entry: "もう一度 (R)" repeats the previous chord at the current length (same as `%`); a three-octave keyboard with clearer held keys, the held chord's name and notes, and a close button.
- Resume bands on the home screens are restyled at the same height. Chord Dojo drops in-practice "MIDI not connected" notices except one-line notes where results change, and fixes the ear-practice side column. Button labels no longer wrap.
- Automatic key: a key is taken when 55% of the chords fit it (was 75%); between relative keys the first chord decides. The 覚える / 思い出す swap moves the same way in and out. Text import says "MIDI 未接続" like Voicing Loop.
- Every dropdown opens an in-app list in the app's look (keyboard, type-ahead and Escape included); the closed controls are unchanged.
- The shape menu highlights the hovered item; dropdown lists slide in and fade out; the MIDI capture screen says "ドロップ".
- Text import: `Cmaj7{C3 G3 E4 B4 D5}` sets a card's notes (C4 = middle C, 2–10 notes); the dock still edits them, and the text is not rewritten.
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

Historical notes: [v1.1.0](docs/release/v1.1.0/release-notes.md).

## 1.0.0 - 2026-08-04

Initial published Windows release.
