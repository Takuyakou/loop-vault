# P5.30 assumptions — verify, do not trust blindly

The user reports that P5.30 is complete.

This P5.31 package intentionally does not embed an assumed P5.30 commit hash.
Stage00 must inspect Git and the tracked P5.30 reports.

Expected protected outcomes from the preceding design discussion:

- Text capacity expanded beyond the old 12-bar/48-token limit;
- Voicing Loop remains directly reachable from the sidebar/Practice path;
- compact source selection UX remains;
- CURRENT/NEXT → progression timeline → keyboard flow;
- progression cards stay slim/fixed-size even when current;
- moving playhead;
- chord-card click auditions the chord and does not seek;
- reference-sound checkbox can sound the selected practice voicing;
- P5.29 timing is preserved.

If the actual repository differs, Git/report evidence wins. Record the
difference before P5.31 production changes.
