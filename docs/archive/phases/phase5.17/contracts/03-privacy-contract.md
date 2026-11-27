<!-- phase-id: 5.17 -->

# Contract 03 — Privacy

Record & Compare is a local mirror, never a grader or a data pipeline.

## Stated to the user (UI and docs)

- Recording is local only; nothing is sent to the cloud.
- No automatic analysis; no automatic scoring.
- Not saved by default; saved only on Keep Take.
- Saved takes are deletable.
- Recordings are separate from the Vault.
- Turning the feature OFF does not delete already-saved takes.

## Never analyze / infer

No pitch, onset, rhythm, duration, mute, accuracy, score, or level is computed
from the audio. The input level meter (RMS/peak/clip) exists only to make
recording possible; its values are never saved, sent, or presented as a grade.

## Protected surfaces — never in logs, reports, or test artifacts

- Real recorded audio / any private audio.
- Raw device ids; OS usernames; personal absolute paths (e.g. `C:\Users\<name>`).
- Personal / external MIDI.
- Anything inferred from the captured audio.

## Repository hygiene

Generated fake input goes to an ignored directory and is never committed. No
recording binary is ever tracked. These are enforced by the P5.17 gates
(brief §23) and the existing `scripts/check-staged-files.mjs` guard, extended as
needed for audio extensions in a later stage.
