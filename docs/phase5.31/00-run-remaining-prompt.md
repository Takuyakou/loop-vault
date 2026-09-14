# P5.31 Run Remaining Prompt

Continue Phase 5.31 from the exact current execution state.

Before each stage:

1. read root instructions;
2. read `docs/phase5.31/README.md`;
3. read canonical `docs/phase5.31/execution-state.json` and the approved
   `docs/phase5.31/contracts/11-human-approved-product-decisions.md`;
4. read the prior stage report;
5. verify Git state and stage authorization;
6. preserve unrelated user changes.

Run only the next authorized stage. At every stage boundary:

- run the required focused gates;
- update the stage report and execution state;
- stage explicit paths only;
- review staged diff;
- commit;
- confirm clean tracked status;
- STOP unless this prompt explicitly authorizes continuing all remaining stages.

For this invocation, if every hard gate is green, you may continue sequentially
through P5.31-04. If any hard gate fails, STOP immediately and report it.

Never:
- reset/stash/discard,
- `git add -A`,
- `git add .`,
- silently change Vault schema/fileVersion,
- invent a Left-hand slash-chord lesson rule,
- merge/push/tag/release,
- start P5.32.
