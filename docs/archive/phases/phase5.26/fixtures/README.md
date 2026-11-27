# P5.26 Fixture Contract

## Inherited
P5.24 A-K remain authoritative and unchanged.

## New L-Q
L — Am6 + passing F# bass → one state
M — true Am6 → F#m7b5 → split
N — Amaj9 + passing G# bass → one state
O — true Amaj9 → Amaj9/G# → structural change preserved
P — G#7(b13) + passing F# bass → one state
Q — true G#7 → F#13 → split

## Synthetic 8-bar
Expected:
1 E6/9
2 G#7(b13)
3a C#m9
3b Cmaj7
4a Bm9
4b E13
5 Amaj9
6 Am6
7a E/G#
7b C#7(b9)
8a F#m9
8b Amaj7/B

Ground truth must be layered, not only final strings.
Real user MIDI must not be committed.
