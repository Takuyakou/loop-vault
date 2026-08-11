# Local Failure Fixture — all_instruments.mid

## Required fixture ID

`p5211-real-001`

## Source

User-provided `all_instruments.mid`.

## Policy

The raw file remains local/ignored and is never committed.

Codex should look for exact filename only in repository/shared-worktree/local-evaluation locations.
If found, register/copy it automatically into the repository's existing ignored evaluation area.

If not found, request one source path only.
Do not ask the user to create manifests or labels manually.

## Stage00 outputs

Commit only privacy-safe facts such as:

- fixture anonymous ID
- SHA-256 if policy permits
- track/Voice counts if non-identifying
- structural failure summary
- old/new metric summaries

Do not commit:

- raw MIDI
- private title/path
- note-by-note data

## Acceptance purpose

This fixture proves product relevance.
It is not the sole classifier training/tuning corpus.
