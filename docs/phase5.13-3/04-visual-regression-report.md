# Phase 5.13-3 Visual Regression Report

## Evidence

Before:

- `artifacts/phase5.13-3/before/live-midi-window.png`
- `artifacts/phase5.13-3/before/chord-dojo-bottom-clipped.png`

After:

- `artifacts/phase5.13-3/after/live-midi-and-main.png`
- `artifacts/phase5.13-3/after/chord-dojo-bottom.png`
- `artifacts/phase5.13-3/after/chord-dojo-1024x720-bottom.png`
- `artifacts/phase5.13-3/after/chord-dojo-1440x900-bottom.png`
- `artifacts/phase5.13-3/after/chord-dojo-1920x1080-bottom.png`

Animations were disabled and font loading was awaited by Playwright.

## Intentional differences

- Main content remains present behind the Live MIDI auxiliary surface.
- The former conditional music-note icon is replaced by a persistent two-channel
  level meter.
- Top-bar order is level meter, master-volume knob, piano icon and sound selector,
  Idea, save state.
- The level meter retains the previous global-stop command while playback is
  active and keeps toolbar width stable while idle.
- At 1024px Dojo is vertically stacked. At 1280px and wider it uses the queue and
  workspace columns.
- The Dojo screenshot is taken at the actual bottom and includes the complete
  keyboard, legend, final controls, and bottom spacing.

No threshold was enlarged to hide differences. The nine checked visual snapshots
were regenerated because the persistent top-bar meter is intentionally visible on
every route.
