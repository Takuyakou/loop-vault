# Loop Vault — Handoff (Navigation / Situation Summary)

When to read:
Read this first when you pick the repository up.

Do not preload:
This is a short navigation summary. Read the current pages under `docs/current/`
only for the part your task touches, and read a design document only when you
need the reasoning behind an existing decision.

## Last verified against

- commit: 2c430daed48402f3e2e12ed1edc723e5a1533920
- date: 2026-11-25
- version: 3.2.0 (development tree; the release commit and tag come later)

Freshness note: the verified commit is the code/docs state this handoff was
checked against. Being behind HEAD after later handoff-only commits is not itself
stale. Only a missing commit (FAIL) or a non-ancestor commit (WARN / freshness
review) is treated as a freshness problem by the validator.

Refresh this file when:

- major architecture changes
- active product concern changes
- protected contract changes
- major product workflow changes
- the repository/docs layout changes

## Where to start

- [`docs/README.md`](../README.md) — the entry point for all documentation.
- [`features.md`](../current/features.md) — what each screen can do.
- [`architecture.md`](../current/architecture.md) — folder roles, pure layers, the audio clock, the save path.
- [`data-contracts.md`](../current/data-contracts.md) — Vault v2, the stores, the `localStorage` keys, `docs/contracts/`.
- [`development.md`](../current/development.md) — prerequisites, dev/build, the test levels, the checks, the release records.
- [`voicing-rules.md`](../current/voicing-rules.md) — the generated voicing rules (the four shapes and the two parts).
- Root `AGENTS.md` — the canonical safety rules; `CLAUDE.md` points at it.

## What v3.2.0 changes

- **Text intake**: the selected-card band replaces the old inspector; the user can
  edit the card's sound (five shapes, tension, spread, inversion, range) in place,
  rename the chord from its notes, undo, and enter chords from the MIDI keyboard.
  `[C]歌詞` lines and comma/dash/`.` separators parse into the same timeline.
- **Voicing shapes (P26)**: the generated voicing uses four shapes (shell,
  rootless A/B, shell + upper triad, fourths) plus two parts (add a tension,
  spread) over the unchanged "basic" default. The frozen table is
  `docs/contracts/voicing-shapes-p26/golden.json` (12 roots × 45 chords × 8
  shape/part combinations = 4,320 cases).
- **Voicing Loop**: the top "sound source" row chooses the basic voicing or a
  shape, remembers it, and can switch the whole progression back to its source
  MIDI. The play-along judge (chord match / exactly as shown) colours the keyboard
  and marks the cards.
- **Repository and docs (P25 M)**: old phase packages, reports, artifacts and the
  root checklists moved under `docs/archive/`; runtime fixtures moved under
  `docs/contracts/`; `docs/current/` and `docs/designs/` are the live docs;
  `npm run validate:docs-layout` checks the layout, the paths and the publish-word
  list. Unused evaluation scripts moved under `scripts/archive/`.
- **AI advisor removed**: the request pipeline, its Rust providers and its
  dependencies are gone. Only reading the stored OpenAI key's status and deleting
  it remain in Settings.

## Product mission (CONFIRMED)

Loop Vault is a desktop app that helps a producer turn MIDI into a working
progression vocabulary. It is **not** a chord detector.

- Capture: import MIDI or paste chord text, choose which voices to analyze, and
  get a chord timeline plus candidate blocks.
- Correct: edit candidates and chords (range select, replace, split/merge, move)
  with Undo/Redo, or edit the card's voicing directly.
- Keep: save chosen progressions into the Vault.
- Practice: rehearse degrees, rhythm, bass, voicings, and play along with a MIDI
  keyboard.
- Reuse: search and re-open saved progressions, export them as MIDI, or hand them
  to Voicing Loop / Chord Dojo / Bass Practice.

## Architecture at a glance

- `src/domain/` — pure calculation: chord identity, MIDI analysis, text parsing,
  voicing shapes and rules, progression editing, practice clocks, the saved
  schema. No React and no Tone imports.
- `src/views/` and `src/components/` — screens and shared parts. They receive
  Vault state and actions as props; `src/App.tsx` is the single Vault subscriber.
- `src/audio/` and `src/practice/` — playback, previews and the `Tone.Transport`
  clock; rendering reads the clock and writes the DOM without re-rendering React
  every frame.
- `src/store/` and `src/storage/` — the Vault store (zustand) and the storage
  adapters. The desktop Vault is written through `@tauri-apps/plugin-fs` to
  AppData; native commands exist for practice records and Chord Dojo.
- `src-tauri/` — Rust: practice/Dojo storage, MIDI export and native drag, Live
  MIDI, media permission, and the keychain status/delete commands.

Details and file paths: [`architecture.md`](../current/architecture.md).

## Stored data and protected contracts

- Vault v2: `fileVersion: 2` in memory and on write. The reader accepts envelope
  versions 1, 2 and 3 and normalizes to v2; the writer emits a v3 envelope only
  when a chord carries the `altered` classification, so older readers are not
  handed a partial import. Do not change the schema, the required keys, or the
  `localStorage` keys without explicit authorization.
- Practice records, Chord Dojo records and Bass Practice records are separate,
  versioned, atomically written files. A damaged or future file is quarantined,
  never silently replaced with an empty one.
- Private MIDI/audio, personal absolute paths and `.local-evaluation/` inputs are
  never committed. The publish-word list stays outside the repository
  (`.local/publish-words.txt`, ignored).
- Analyzer, MIDI export and playback behavior are not changed incidentally.

Details: [`data-contracts.md`](../current/data-contracts.md).

## Repository layout

- `docs/current/` — the five live documents (do not add more; rewrite the changed
  parts at each release).
- `docs/designs/` — the accepted design document(s) for each version; append only.
- `docs/contracts/` — frozen data that tests and the app read at run time.
- `docs/release/` — one folder per release (`release-notes.md`, the validation and
  asset records, and the local-only report).
- `docs/archive/` — past phase packages, reports, artifacts and the old root docs.
  Do not add to it.
- `docs/images/`, `docs/security/`, `docs/ai-handoff/` — as named.
- `scripts/archive/` — evaluation/audit tooling with no current command; the
  `README.md` there maps the removed command names. Nothing in the build, the
  gates or the app runs them.

## Known limits to keep in mind

- The play-along judge needs a connected MIDI keyboard; without one the switch is
  disabled and the band says MIDI is not connected.
- A rest-only progression cannot be saved from the text panel in this version.
- Text intake does not read an `x2` repeat; a `.` repeats the previous chord.
- The `cookie` 0.18.1 advisory (RUSTSEC-2026-0594) is handled in the release
  checklist, not in the feature stages.
- At narrow widths the Voicing Loop legend wraps to two rows when play-along is on
  (the buttons stay inside the row).

## How to resume work

1. Inspect Git reality (branch, HEAD, `git status`).
2. Read root `AGENTS.md`.
3. Read this file.
4. Read [`docs/README.md`](../README.md), then only the `docs/current/` page your
   task needs.
5. Read the accepted design document for the version you are touching
   (`docs/designs/`), and only the task-relevant contracts.
6. Inspect the actual code and tests before editing.

Do not preload the archive. Use the standing local merge authorization in root
`AGENTS.md`; never push automatically.
