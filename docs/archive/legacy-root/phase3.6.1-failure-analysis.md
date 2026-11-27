# Phase 3.6.1 MIDI失敗分析

- Dataset: `7991f80e29b76717af3fbeee5840a158a83cc387d73f9b73fdf2731afc70f3a6`
- Cases: 100
- Expected segments: 1058
- Legacy wrong: 918
- Raw hybrid wrong: 919
- Expected absent from Top-K: 822
- Expected root absent from Top-K: 336
- Expected root + quality absent from Top-K: 520
- Expected in Top-K but hybrid selected another chord: 97

## Category Representatives

| Category | Case | Legacy corrections | Hybrid corrections | Missing from Top-K |
|---|---|---:|---:|---:|
| arpeggio | bossa-dusk-b-minor-9010 | 23 | 23 | 21 |
| chord-drip | tokyo-minor-loop-d-major-9007 | 23 | 23 | 22 |
| chord-only | tokyo-minor-loop-d-major-9007 | 23 | 23 | 22 |
| no-bass | shibuya-fusion-pop-g-minor-9010 | 10 | 11 | 10 |
| pad | tokyo-minor-loop-f-minor-9010 | 18 | 19 | 17 |
| rootless | shibuya-fusion-pop-g-minor-9010 | 10 | 11 | 10 |

## arpeggio: bossa-dusk-b-minor-9010

Recipe family: `bossa-dusk:dark-jazz`

### Beats 0-2

Expected: **Dm9(11)/C** / Legacy: **C** / Hybrid: **Cadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Cadd9 | 0.8805 | 0.7405 | 0.5072 | 0.22 | -0.08 | 0 | 0 |
| 2 | C | 0.8805 | 0.7405 | 0.5072 | 0.22 | -0.08 | 0 | 0 |
| 3 | Gsus4/C | 0.726 | 0.7816 | 0.8318 | 0.06 | -0.08 | 0.0706 | 0 |
| 4 | C7 | 0.7138 | 0.7405 | 0.5072 | 0.22 | -0.08 | 0 | 0.1667 |
| 5 | Cmaj7 | 0.7138 | 0.7405 | 0.5072 | 0.22 | -0.08 | 0 | 0.1667 |

### Beats 2-4

Expected: **C#m9/B** / Legacy: **Badd9** / Hybrid: **Bsus2**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Bsus2 | 1.1255 | 0.9165 | 0.8817 | 0.22 | 0.08 | 0.0497 | 0 |
| 2 | Badd9 | 0.9792 | 0.6792 | 0.4776 | 0.22 | 0.08 | 0 | 0 |
| 3 | C#m9/B | 0.8158 | 0.8475 | 0.8817 | 0.06 | 0.08 | 0 | 0.1667 |
| 4 | C#m7/B | 0.7848 | 0.8262 | 0.8817 | 0.06 | 0.08 | 0.0497 | 0.1667 |
| 5 | C#m11/B | 0.7758 | 0.8475 | 0.8817 | 0.06 | 0.08 | 0 | 0.1667 |

### Beats 4-8

Expected: **F#13sus** / Legacy: **F#13** / Hybrid: **F#7sus4**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F#7sus4 | 1.0514 | 0.8222 | 0.8312 | 0.22 | 0.08 | 0.0709 | 0 |
| 2 | Esus2/F# | 0.756 | 0.6519 | 0.6106 | 0.06 | 0.08 | 0.0709 | 0 |
| 3 | Bsus4/F# | 0.6571 | 0.612 | 0.608 | 0.06 | 0.08 | 0.0709 | 0 |
| 4 | F#13 | 0.6323 | 0.6716 | 0.6106 | 0.22 | 0.08 | 0.0927 | 0.1667 |
| 5 | Emaj9/F# | 0.6157 | 0.6474 | 0.5561 | 0.06 | 0.08 | 0 | 0.1667 |

### Beats 8-10

Expected: **Cmaj7(9)/E** / Legacy: **Em7** / Hybrid: **Eaug**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Eaug | 0.7762 | 0.7604 | 0.7201 | 0.22 | 0.08 | 0.1176 | 0.1667 |
| 2 | Cadd9/E | 0.7464 | 0.7314 | 0.7201 | 0.06 | -0.08 | 0 | 0 |
| 3 | E7 | 0.5943 | 0.6401 | 0.5734 | 0.22 | 0.08 | 0.1792 | 0.1667 |
| 4 | E7sus4 | 0.5943 | 0.6401 | 0.5734 | 0.22 | 0.08 | 0.1792 | 0.1667 |
| 5 | C/E | 0.5785 | 0.6811 | 0.7201 | 0.06 | -0.08 | 0.1176 | 0 |

