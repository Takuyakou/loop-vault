# Phase 5.13 Component Contract

## Button

- Native `<button>`, default `type="button"`.
- Variants: primary, secondary, ghost, danger.
- Primary is limited to the main action in the current decision area.
- Disabled controls remain legible and keep a reason in surrounding text when the reason is not obvious.

## IconButton

- Requires a `label`.
- Exposes the same text through `aria-label` and `title`.
- Uses a 40x40 px hit area.
- The icon is decorative and must use `aria-hidden`.

## Field

- Persistent visible `<label>` associated by `htmlFor`.
- Optional/helper/error text has a stable space below the control.
- Errors use `role="alert"` and do not erase the entered value.
- The child control uses `lv-field-control` and sets `aria-invalid` when needed.

## Surface

- Represents a bounded tool or repeated item, not a decorative page section.
- Uses `lv-surface`; nesting cards inside cards is avoided.

## StatusMessage

- Tones: info, success, warning, error.
- Info/success/warning use polite status announcements.
- Error uses an assertive alert.
- May expose one concrete recovery action.

## EmptyState

- Has a heading, a concise explanation, and an optional direct next action.
- It does not describe the whole application or turn a work screen into a landing page.

## Focus and keyboard

- Shared components inherit the global `:focus-visible` ring.
- Native semantics are preferred.
- Custom pointer interactions require a keyboard path and an accessible name.

## Compatibility

These primitives are additive. Existing screen components can migrate incrementally; no domain, analyzer, storage, or Rust interface depends on them.

