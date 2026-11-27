# Contract 08 — Personal Fingering Persistence

Preferred identity:
- hand;
- sorted unique absolute MIDI pitch list.

Optional safe metadata:
- created/updated timestamp;
- finger array;
- schema/version for the preference collection.

Do not store:
- source path;
- raw MIDI;
- audio;
- device identifier;
- score/mastery.

Preferred storage:
- a dedicated versioned app-local Practice preference collection. Stage00
  confirmed this is compatible with the existing local preference repository
  pattern without changing the strict legacy preference payload.

The collection is optional/defaulted, bounded, and keyed only by hand plus the
sorted unique absolute MIDI pitch list. It is not stored in a Vault block.

No Vault schema/fileVersion change.

If persistence cannot be added safely without an unauthorized breaking migration,
P5.32 must omit the persistent Save control and report the blocker.