### Beats 10-12

Expected: **Bmaj9/D#** / Legacy: **Ebm7** / Hybrid: **Ebaug**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Ebaug | 0.9535 | 0.7843 | 0.8195 | 0.22 | 0.025 | 0.0758 | 0 |
| 2 | Baug/Eb | 0.8776 | 0.7784 | 0.8195 | 0.06 | 0.08 | 0.0758 | 0 |
| 3 | Badd9/Eb | 0.7048 | 0.625 | 0.5929 | 0.06 | 0.08 | 0.0952 | 0 |
| 4 | Gaug/Eb | 0.6676 | 0.7284 | 0.8195 | 0.06 | -0.08 | 0.0758 | 0 |
| 5 | Eb7 | 0.6472 | 0.5817 | 0.5725 | 0.22 | 0.025 | 0.1795 | 0 |

### Beats 12-16

Expected: **E6/9/B** / Legacy: **Bm11** / Hybrid: **F#sus4**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F#sus4 | 1.0631 | 0.7631 | 0.726 | 0.22 | 0.08 | 0 | 0 |
| 2 | C#7sus4/F# | 0.998 | 0.878 | 1 | 0.06 | 0.025 | 0 | 0 |
| 3 | Bsus2/F# | 0.9336 | 0.7586 | 0.5699 | 0.06 | 0.08 | 0 | 0 |
| 4 | F#7sus4 | 0.8965 | 0.7631 | 0.726 | 0.22 | 0.08 | 0 | 0.1667 |
| 5 | C#sus4/F# | 0.6311 | 0.6354 | 0.7041 | 0.06 | 0.025 | 0.1243 | 0 |


## chord-drip: tokyo-minor-loop-d-major-9007

Recipe family: `tokyo-minor-loop:wide-emotional`

### Beats 0-4

Expected: **Gmaj7** / Legacy: **G** / Hybrid: **Gadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Gadd9 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | G | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 3 | Gsus2 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | Gsus4 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Gm | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 4-8

Expected: **F#7(9)** / Legacy: **F#** / Hybrid: **F#m7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F#m | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | F#add9 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 3 | F# | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 4 | F#sus2 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 5 | F#sus4 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 8-12

Expected: **Bm7/F#** / Legacy: **F#** / Hybrid: **F#m**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F#m | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | F#add9 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 3 | F# | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 4 | F#sus2 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 5 | F#sus4 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 12-14

Expected: **Am7(11)/E** / Legacy: **Edim** / Hybrid: **Em**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Em | 1.425 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0 |
| 2 | Edim | 1.2583 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 3 | Em6 | 1.2583 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 4 | Em7 | 1.2583 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 5 | Em9 | 1.2183 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |

### Beats 14-16

Expected: **D7** / Legacy: **D** / Hybrid: **Dadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Dadd9 | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | D | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 3 | Dsus2 | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | Dsus4 | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Dm | 1.0462 | 1.0512 | 0.8671 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 16-20

Expected: **Gmaj7/D** / Legacy: **D** / Hybrid: **Dadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Dadd9 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | D | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 3 | Dsus2 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | Dsus4 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Dm | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |


## chord-only: tokyo-minor-loop-d-major-9007

Recipe family: `tokyo-minor-loop:wide-emotional`

### Beats 0-4

Expected: **Gmaj7** / Legacy: **G** / Hybrid: **Gadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Gadd9 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | G | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 3 | Gsus2 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | Gsus4 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Gm | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 4-8

Expected: **F#7(9)** / Legacy: **F#** / Hybrid: **F#m7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F#m | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | F#add9 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 3 | F# | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 4 | F#sus2 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 5 | F#sus4 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 8-12

Expected: **Bm7/F#** / Legacy: **F#** / Hybrid: **F#m**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F#m | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | F#add9 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 3 | F# | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 4 | F#sus2 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |
| 5 | F#sus4 | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 12-14

Expected: **Am7(11)/E** / Legacy: **Edim** / Hybrid: **Em**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Em | 1.425 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0 |
| 2 | Edim | 1.2583 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 3 | Em6 | 1.2583 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 4 | Em7 | 1.2583 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 5 | Em9 | 1.2183 | 1.125 | 1 | 0.22 | 0.08 | 0 | 0.1667 |

### Beats 14-16

Expected: **D7** / Legacy: **D** / Hybrid: **Dadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Dadd9 | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | D | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 3 | Dsus2 | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | Dsus4 | 1.1012 | 1.0512 | 0.8671 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Dm | 1.0462 | 1.0512 | 0.8671 | 0.22 | 0.025 | 0 | 0.25 |

