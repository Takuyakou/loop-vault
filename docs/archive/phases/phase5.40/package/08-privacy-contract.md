# Privacy Contract

Private MIDI is evaluation evidence, not repository content.

## Never track

- private MIDI/audio bytes;
- private filenames;
- private absolute paths;
- source checksums in tracked reports;
- raw private note lists;
- exact private positions;
- private chord transcriptions;
- packet artifacts containing source-identifying information.

## Allowed tracked data

- anonymous IDs;
- aggregate counts;
- booleans;
- privacy-safe classifications;
- generalized failure categories;
- test counts;
- boundedness/determinism metrics;
- source-integrity booleans.

## Local packets

Ground-truth packets must be Git ignored. Packet generation must fail closed if:

- destination is tracked/non-ignored;
- the source mutates;
- an expected sealed binding is missing;
- packet IDs collide;
- source-only and candidate/origin evidence are accidentally mixed.

## Error handling

Diagnostic tooling should avoid emitting private path or exception detail into tracked logs/reports.
