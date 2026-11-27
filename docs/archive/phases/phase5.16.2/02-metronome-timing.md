# P5.16.2-02 Metronome and Playback

## Delivered

- Added one immutable beat plan shared by count-in, optional phrase click, target trigger, and visual playhead.
- Added a scoped Tone Transport controller for muted target timbre, downbeat accent, one/two-bar count-in, start/stop replacement safety, and Synth disposal.
- Count-in remains audible when the phrase metronome is disabled; it is not part of the Listen count.

## Validation

| Check | Result |
|---|---:|
| Rhythm plan / PlaybackController / PracticeClock tests | 3 files / 19 tests PASS |
| ESLint + class lint | PASS |
| TypeScript | PASS |
| `git diff --check` | PASS |

## Next

P5.16.2-03 will connect Rhythm mode UI, Review, persistence, Home, History and keyboard/a11y behavior.