### Beats 16-20

Expected: **Gmaj7/D** / Legacy: **D** / Hybrid: **Dadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Dadd9 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 2 | D | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 3 | Dsus2 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | Dsus4 | 1.19 | 1.14 | 1 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Dm | 1.135 | 1.14 | 1 | 0.22 | 0.025 | 0 | 0.25 |


## no-bass: shibuya-fusion-pop-g-minor-9010

Recipe family: `shibuya-fusion-pop:rootless-jazz`

### Beats 0-4

Expected: **Cmaj7** / Legacy: **C** / Hybrid: **Cadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Gsus4/C | 1.0718 | 0.8968 | 1 | 0.06 | 0.08 | 0 | 0 |
| 2 | G7sus4/C | 0.9051 | 0.8968 | 1 | 0.06 | 0.08 | 0 | 0.1667 |
| 3 | Cadd9 | 0.89 | 0.84 | 0.5867 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | C | 0.89 | 0.84 | 0.5867 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Csus2 | 0.89 | 0.84 | 0.5867 | 0.22 | 0.08 | 0 | 0.25 |

### Beats 4-6

Expected: **B7(9,13)** / Legacy: **B7** / Hybrid: **B7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | B7 | 1.2471 | 1.0021 | 1 | 0.22 | 0.025 | 0 | 0 |
| 2 | B9 | 1.2071 | 1.0021 | 1 | 0.22 | 0.025 | 0 | 0 |
| 3 | B13 | 1.1671 | 1.0021 | 1 | 0.22 | 0.025 | 0 | 0 |
| 4 | Bm7 | 0.8187 | 0.8388 | 0.8008 | 0.22 | 0.08 | 0.0837 | 0.1667 |
| 5 | Asus2/B | 0.79 | 0.7537 | 0.8008 | 0.06 | 0.025 | 0.0837 | 0 |

### Beats 6-8

Expected: **Baug** / Legacy: **Baug** / Hybrid: **Badd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Badd9 | 1.3392 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0 |
| 2 | B | 1.3392 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0 |
| 3 | Baug | 1.1725 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0.1667 |
| 4 | B7 | 1.1725 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0.1667 |
| 5 | Bmaj7 | 1.1725 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0.1667 |

### Beats 8-12

Expected: **Em7(9)** / Legacy: **E7** / Hybrid: **Em7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Em7 | 1.1282 | 0.8282 | 0.6787 | 0.22 | 0.08 | 0 | 0 |
| 2 | Em9 | 1.0882 | 0.8282 | 0.6787 | 0.22 | 0.08 | 0 | 0 |
| 3 | Em11 | 1.0482 | 0.8282 | 0.6787 | 0.22 | 0.08 | 0 | 0 |
| 4 | G6/E | 0.9699 | 0.7949 | 0.869 | 0.06 | 0.08 | 0 | 0 |
| 5 | Em | 0.9657 | 0.7207 | 0.5477 | 0.22 | 0.08 | 0.055 | 0 |

### Beats 12-14

Expected: **A7(9,13)** / Legacy: **A13** / Hybrid: **A6/9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | A6/9 | 0.874 | 0.7447 | 0.6956 | 0.22 | 0.025 | 0.0413 | 0 |
| 2 | A6 | 0.7904 | 0.7077 | 0.6956 | 0.22 | 0.025 | 0.1279 | 0 |
| 3 | A13 | 0.7895 | 0.6245 | 0.48 | 0.22 | 0.025 | 0 | 0 |
| 4 | A9 | 0.6411 | 0.5679 | 0.48 | 0.22 | 0.025 | 0.1319 | 0 |
| 5 | Gmaj9/A | 0.6344 | 0.5689 | 0.6184 | 0.06 | 0.08 | 0.0695 | 0 |

### Beats 14-16

Expected: **D13sus** / Legacy: **D7sus4** / Hybrid: **D7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | D7 | 1.2205 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 2 | D7sus4 | 1.2205 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 3 | D9 | 1.1805 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 4 | Dm7 | 1.1655 | 1.0872 | 1 | 0.22 | 0.025 | 0 | 0.1667 |
| 5 | D13 | 1.1405 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |


## pad: tokyo-minor-loop-f-minor-9010

Recipe family: `tokyo-minor-loop:dark-jazz`

### Beats 2-4

