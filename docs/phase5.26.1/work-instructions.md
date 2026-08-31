<!-- phase-id: 5.26.1 -->

# Phase 5.26.1 — Work Instructions

## Goal

Source MIDI由来のharmonic segmentにsource voicingがある場合、Captureのcard
playbackとfull playbackで同じMIDI pitch / octave配置を再生する。

## Scope

- 現在のcard/full playback、voicing state、fallback、Track A ON/OFFを監査する。
- source voicingありsegmentではfull playbackもsource voicingを優先する。
- source voicingなしsegmentでは既存generated voicingを維持する。
- card/fullのvoicing source選択を既存の安全な共通helperへ寄せる。
- one/two-state bar、boundary crossing、anticipation、sustain、Bass先行、simultaneous、
  missing source、Track A OFF/ON、determinismをsynthetic testsで固定する。

## Non-goals

- Analyzer、chord detection、b9/b13 production ranking、chord namingの変更
- 音源engine、MIDI program、tempo、quantizationの変更
- source MIDIのpitch/timing mutation
- Vault schema、fileVersion、migration、UI redesign

## Contracts

- Source voicing available: `Card Playback Voicing == Full Playback Voicing`.
- Equality requires MIDI pitch and octave placement.
- Source voicing unavailable: existing generated voicing fallback.
- Source note arrays and segment boundaries are not mutated.
- Track A OFF/ON outputs resolve voicing by event identity, not stale array index.
- Preview以外のplayback paths、persistence、exportは変更しない。
- Tone/timbre fidelity is out of scope.

## Stage

### P5.26.1-00 — Audit, implementation, and focused acceptance

1. Audit current Card and Full data flow.
2. Implement a shared timeline voicing map using the existing resolver.
3. Add synthetic source/fallback/boundary/Track A/determinism tests.
4. Run focused unit and playback regression tests.
5. Run TypeScript, lint, phase-docs, security, privacy and diff gates.
6. Commit only explicit task paths and stop without merge or push.

## Definition of Done

- Source-backed 12-segment synthetic fixture has 12/12 card/full pitch equality.
- Altered source voicings pass through without relying on generated chord vocabulary.
- Missing source voicing uses the existing generated result.
- Boundary and Track A OFF/ON coverage is deterministic with no stale mapping.
- Required gates are freshly recorded against the implementation commit.
- Worktree and index are clean.

## Safety

Follow root `AGENTS.md`. Do not commit external MIDI/audio, personal paths,
`.local-evaluation`, generated output, or unrelated changes. Do not merge or push.
