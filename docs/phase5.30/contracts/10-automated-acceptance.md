# Contract 10 — Automated Acceptance

## Text capacity tests

- exactly 32 bars: PASS
- 33 bars: deterministic rejection
- exactly 128 valid chord tokens: PASS
- 129: deterministic rejection
- input length boundary around 8192 UTF-16 units
- mixed 1/2/4 chord bars at long length
- 32-bar / 128-event parse → Draft → save → reload → Voicing Loop preservation
- no Vault schema/fileVersion change

## Timing/playhead tests

Keep the P5.29 fixture `4,2,2,4,4` as a required regression.

Verify:

- fixed timeline-card width/height is identical across inactive/current/focus/audition/playback states;
- 4-beat card traversal takes twice a 2-beat card and four times a 1-beat card at the same BPM;
- Pause/Resume/Restart/BPM/loop wrap are coherent;
- no independent musical timer introduced.

## Audio tests

For all five voicing selections:

- card activation auditions exact resolved pitches and does not seek;
- `お手本音` ON schedules one chord at each harmonic boundary;
- OFF schedules none;
- Source/Custom unavailable remains fail-closed;
- count-in, pause, resume, restart, stop, loop, source switch, route exit cleanup;
- rapid lifecycle stress has no duplicated scheduler/note/resource growth.

## UI/accessibility tests

- approved vertical ordering and controls present;
- 32-bar/128-event timeline does not resize cards or overflow page;
- horizontal timeline scrolling/auto-reveal works;
- keyboard only;
- 320 px;
- effective 200%;
- reduced motion;
- axe serious/critical 0.

## Final gates

Run the repository's canonical commands discovered in Stage00. At minimum include:

- focused unit/integration tests for changed domains;
- related/full Vitest suite appropriate to the repository;
- focused Playwright and relevant navigation/practice regression;
- production TypeScript;
- Playwright TypeScript;
- ESLint / Tailwind/source-contract lint if canonical;
- `git diff --check`;
- privacy/personal-path/tracked-private-media checks used by the repository;
- build if the repository's phase/release gate requires it.

All commands must finish without leaving tracked/generated diffs. Final `git status --short` must be empty.
