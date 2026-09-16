# Contract 15 — Keyboard / Transport Layout

## Stable keyboard

Voicing Loop SHALL render one shared keyboard geometry:

```text
88 keys
A0–C8
```

across all sources, study categories and candidates.

The following are invariant:

- key count;
- first/last note;
- key coordinates;
- keyboard width;
- keyboard height;
- octave-label coordinate system.

The following may vary:

- active-note highlight;
- LEFT/RIGHT color;
- fingering badge;
- live MIDI pressed state;
- pedal state.

Forbidden:

- active-range zoom;
- cropping to currently used notes;
- 61-key vs 88-key mode changes;
- source-dependent keyboard size;
- candidate-dependent keyboard size.

## Dead-space removal

The keyboard panel height must fit:

1. keyboard header;
2. physical key surface;
3. compact legend/input state.

Do not reserve a large empty black canvas below the keys.

## Transport

Use reclaimed vertical space to improve Transport usability.

Preferred desktop proportions, subject to existing tokens:

- Transport surface ~48–56 px;
- Start ~38–42 px, primary;
- secondary action controls ~34–38 px.

Do not increase total page height to achieve this.

No musical behavior change:

- same Practice Clock;
- same Start/Pause/Restart/Stop semantics;
- same reference sound;
- same metronome;
- same MIDI connection behavior.

## Automated regression

At each relevant source/study/candidate:

- key count = 88;
- A0/C8 endpoints present;
- keyboard bounding box equal within stable CSS/layout tolerance;
- representative C4 key x-coordinate equal;
- no keyboard-local overflow on normal desktop;
- no page scroll;
- Transport fully visible and operable.
