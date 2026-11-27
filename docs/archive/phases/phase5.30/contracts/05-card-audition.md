# Contract 05 — Timeline Card Audition

## Interaction

Clicking or keyboard-activating a timeline code card auditions that code's **currently selected resolved voicing**.

It must NOT:

- seek transport;
- change current transport event;
- change loop count;
- start/stop transport;
- mutate Vault data;
- silently substitute a different voicing.

## Resolution

Reuse the production resolver/audio path already used by Voicing Loop/current-code/reference playback.

- Source MIDI: exact saved pitch/octave when available.
- Custom: exact saved compatible pitch/octave when available.
- Basic Shell / Basic Full / Left-hand: use the existing approved lesson resolver/rules.
- unavailable Source/Custom: visibly unavailable/fail closed; no generated fallback.

At most one card-audition voice group should be owned by this preview interaction at once; a new audition cleans up/replaces the previous preview group. It must not leak notes/resources.

The existing `現在のコードを試聴` behavior may remain; share implementation where practical rather than duplicating an audio engine.
