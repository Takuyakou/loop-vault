# Contract 07 — Voicing Loop Integration

P5.31 reuses P5.30.

Protected behavior:

- direct Practice/Voicing Loop navigation;
- current source selection flow;
- fixed-size slim progression cards;
- selected/current cards do not resize;
- moving playhead;
- card click auditions but does not seek;
- `お手本音` / reference-sound control;
- Current/Next;
- pitch/degree;
- keyboard;
- Learn/Recall;
- BPM/count-in/metronome;
- Pause/Resume/Restart/Stop;
- loop count;
- single musical clock;
- no scoring.

New control-token behavior:

- `%` must trigger reference attack;
- `=` must not trigger a new reference attack;
- `_` must be silent and visually honest;
- playhead continues through all spans.
