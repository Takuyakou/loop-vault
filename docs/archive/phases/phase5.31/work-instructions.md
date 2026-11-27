# P5.31 Work Instructions

## Scope

Stage00 is verified. The user authorized sequential implementation and verification
of Stage01 through Stage04. Follow [provided work instructions](P5.31-work-instructions.md)
with [approved product decisions](contracts/11-human-approved-product-decisions.md).
Resume from [canonical live state](execution-state.json), not the historical
prefixed intake-state file. Close each stage independently with its own evidence.

## Non-goals

No unrelated refactor, data rewrite, migration, fileVersion change, new clock,
new voicing generator, scoring, merge, push, tag, release, or P5.32.
The `#5` approval is limited to required chord-type/save-validation support.

## Definition of Done

Record focused gates for each intermediate stage, then final integration and
regression gates against their verified commits. Preserve clean tracked status
after each closeout. Final acceptance includes compact/expanded fixture parity,
exact rest/hold/re-strike save/reload/playback, and approved Left-hand slash roles.
Use Tier 1/2 for intermediate stages; concentrate applicable Tier 3 gates at the
final stage without skipping phase-specific safety gates. Stop at product acceptance.
