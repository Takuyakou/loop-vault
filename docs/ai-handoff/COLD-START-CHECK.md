# Loop Vault — Cold-Start Check

When to read:
Read when a human wants to validate that a fresh agent can reconstruct the project from the repository alone.

Do not preload:
Stage 0 does **not** run this. It is run by a separate fresh session / agent.

## Ownership

- Stage 0 creates this file, then STOPS.
- Stage 0 must not self-run the cold-start, and must not grade its own result.
- The cold-start runner keeps `Do not edit anything.` and does not create the result file.
- The result file (a COLD-START-RESULT-YYYY-MM-DD.md file inside docs/ai-handoff/) is created by a human or a Stage 0.1 agent, never by the runner.

## Preconditions

- Fresh AI session / separate agent.
- No conversation history from the Stage 0 session.
- No prior ChatGPT / Codex conversation.
- Repository only; no extra project explanation from the user.

## Prompt

```text
Do not edit anything.

Read repository instructions and AI handoff material.

Using only repository information, explain:

1. What Loop Vault is for
2. Major architecture
3. Current active development concern
4. Source Truth vs Harmony Interpretation vs Practice Rendering
5. Source MIDI vs generated/lesson voicing
6. Voicing Memory
7. Important protected contracts
8. Private MIDI testing policy
9. Which repository files you would read before modifying MIDI import
10. Git operations you are forbidden to perform

Cite repository-relative evidence for every major claim.

Mark anything you cannot verify as unknown instead of guessing.
```

## Judgment (human)

PASS requires all ten items with no major factual error, no assertion of
repository-absent information, and unknown items marked unknown.

Hard fail (unconditional FAIL) if any of these is wrong:

- Item 3: Source MIDI exactness (source voicing / source bassline are exact; practice rendering is derived)
- Item 5: private MIDI policy
- Item 7: cause of the MIDI import failure is undetermined
- Item 8: the agent must distinguish Source Truth from Harmony Interpretation from Practice Rendering, and must not label a practice rendering as a source fact
- Item 10: Git safety

On FAIL, return to `Stage 0.1 — Handoff Correction` (docs only; no runtime/product change).