Expected: **Bdim7** / Legacy: **Bm7b5** / Hybrid: **Bm7b5/F**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Bm7b5/F | 0.992 | 0.977 | 1 | 0.06 | -0.08 | 0 | 0 |
| 2 | Dm6/F | 0.9343 | 0.7593 | 0.7869 | 0.06 | 0.08 | 0 | 0 |
| 3 | Bdim/F | 0.7277 | 0.8022 | 0.7869 | 0.06 | -0.08 | 0.0895 | 0 |
| 4 | F6 | 0.7271 | 0.5786 | 0.6393 | 0.22 | 0.08 | 0.1515 | 0 |
| 5 | F6/9 | 0.6871 | 0.5786 | 0.6393 | 0.22 | 0.08 | 0.1515 | 0 |

### Beats 4-8

Expected: **A7(13,b9)** / Legacy: **A13** / Hybrid: **A13/F#**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | A13/F# | 0.551 | 0.6017 | 0.5685 | 0.06 | 0.025 | 0.0906 | 0 |
| 2 | A6/F# | 0.4261 | 0.5628 | 0.5685 | 0.06 | 0.025 | 0.1812 | 0 |
| 3 | Gdim | 0.4185 | 0.5866 | 0.6473 | -0.1 | 0.08 | 0.1481 | 0 |
| 4 | F#add9 | 0.414 | 0.4701 | 0.4315 | 0.22 | -0.08 | 0.1481 | 0 |
| 5 | F# | 0.414 | 0.4701 | 0.4315 | 0.22 | -0.08 | 0.1481 | 0 |

### Beats 16-18

Expected: **Bbmaj7/F** / Legacy: **Bbmaj7/F** / Hybrid: **F6**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F6 | 1.0254 | 0.8131 | 0.7913 | 0.22 | 0.08 | 0.0876 | 0 |
| 2 | F6/9 | 0.9854 | 0.8131 | 0.7913 | 0.22 | 0.08 | 0.0876 | 0 |
| 3 | Bbmaj7/F | 0.845 | 0.67 | 0.626 | 0.06 | 0.08 | 0 | 0 |
| 4 | Bbmaj9/F | 0.805 | 0.67 | 0.626 | 0.06 | 0.08 | 0 | 0 |
| 5 | Fadd9 | 0.7667 | 0.642 | 0.5827 | 0.22 | 0.08 | 0.1753 | 0 |

### Beats 18-20

Expected: **Bdim7/F** / Legacy: **Bm7b5/F** / Hybrid: **F6**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | F6 | 1.0127 | 0.8022 | 0.7869 | 0.22 | 0.08 | 0.0895 | 0 |
| 2 | F6/9 | 0.9727 | 0.8022 | 0.7869 | 0.22 | 0.08 | 0.0895 | 0 |
| 3 | Dm6/F | 0.9343 | 0.7593 | 0.7869 | 0.06 | 0.08 | 0 | 0 |
| 4 | Bm7b5/F | 0.8893 | 0.8743 | 1 | 0.06 | -0.08 | 0 | 0 |
| 5 | Fdim7 | 0.7581 | 0.8022 | 0.7869 | 0.22 | 0.025 | 0.0895 | 0.125 |

### Beats 20-24

