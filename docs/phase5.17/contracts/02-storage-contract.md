<!-- phase-id: 5.17 -->

# Contract 02 — Storage

How takes are held and persisted. Grounded in the audit: the Practice document is
UTF-8 CAS JSON with a 16 MiB cap and is Vault-independent — it must not carry
audio.

## Ephemeral by default

A recording is temporary data. It is discarded on: Review completion; Discard;
the previous take after Retake; confirmed route-leave; app exit; session
discard. Recording alone never persists.

## Keep Take (explicit persistence only)

Only an explicit **Keep Take** writes a take locally. Requirements:

- Separate from the Vault; does not change the Vault schema.
- No base64 embedded in the Practice JSON; no audio Blob in `localStorage`.
- No cloud. No personal absolute path in metadata. Opaque id. Binary-safe.
  Versioned. Deletable. Bounded quota. Never auto-deletes old takes.

## Chosen store (decision)

**Extend the existing Tauri practice storage with a dedicated binary take store**
under `app_data_dir/loopvault/recordings/` (already inside the `fs:scope`
allow-list), addressed by opaque id, with a small sidecar metadata index kept
separate from `practice-v1.json`. New Rust commands (e.g.
`save_practice_recording`, `load_practice_recording`, `list_practice_recordings`,
`delete_practice_recording`) mirror the atomic-write / bounded / validated-name
discipline already proven in `practice_storage.rs`. In the browser/dev runtime,
back the same `RecordingTakeRepository` interface with **IndexedDB** (binary-safe,
not `localStorage`). No new Tauri plugin is required; if later a plugin or new
dependency appears necessary, its need, alternatives and added permissions must
be recorded in the audit before adoption.

Rationale: reuses audited atomic/CAS/quarantine patterns, keeps audio out of the
Vault-adjacent Practice JSON, and stays within existing capabilities.

## Metadata (per take; non-identifying only)

recording id; Practice session id; exercise id or stable exercise signature;
mode; createdAt; duration; MIME type; byte size; channel mode; a **non-identifying
display name** for the input device; schema version.

Never store: OS absolute path; raw device id in a report; username; personal MIDI
path; audio analysis result; inferred note names; inferred accuracy.

## Quota

Per-take max duration is finite, derived from the current maximum exercise length
plus a safety margin (value + rationale recorded in the P5.17-03 report). A
finite total quota caps all retained takes. On quota exceed: do **not** auto-
delete; fail only the save while keeping ephemeral playback; expose capacity and
manual delete in a storage-management view.

## History integration

Retained takes replay/delete from Practice History. Displayable facts: Recording
retained, duration, date, mode, file size, input channel, played-back-before-
review, review result. Forbidden: accuracy / pitch / rhythm score / performance
level / any good-bad verdict. A missing or corrupt take shows `Recording
unavailable`, stays deletable, and never breaks the rest of History. Orphan
binaries and orphan metadata are detectable and safely cleanable.
