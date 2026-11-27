# Contract 05 — LF-MIDI-001 / Privacy

## Identifier

Tracked identifier only:

```text
LF-MIDI-001
```

## Forbidden tracked data

- filename;
- absolute path;
- raw MIDI;
- raw notes;
- audio;
- checksum/fingerprint;
- full private chord transcription;
- `.local-evaluation`.

## Allowed aggregates

Examples:
- meter;
- counts;
- number of groups;
- dash count;
- block count;
- changed-vs-unchanged aggregate;
- Family-B regression status.

## Private fixture order

Synthetic / public-safe fixtures first.
Freeze the shadow policy.
Run LF-MIDI-001 last.
