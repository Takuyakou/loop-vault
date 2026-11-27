# Control fixture expected structure

Input:

```text
E 7%_A m7|=G
```

After comment removal and chord normalization:

Bar 1 has four 1-beat cells:
1. E7 attack
2. `%` => E7 re-attack
3. `_` => rest
4. Am7 attack

Bar 2 has two 2-beat cells:
1. `=` => hold Am7 for 2 more beats, no new attack
2. G attack for 2 beats

Canonical sounding timeline facts:

- E7 attack at beat 0, duration 1
- E7 attack at beat 1, duration 1
- rest beat 2..3
- Am7 attack at beat 3, total duration 3 (crosses bar line)
- G attack at beat 6, duration 2

Total musical length = 8 beats.
