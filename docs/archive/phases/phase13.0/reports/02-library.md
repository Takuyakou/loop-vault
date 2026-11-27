# P13 subsection 2 — Independent library

Raw SMF parser and existing source-bassline projection are reused. Whole meter map must remain 4/4; missing SMF tempo defaults to120. First tempo is retained and tempo changes are explicitly described. The bass name/role, GM bass program and lowest median are used only to preselect a user-editable track. Drums are excluded.

Selected notes and generic accompaniment track labels only are persisted. Original bytes, paths, unselected tracks and recordings are excluded. Independent version1 JSON lives at the application-data relative path `loopvault/bass-midi-library-v1.json`; atomic temp/replace, revision/content token, isolated backups20 and quarantine reuse existing storage infrastructure. Practice/Vault envelopes are not migrated. Future-version documents remain untouched. Browser and native storage enforce namespace ownership.

Focused coverage includes default/changed tempo, whole-meter rejection, deterministic lowest-onset projection, byte/note/song budgets, round trip, corruption/valid-backup recovery, future version and isolation. Native atomic replacement/restore is covered by the separate namespace test. Final code-HEAD gate evidence will be recorded in FINAL-REPORT.md.
