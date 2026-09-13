# Contract 06 — Lesson Left-hand Slash Chords

Problem examples:

```text
Am11/B
Am9/C
```

The chord parser may support these while the Lesson Left-hand generator does not.

## Required separation

- chord identity parsing;
- slash-bass identity;
- Lesson voicing rule resolution;
- playback;
- display

must remain distinct.

## Allowed only with lesson evidence

A rule may explicitly state one of:

- include slash bass in the Left-hand voicing;
- treat slash bass as an external bass role while generating a named upper
  structure Left-hand shape;
- family-specific rule with explicit pitch/degree template;
- unsupported.

## Forbidden

- silently erase `/B` or `/C`;
- silently substitute another family;
- silently use Auto/Basic/Source/Custom;
- invent a generic jazz convention and label it as the lesson rule.

When unsupported, preserve honest UI state.
