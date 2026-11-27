# Contract 04 — Playhead and Single Clock

The cyan playhead is a read-only visual projection of the existing P5.29 practice clock.

## Required behavior

- one timing source only;
- playhead crosses one fixed-width event card over that event's actual duration;
- 4-beat event takes four beats, 2-beat event two beats, 1-beat event one beat;
- Pause freezes the playhead at the exact position;
- Resume continues from that position;
- Restart returns using existing count-in semantics;
- Stop resets according to existing transport contract;
- loop wrap is deterministic and loop count remains coherent;
- BPM changes alter traversal speed via the existing clock, never via a second timer.

CURRENT/NEXT, beat indicator, progression position, loop count, and playhead must derive from the same transport state.

Do not add `setInterval`/independent animation timing as musical truth. `requestAnimationFrame` is acceptable only to render interpolated position from authoritative transport state.