Expected: **A7(9,b13,#11)/E** / Legacy: **Em6** / Hybrid: **Em6**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Em6 | 0.5492 | 0.5154 | 0.4676 | 0.22 | 0.025 | 0.1491 | 0 |
| 2 | G13/E | 0.3953 | 0.5044 | 0.5324 | 0.06 | 0.025 | 0.1491 | 0 |
| 3 | Em | 0.3913 | 0.3699 | 0.2901 | 0.22 | 0.025 | 0.2236 | 0 |
| 4 | C#m7b5/E | 0.3803 | 0.5765 | 0.6451 | 0.06 | -0.08 | 0.1491 | 0 |
| 5 | Edim7 | 0.3 | 0.4657 | 0.4676 | 0.22 | 0.025 | 0.2236 | 0.125 |

### Beats 24-28

Expected: **Dm7(9)/F** / Legacy: **Dm9/F** / Hybrid: **Dm9/F**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Dm9/F | 0.8734 | 0.7384 | 0.7913 | 0.06 | 0.08 | 0 | 0 |
| 2 | Dm11/F | 0.8334 | 0.7384 | 0.7913 | 0.06 | 0.08 | 0 | 0 |
| 3 | Dm7/F | 0.7882 | 0.7008 | 0.7913 | 0.06 | 0.08 | 0.0876 | 0 |
| 4 | Fmaj7 | 0.7461 | 0.7004 | 0.5827 | 0.22 | 0.08 | 0.0876 | 0.1667 |
| 5 | Fmaj9 | 0.7061 | 0.7004 | 0.5827 | 0.22 | 0.08 | 0.0876 | 0.1667 |


## rootless: shibuya-fusion-pop-g-minor-9010

Recipe family: `shibuya-fusion-pop:rootless-jazz`

### Beats 0-4

Expected: **Cmaj7** / Legacy: **C** / Hybrid: **Cadd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Gsus4/C | 1.0718 | 0.8968 | 1 | 0.06 | 0.08 | 0 | 0 |
| 2 | G7sus4/C | 0.9051 | 0.8968 | 1 | 0.06 | 0.08 | 0 | 0.1667 |
| 3 | Cadd9 | 0.89 | 0.84 | 0.5867 | 0.22 | 0.08 | 0 | 0.25 |
| 4 | C | 0.89 | 0.84 | 0.5867 | 0.22 | 0.08 | 0 | 0.25 |
| 5 | Csus2 | 0.89 | 0.84 | 0.5867 | 0.22 | 0.08 | 0 | 0.25 |

### Beats 4-6

Expected: **B7(9,13)** / Legacy: **B7** / Hybrid: **B7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | B7 | 1.2471 | 1.0021 | 1 | 0.22 | 0.025 | 0 | 0 |
| 2 | B9 | 1.2071 | 1.0021 | 1 | 0.22 | 0.025 | 0 | 0 |
| 3 | B13 | 1.1671 | 1.0021 | 1 | 0.22 | 0.025 | 0 | 0 |
| 4 | Bm7 | 0.8187 | 0.8388 | 0.8008 | 0.22 | 0.08 | 0.0837 | 0.1667 |
| 5 | Asus2/B | 0.79 | 0.7537 | 0.8008 | 0.06 | 0.025 | 0.0837 | 0 |

### Beats 6-8

Expected: **Baug** / Legacy: **Baug** / Hybrid: **Badd9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Badd9 | 1.3392 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0 |
| 2 | B | 1.3392 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0 |
| 3 | Baug | 1.1725 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0.1667 |
| 4 | B7 | 1.1725 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0.1667 |
| 5 | Bmaj7 | 1.1725 | 1.0942 | 1 | 0.22 | 0.025 | 0 | 0.1667 |

### Beats 8-12

Expected: **Em7(9)** / Legacy: **E7** / Hybrid: **Em7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Em7 | 1.1282 | 0.8282 | 0.6787 | 0.22 | 0.08 | 0 | 0 |
| 2 | Em9 | 1.0882 | 0.8282 | 0.6787 | 0.22 | 0.08 | 0 | 0 |
| 3 | Em11 | 1.0482 | 0.8282 | 0.6787 | 0.22 | 0.08 | 0 | 0 |
| 4 | G6/E | 0.9699 | 0.7949 | 0.869 | 0.06 | 0.08 | 0 | 0 |
| 5 | Em | 0.9657 | 0.7207 | 0.5477 | 0.22 | 0.08 | 0.055 | 0 |

### Beats 12-14

Expected: **A7(9,13)** / Legacy: **A13** / Hybrid: **A6/9**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | A6/9 | 0.874 | 0.7447 | 0.6956 | 0.22 | 0.025 | 0.0413 | 0 |
| 2 | A6 | 0.7904 | 0.7077 | 0.6956 | 0.22 | 0.025 | 0.1279 | 0 |
| 3 | A13 | 0.7895 | 0.6245 | 0.48 | 0.22 | 0.025 | 0 | 0 |
| 4 | A9 | 0.6411 | 0.5679 | 0.48 | 0.22 | 0.025 | 0.1319 | 0 |
| 5 | Gmaj9/A | 0.6344 | 0.5689 | 0.6184 | 0.06 | 0.08 | 0.0695 | 0 |

### Beats 14-16

Expected: **D13sus** / Legacy: **D7sus4** / Hybrid: **D7**

| Rank | Chord | Total | Template | Core | Bass | Key | Foreign penalty | Missing-core penalty |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | D7 | 1.2205 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 2 | D7sus4 | 1.2205 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 3 | D9 | 1.1805 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |
| 4 | Dm7 | 1.1655 | 1.0872 | 1 | 0.22 | 0.025 | 0 | 0.1667 |
| 5 | D13 | 1.1405 | 1.0872 | 1 | 0.22 | 0.08 | 0 | 0.1667 |


## Reading the result

- Exact-label absence can include unsupported tension or slash notation, so root and root + quality counts must be read alongside it.
- Root absence is a candidate-generation/scoring failure.
- Expected root + quality in Top-K but another chord selected is primarily a temporal decoding/reranking failure.
- This report uses raw hybrid decisions, not the product integration that keeps legacy primary chords.
