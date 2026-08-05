<!-- phase-id: 5.17 -->

# Phase 5.17 — Work Instructions

Distilled, tracked spec for Record & Compare. The originating long-form brief is
[`Phase-5.17-Claude-Code-Instructions.md`](Phase-5.17-Claude-Code-Instructions.md);
this file plus the contracts are the working canon. Where they add detail, the
contracts win; where safety is concerned, the root `AGENTS.md` wins.

## Goal

In Bass Practice, let the user record their own bass playing, hear Target and My
Take back to back, and then self-review exactly as today. The recording is a
mirror for honest self-assessment — never a grader.

## Scope

- Record & Compare available in all three existing modes (Degree Echo, Rhythm
  Echo, Bassline Echo) through one shared recording domain, controller and UI —
  no per-mode duplication.
- UX flow: Listen → Sing → Think → Record Setup → Count-in → Play/Record →
  Listen Back → Review. See [`contracts/01-ux-contract.md`](contracts/01-ux-contract.md).
- Capture stack behind explicit boundaries (`PracticeRecorder`,
  `CaptureDeviceRepository`, `RecordingSessionController`,
  `RecordingTakeRepository`, `RecordingCapability`) with browser/Tauri and fake
  implementations. UI never touches `navigator.mediaDevices` / `MediaRecorder`
  directly. See [`contracts/04-state-machine-contract.md`](contracts/04-state-machine-contract.md).
- Input device / channel selection (Auto, Left/Input 1, Right/Input 2, Mono Sum)
  for interfaces like MOTU M4; recording treated as mono. Input level meter
  (RMS + peak), clip warning, no color-only signalling.
- Ephemeral-by-default takes; explicit **Keep Take** persists to a binary store
  separate from the Vault. Saved takes replay/delete from Practice History. See
  [`contracts/02-storage-contract.md`](contracts/02-storage-contract.md).
- Independent feature flag `enableBassPracticeRecordCompare` with local `false`
  rollback; final production default `true`.
- Recording failure disables only recording and returns to the normal
  self-review; it never abandons the Practice session.
- Accessibility, 200% scale, 320px width, reduced motion, keyboard-only.
- Privacy: local-only, no cloud, no analysis, no scoring. See
  [`contracts/03-privacy-contract.md`](contracts/03-privacy-contract.md).

## Non-goals

Explicitly out of P5.17 (do not implement): pitch detection, onset detection,
rhythm/duration/mute scoring, automatic score/level/accuracy, note-name
inference, audio→MIDI, general transcription, DI/mic auto-grading, chord
accompaniment, tempo ramp, teaching from source MIDI basslines, Root Motion
Echo, position-constraint judging, Chord Dojo joint sessions, notation, cloud
save, recording sharing, real-time effects, app-side real-time monitoring,
waveform editing, noise reduction, compressor/EQ processing of the played audio.

Input level metering, clip detection, L/R channel selection and mono-summing are
permitted because they are required for recording to work at all.

## Stages

Mirror of the README stage list; per-stage implementation ranges are in the
brief §19 and refined by the contracts. Summary:

- **P5.17-00** — Workflow / Audit / Contract / Baseline. **Done** (this stage).
- **P5.17-01** — Capture Foundation.
- **P5.17-02** — Session Flow Integration (3 modes).
- **P5.17-03** — Persistence / History.
- **P5.17-04** — Product Hardening.
- **P5.17-05** — Release Gates / Acceptance → stop for hardware.

## Definition of Done

- Every listed gate in the brief §23 passes, split into P5.17-specific gates and
  repository-wide gates, with known P5.15 exceptions reported honestly.
- Resource benchmark (brief §22) shows zero leaked tracks/recorders/Blob URLs and
  no unbounded growth after 20× retake/start-stop, mode switches and route
  leaves.
- Protected surfaces clean: no tracked recordings/MIDI, no `.local-evaluation`,
  no personal absolute paths, no Vault schema/mutation diff, no P5.15 diff,
  `docs/CURRENT_STATE.md` not revived.
- Product Acceptance report written with the human MOTU M4 checklist (brief §25).
- Final determination is one of: `READY FOR HARDWARE ACCEPTANCE — Record &
  Compare` / `BLOCKED — recording capability unavailable` / `FAIL — Record &
  Compare is not production-safe`. Stop; do not merge or push.

## Stop conditions

Stop and report (without discarding changes) on any brief §27 condition — most
relevant here: recording APIs unavailable in the target runtime, microphone
permission not configurable in production Tauri (WebView2), a change that would
require importing P5.15 or mutating the Vault schema, real audio or personal
data entering Git or a report, an unresolvable resource leak, or recording
failure breaking the whole Practice session.

## Safety

Root [`AGENTS.md`](../../AGENTS.md) is canonical. Never auto-merge, never push,
never `git add -A`, never commit generated audio / MIDI / `.local-evaluation` /
personal paths, and never advance past the assigned stage.
