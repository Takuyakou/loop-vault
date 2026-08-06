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

## Chosen store (decision — refined in P5.17-03)

**IndexedDB is the single Vault-independent binary take store for both runtimes.**
IndexedDB is binary-safe and persists across restarts in browsers and in the
Tauri WebView2 runtime (under the app's user-data dir), so a kept take survives
an app restart without any Rust file store. This keeps audio entirely out of the
Vault-adjacent `practice-v1.json`, touches no Vault schema, adds no Tauri plugin
or dependency, and needs no new capability (WebView2 owns IndexedDB).

Layering (P5.17-03):

- `RecordingStore` port — low-level binary+metadata KV. `IndexedDbRecordingStore`
  at runtime; `InMemoryRecordingStore` in tests (and as a non-persistent fallback
  when IndexedDB is unavailable).
- `PersistentRecordingTakeRepository` on top — opaque ids, quota, non-identifying
  metadata, schema version, corruption/orphan handling.

The earlier option of a Rust `loopvault/recordings/` store is superseded: it is
unnecessary given WebView2 IndexedDB persistence, and avoiding it removes a whole
native surface (commands, capabilities, atomic-write code). If a future need
(e.g. very large takes beyond IndexedDB quotas) requires a file store, its need,
alternatives, and added permissions are to be recorded in the audit first.

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
