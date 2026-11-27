<!-- phase-id: 5.17 -->

# Contract 05 — Test plan

Real bass and MOTU M4 are never a precondition for normal tests. Everything below
runs on deterministic fakes; hardware is only for the final human acceptance.

## Unit / component (Vitest)

Cover, at minimum (brief §21.1): capability available/unavailable; permission
prompt/denied; no device; device list; `devicechange`; codec selection and
no-codec; left / right / mono-sum channels; input meter; clip warning; state
transitions and forbidden transitions; double start / double stop; cancel during
count-in; stop-immediately-after-start; recorder error; Blob error; Retake;
Discard; Keep Take; route leave; tab leave; mode change; unmount; feature-flag
OFF; track stop; Blob URL revoke; timer cleanup; listener cleanup; quota
exceeded; storage failure; corrupt metadata; missing binary; orphan binary;
future storage version; History playback; History delete; no Vault mutation.

## Deterministic fake input

Script-generated, committed as code not audio: mono sine, stereo left-only,
stereo right-only, silence, clipped signal, short impulse, fixed bass-like
harmonic signal. Real user audio is never a fixture. Generated temporary audio
goes to an ignored directory and is never committed.

## Playwright

Use Chromium fake media (`--use-fake-device-for-media-stream`,
`--use-fake-ui-for-media-stream`) and a granted `microphone` permission. Add the
23 scenarios of brief §21.3, including: Record & Compare visible at production
default **without** injecting the flag as `true`; permission allowed/denied;
device + right-channel selection; record in all three modes; My Take / Target
playback; Retake; Discard; Review save; Keep Take; History replay after restart;
saved-take delete; explicit feature-flag `false`; keyboard-only; screen-reader
labels; reduced motion; 200% scale; 320px viewport.

## Tauri

Production release build; direct-executable launch; microphone capability in
WebView2; no crash on permission denial; Practice usable with no device; stream
released on app close; app-data save; saved-take reload; saved-take delete. If OS
permission dialogs cannot be fully automated, state the limitation — never call a
Web-only pass a Tauri pass.

## Resource / performance gate (brief §22)

20× Retake; 20× Start/Stop; three-mode switching; route leave/return;
save/delete repetition; permission deny/retry; device-disconnect equivalent.
Assert: 0 active MediaStreamTrack; 0 retained recorder; 0 retained Blob URL; no
AudioNode / timer / listener growth; 0 stuck output; bounded memory; no History
or Bass Practice benchmark regression.

## Gate split

Report P5.17-specific gates separately from repository-wide gates. Known P5.15
external-fixture exceptions, if any, are reported as such and never used to hide a
P5.17-specific failure.
