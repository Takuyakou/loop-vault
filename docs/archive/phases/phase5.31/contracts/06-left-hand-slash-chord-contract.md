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

## Approved product policy

The user has approved [Upper Structure + Separate Slash Bass](11-human-approved-product-decisions.md).
That product decision supersedes the initial evidence-only blocker below without
claiming new teacher evidence. Use existing lesson rules for `X`; preserve `X/Y`,
keep `Y` separate, combine them only for reference playback, and distinguish their
keyboard roles. Unsupported upper structures remain fail closed.

## Original evidence categories (historical audit context)

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
