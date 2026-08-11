<!-- phase-id: 5.21.1 -->

# Contract 06 — Privacy / Test Hygiene

Never commit/report:

- private `all_instruments.mid`
- raw note dump from private MIDI
- personal absolute path
- `.local-evaluation`
- recordings/device identifiers

Synthetic generator/labels may be committed.
Generated MIDI follows existing tracked-MIDI policy.

No unrelated visual baseline update in this Phase.
No reset/stash/discard.
No `git add -A` / `git add .`.
No merge/push.
