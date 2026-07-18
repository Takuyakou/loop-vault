# Phase 3.7.1.2 Chord Drip Strategy Audit

## Scope

This audit compares the current Loop Vault quick-candidate pipeline with the
actual implementation in the user-owned Chord Drip repository at audit time.
Loop Vault must not import Chord Drip at runtime.

## Findings

| Chord Drip element | Actual implementation | Loop Vault decision |
|---|---|---|
| `smoothConnection` | Same-root quality extension generated in `src/domain/guidedRepair.ts`; re-voiced and passed through Hard Validity | Adapt the candidate vocabulary, canonical voicing, pair metrics, and validity concepts into Loop Vault pure functions |
| `authorReferenceFit` | Same-root quality extension only; it does not query author history | Do not copy this behavior as a Style claim |
| Pair analysis | `src/domain/voicedPair.ts` measures common tones, Bass movement, total movement, Top Voice, guide-tone steps, low-register spacing, and issues | Port the measurable symbol/canonical-voicing subset for Smooth ranking |
| Voicing | `src/domain/voicing/voice.ts` creates deterministic candidates and minimizes movement using profile constraints | Use a smaller deterministic canonical voicing adapter; do not import the generator or RNG path |
| Hard Validity | `src/domain/phase47/hardValidity.ts` rejects MIDI range, low-register collision, slash mismatch, voice crossing, duration, and render failures | Port applicable chord/voicing checks; rendering-specific checks remain out of scope |
| Candidate identity | Chord Drip uses rendered symbol labels in Guided Repair | Use Loop Vault's canonical root/quality/tensions/bass key so slash-bass variants remain distinct |
| Author data | Chord Drip feedback stores accepted `EditDelta`, but current `authorReferenceFit` does not retrieve it | Build a non-persistent index only from Loop Vault `userVerified`, `userEdited`, and weak `pinned` evidence |
| Candidate trace | Chord Drip records strategy and selected candidate in accepted EditDelta | Add optional source metadata to Loop Vault correction feedback and append it only after a successful save |

## Data Availability

Loop Vault already persists `SavedProgressionBlock.userVerified`,
`SavedProgressionBlock.userEdited`, and `SavedProgressionBlock.pinned`. The Style
index can therefore be derived from the current Vault without changing
`SavedProgressionBlock`, `VaultFile`, or `fileVersion`.

Style availability gate:

- at least 5 transitions from `userVerified` blocks; or
- at least 3 transitions from `userEdited` blocks.

Pinned-only data is weak evidence and cannot open the gate by itself.

## License And Dependency Boundary

The inspected Chord Drip repository is private (`package.json` has
`"private": true`) and has no repository-root `LICENSE` file. Both repositories
are owned by the user. The implementation copies and adapts only project-local
pure logic and concepts; no third-party source is copied. Loop Vault does not
add a runtime dependency, package dependency, filesystem lookup, or import from
Chord Drip.

## Risks And Reductions

- Loop Vault has no persisted performed voicing for saved progressions. Smooth
  ranking must be described as canonical-voicing or symbol-level evaluation.
- Chord Drip's current `authorReferenceFit` name overstates its implementation.
  Loop Vault shows Style only when the local positive-data gate passes.
- Analyzer, Smooth, and Style scores are not comparable. Candidate composition
  uses fixed source quotas and source-local ranks.
- Candidate selection must remain deterministic and independent of preview
  history, current time, and UI open count.

## Out Of Scope

- Chord Drip radial UI
- Feedback Lab state and rendered clips
- Standard Generate, Fresh Seed, frozen Judge, and global voicing paths
- Chord Drip runtime imports
- MIDI analyzer weights or default analyzer mode changes
