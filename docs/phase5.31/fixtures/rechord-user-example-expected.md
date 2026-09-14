# User fixture expected structure

Input: `rechord-user-example.txt`

Expected:

- bars: **16**
- chord attacks: **34**
- meter: 4/4
- bar 4: 4 cells => 1 beat each
- all other bars in this fixture: 2 cells => 2 beats each
- `Am9/C` occurs twice and preserves slash bass
- `B7(#9,#5)` preserves both alterations by chord identity
- no implicit rest/hold/re-strike in this fixture

Do not hard-code display spelling beyond the repository's existing canonical
label contract. Assert chord identity + timing.
