# Contract 04 — Capture Opt-in / Voice Selection

A candidate must be non-drum, included, not an exact duplicate, and have effective assigned role `bass`. Automatic inference never silently selects or authorizes persistence.

## Selection and opt-in

P5.22 stores at most one selected Bass Voice per progression block.

- The user explicitly chooses a candidate in the selector, even when only one or an automatic suggestion exists.
- Opt-in toggle default is OFF and remains disabled until a candidate and eligible source-matched range are explicitly selected.
- Turning opt-in ON confirms the visibly identified candidate/range and export disclosure.
- Source membership, role, inclusion, duplicate state, candidate, range, completed analysis, reanalysis, or imported-session changes reset opt-in OFF.
- A successful save also resets opt-in OFF. Failures preserve the visible selection but do not imply authorization.

The Voice id remains transient UI/extraction identity. Capture supplies the persistence adapter only a fully built, strict, budget-validated detached snapshot; no Voice id, raw session bytes, display name, path, or full analyzer result crosses the store boundary.

## Disclosure and fallback

UI shows localized candidate, source/range eligibility, 4/4 bar count, intersecting note count, simultaneous/overlap fact, and that the snapshot is included in Vault export.

Empty, stale, non-bar-aligned, non-4/4, meter-changing, source-misaligned, malformed, or over-budget input produces no snapshot and a factual reason. When opt-in is ON and the requested snapshot cannot be attached, progression save requires an explicit second snapshot-free confirmation; omission is never silent. When opt-in is OFF, ordinary progression save requires no extra confirmation.

Required labels:

- `元ベースライン候補` / `Source bassline candidate`
- `元ベースラインを練習用に保存` / `Save source bassline for practice`
- `Vault書き出しに含まれます` / `Included in Vault export`

## Accessibility and responsive behavior

Use native keyboard-operable select/checkbox/button semantics. Candidate, opt-in, and unavailable reason are associated by label and `aria-describedby`. State/reset/save results use a concise `aria-live="polite"` region; blocking errors use `role="alert"`. Disabled controls expose an adjacent localized reason, not tooltip-only information.

Tab order follows source selector, candidate, opt-in, save actions. Updates do not steal focus; after an invoked dialog/picker, focus returns to its trigger. At 320 CSS px and 200% zoom, labels wrap, controls remain reachable, and no page-level horizontal scroll is introduced.