# Phase 5.13 Design System

## Direction

Loop Vault remains a compact, dark desktop production tool. The design system supports fast scanning beside a DAW and avoids landing-page composition, large decorative cards, gradients, glass effects, and ornamental motion.

## Semantic color roles

| Role | Token | Use |
| --- | --- | --- |
| App background | `--lv-bg`, `--lv-bg-subtle` | Window and recessed work areas |
| Surface | `--lv-surface`, `--lv-surface-raised`, `--lv-surface-overlay` | Panels, selected rows, popovers |
| Text | `--lv-text`, `--lv-text-secondary`, `--lv-text-muted` | Primary, supporting, tertiary |
| Border | `--lv-border`, `--lv-border-strong` | Structure and interactive bounds |
| Accent | `--lv-accent`, `--lv-accent-strong`, `--lv-accent-soft` | Primary action and current selection |
| Information | `--lv-info`, `--lv-info-soft` | Neutral system information |
| Success | `--lv-success`, `--lv-success-soft` | Completed and saved |
| Warning | `--lv-warning`, `--lv-warning-soft` | Uncertain, incomplete, recoverable |
| Danger | `--lv-danger`, `--lv-danger-strong`, `--lv-danger-soft` | Destructive and failed |
| Focus | `--lv-focus` | Keyboard focus only |

Voice identity colors remain a separate visualization palette in the pre-analysis piano roll. They must not acquire global UI meanings.

## Typography

- Chord names and progressions: monospace where comparison matters.
- Screen title: 24 px token-equivalent, compact line height.
- Section title: 16-18 px.
- Body/control: 14-16 px.
- Helper and metadata: 12 px, never the sole carrier of a critical action.
- Letter spacing remains `0` except the existing product wordmark.

## Density

- Compact control: 36 px minimum height.
- Default control: 40 px minimum height.
- Icon-only high-frequency controls: 40x40 px where layout permits.
- Spacing uses the 4 px scale: 4, 8, 12, 16, 20, 24, 32.
- Cards and surfaces use 8 px radius by default.

## Motion

- Fast feedback: 120 ms.
- Normal state transition: 180 ms.
- Only color, opacity, or bounded progress movement is animated.
- `prefers-reduced-motion` reduces all animation and smooth scrolling.

## State language

Every important state uses at least two of:

- text
- icon
- border or shape
- color

Selection, playback, editing, warning, and error must not be represented by color alone.

