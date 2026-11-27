# Contract 09 — Persistence / Privacy

Practice session uses detached safe snapshot.

Do not persist:
- raw performance notes
- score/accuracy
- raw MIDI
- original file path
- device identifiers

Loop count is session-local v1.

Avoid Vault schema/fileVersion change.

Reuse existing Practice settings storage only when compatible.
