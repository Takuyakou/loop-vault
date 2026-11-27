<!-- phase-id: 5.17 -->

# Contract 01 — UX

Binding UX rules for Record & Compare. Detail beyond the brief §10 lives here.

## Flow

`Listen → Sing → Think → Record Setup → Count-in → Play/Record → Listen Back →
Review`. Record & Compare is optional at every entry; the user can always
continue with the classic no-recording flow.

## Record Setup

Shows, at minimum: whether to use Record & Compare; input device; input channel;
input level; clip warning; recordable state; permission state; and an explicit
"continue without recording" choice. Microphone permission is requested **only**
when the user enables recording — never on app start or on opening Bass Practice.

## Input channel

Selectable: Auto, Left / Input 1, Right / Input 2, Mono Sum. Result is treated as
mono. **Auto** rule (must be documented and testable): pick the channel with the
higher short-window RMS above a noise floor during setup; if both are near
silence or ambiguous, fall back to Mono Sum and surface a manual picker. Auto
never silently records the wrong channel — on low confidence it asks.

## Count-in

Uses the existing tempo and meter. Recording starts after the count-in. Target
audio is not played during recording. Count-in is kept out of My Take as far as
possible; the start-timing error is measured and recorded (non-personal number
only). Rhythm Echo in-recording metronome, if offered, defaults OFF; ON shows a
headphones-recommended note.

## Listen Back

Provides: Hear Target, Hear My Take, Target → My Take, My Take → Target, Retake,
Discard, Keep Take, and proceed to Review. Target and My Take never play
simultaneously. If the user reaches Review without having heard My Take, force an
explicit choice: hear My Take, or skip listening back. No forced autoplay.

## Review

The classic self-review is preserved: Again / Hard / Good / Easy, existing
weakness tags, existing free text if present. Recording and listen-back counts
are never converted into an ability score.

## Accessibility (summary; full list in brief §17)

Keyboard-only operation; focus retained across record start/stop and after the
permission dialog; recording state via ARIA live; level meter has a text
alternative; clip state not by color alone; destructive delete confirmed; reduced
motion suppresses meter animation; 200% scale and 320px width keep primary
actions usable; no focus trap.
