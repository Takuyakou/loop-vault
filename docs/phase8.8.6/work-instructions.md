<!-- phase-id: 8.8.6 -->

# Phase 8.8.6 — Work Instructions

## Goal

Close remaining Standard/Extended Text Capture presentation divergence and page-height overflow using the accepted canonical Capture mock as visual reference.

## Scope

- One shared status model for bars, annotations, meter, source BPM, key, diagnostics, practice limits, and save state.
- App-shell-owned Capture height with internal Editor and Preview scrolling.
- Standard/Extended shared toolbar, workspace, and footer geometry.
- Empty, short, and long synthetic layout/behavior regression tests.
- Local-only screenshots and final implementation report.

## Non-goals

Parser or semantic changes; transport changes; Vault changes; MIDI/analyzer changes; production promotion; executable packaging.

## Contracts

Pristine empty input has no diagnostics, an unset source BPM, disabled save, and the same reason in both readers. An explicit 120 BPM remains distinct from audition 120. At 1920x1080, 1600x900, 1440x900, and 1366x768, the Capture page and main content must have no vertical or horizontal overflow. Long Extended charts scroll within Preview and Editor while toolbar and status stay visible. Existing Standard input limits remain intact. Preserve accepted global font, timbre, metronome, and transport behavior.

## Stages

P8.8.6-00 audits Git, current UI, and ownership. P8.8.6-01 creates the shared status model. P8.8.6-02 transfers height ownership to the app shell. P8.8.6-03 closes shared geometry and legacy-panel drift. P8.8.6-04 tests state formatting. P8.8.6-05 tests responsive and long-scroll behavior. P8.8.6-06 runs fresh gates and captures local screenshots. P8.8.6-07 records the final candidate and stops before merge.

## Definition of Done

The listed visual states and regressions pass at final HEAD, with local-only screenshots and a tracked report. Each completed stage records a passing gate and commit hash. Root `AGENTS.md` governs safety and merge authorization.

## Safety

No private media, personal absolute paths, local-evaluation output, or synthetic source generated on the system drive enters Git. Do not merge or push in this stage.
