<!-- phase-id: 5.17 -->

# Contract 04 — Recorder state machine & resource lifecycle

The recorder is an explicit, separate state machine, parallel to the Practice
session reducer (`domain/stateMachine.ts`). A recording failure disables only
recording and returns to the classic self-review — it never drives the Practice
session to `abandoned`.

## Boundaries (no direct Web API in the UI)

- `RecordingCapability` — probes runtime API availability.
- `CaptureDeviceRepository` — enumerate/select devices, `devicechange`.
- `PracticeRecorder` — start/stop, codec, channel routing, mono capture, meter.
- `RecordingSessionController` — orchestrates Record Setup → … → Listen Back.
- `RecordingTakeRepository` — ephemeral + Keep Take persistence.

Each has a browser/Tauri implementation and a deterministic **fake** for tests;
normal tests never require a real microphone.

## States (brief §12)

`unavailable, idle, requesting-permission, permission-denied, device-missing,
ready, counting-in, starting, recording, stopping, recorded, playing-target,
playing-take, saving, saved, discarded, error`.

Forbidden transitions are explicit (e.g. no `recording → saved` without
`stopping → recorded`; no double-`start`; no play while `recording`). The machine
must survive: start/stop mashing; Stop immediately after start; Cancel during
count-in; tab/route/window changes while recording; device disconnect; permission
revocation; `MediaRecorder` error; Blob failure; Retake during playback; delete
during save; mode switch; feature-flag OFF.

## Codec negotiation

Do not hard-code one codec. Probe `MediaRecorder.isTypeSupported()`, confirm a
recording actually starts, store the MIME type on the take, confirm playback is
possible; if no codec works, disable only recording and keep Bass Practice
usable. Record the codec preference order and the chosen result in the P5.17-01
report.

## Live monitoring

The input stream is never connected to the speakers. App-side monitoring is out
of scope (latency/feedback); hardware Direct Monitor (MOTU M4) is assumed. The
level-meter `AnalyserNode` is never connected to `destination`.

## Resource lifecycle (must always release)

MediaStreamTrack, MediaRecorder callbacks, AudioContext nodes, AnalyserNode,
ChannelSplitter/Merger, MediaStreamDestination, intervals, timeouts, animation
frames, event listeners, Blob URLs.

Release on: Discard; Retake; Review completion; mode change; tab change; route
leave; component unmount; app close; permission loss; device disconnect;
feature-flag OFF. Repeated re-records must not grow streams, nodes, or Blob URLs.
The resource benchmark (brief §22) asserts zero leaked tracks/recorders/Blob URLs
and no unbounded growth.
