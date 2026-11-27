# Phase 5.13-3 Chord Dojo Layout Report

## Root cause

The Practice route disabled the route-level scroll container. Inside the clipped
route, both the queue and the right workspace created independent scrolling
containers under a height-constrained grid. The right pane could not reliably
reach its keyboard legend and final controls, while `overscroll-contain` trapped
wheel input over the queue.

## Implemented scroll contract

```text
App Shell (viewport, overflow hidden)
└ Main column
  ├ Top bar (fixed height)
  └ #main-content (single main vertical scroll container)
    └ Practice page (auto height, bottom padding)
      ├ Queue (bounded independent overflow-y)
      └ Dojo workspace (normal document flow)
```

- `#main-content` now remains the main vertical scroll container for Practice.
- The Dojo grid and right workspace no longer clip or own a second main scroll.
- The queue keeps bounded independent scrolling, but no longer uses
  `overscroll-contain`; wheel input chains to the page at the queue boundary.
- Practice adds bottom padding and an end marker used by keyboard/viewport tests.
- At 1024px the queue and workspace stack vertically. The two-column layout begins
  at 1280px, avoiding the 3px overflow found by the first Playwright run.
- Typography, piano size, scoring, voicing, playback requests, and practice
  information architecture were not reduced or rewritten.

## Viewport measurements

| Viewport | clientHeight | scrollHeight | final scrollTop | Horizontal overflow | End visible |
| --- | ---: | ---: | ---: | ---: | --- |
| 1024x720 | 652 | 1734 | 1081 | 0px | yes |
| 1280x720 | 652 | 1454 | 798 | 0px | yes |
| 1366x768 | 700 | 1454 | 721 | 0px | yes |
| 1440x900 | 832 | 1332 | 500 | 0px | yes |
| 1920x1080 | 1012 | 1313 | 289 | 0px | yes |

The 1280x720 run also verified that wheel input over a queue already at its bottom
increases the main scroll position. PageDown and End reached the final marker in
all five viewport sizes. Exact measurements are in
`artifacts/phase5.13-3/after/viewport-metrics.json`.
