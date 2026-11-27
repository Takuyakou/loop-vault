<!-- phase-id: 5.17 -->

# P5.17-00 — Repository audit

Audited at baseCommit `ef31d4d` on branch `feat/p517-record-and-compare`
(local master fast-forwarded to the released v1.0.0 `c779e77`, then the phase
workflow merged as `ef31d4d`; P5.16 integration `ffa2d90` is an ancestor).

## Where Bass Practice lives

- Feature root: `src/features/bass-practice/`
  - `domain/` — generators, `stateMachine.ts` (session), `review.ts` (self-eval),
    `rhythm.ts`, `bassline.ts`, `types.ts`.
  - `application/` — `featureFlag.ts`, FreePats sample engine (`freepatsBass*.ts`),
    playback (`degreePlayback.ts`, `rhythmPlayback.ts`), `rhythmMetronome.ts`,
    `practiceData.ts`.
  - `infra/repository/` — `practiceRepository.ts`, `practiceStorage.ts`
    (Browser localStorage + Tauri + Memory), `rhythmSchemas.ts`.
  - `ui/` — `BassPracticeView.tsx`, `BassPracticeModeView.tsx`,
    `PracticeWorkspace.tsx`, `RhythmPracticeView.tsx`, `BasslinePracticeView.tsx`,
    `DegreeFretboard.tsx`, `PracticeRecoveryPanel.tsx`, home card.
- Entry: `src/App.tsx` gates the Home card / sub-nav on the three mode flags.

## Session state machine (do not replace by guess)

`domain/stateMachine.ts` is a frozen, invariant-checked reducer with statuses
`setup → ready → listening → recall → singing → thinking → playing → review →
transfer-offer → transfer → completed | abandoned`. It rejects invalid
transitions and validates counters/singing/review facts on restore.

**Integration point:** Record & Compare wraps the `thinking → playing → review`
segment (Record Setup before Play/Record; Listen Back before Review). The
recorder is a **separate** state machine (see the state-machine contract); a
recording failure must never drive the session to `abandoned`. Tab changes keep
Degree Echo mounted (P5.16 fix); Rhythm/Bassline unmount on mode exit and must
release audio/recording resources there.

## Practice storage (text-only, not binary-safe)

- Browser: `BrowserPracticeStorage` over `localStorage`, keys
  `loop-vault:practice-v1:*` — JSON strings only.
- Tauri: `TauriPracticeStorage` → Rust `practice_storage.rs`. A single atomic
  CAS document at `app_data_dir/loopvault/practice-v1.json`, `fileVersion: 1`,
  `revision` + sha256 content token, **16 MiB cap**, rotating backups (max 20),
  quarantine on corruption, cross-process lock. UTF-8 validated — **binary is
  rejected**.
- Consequence: recording binaries **cannot** be embedded here (would break the
  16 MiB cap, UTF-8 validation and Vault-independence). A separate binary take
  store is required (storage contract).

## Feature flag mechanism

`application/featureFlag.ts` reads `localStorage` keys with a hard-coded default,
`"true"`/`"false"` string override, safe fallback on error. The three Echo modes
default `true`. P5.17 adds an **independent** key
`loop-vault:bass-practice-record-compare-enabled:v1`
(`enableBassPracticeRecordCompare`), same pattern, default `true` at release,
local `false` = immediate rollback. Must not touch the Vault schema.

## Tauri capability / permission audit

- `tauri.conf.json`: `security.csp = null` (no CSP blocking media); single main
  window; identifier `com.takuyakou.loopvault`; bundle targets `all`.
- `capabilities/default.json`: `fs:scope` allows `$APPDATA/loopvault/**` and
  `$LOCALDATA/loopvault/**` (room for a binary take store under
  `loopvault/recordings/`); no microphone-specific capability exists.
- `lib.rs`: no WebView2 media/permission handler is registered.
- **Risk (must resolve in P5.17-01/04):** on Windows the app runs in WebView2.
  `getUserMedia` there can be denied unless the host handles the WebView2
  permission request. Web/Playwright working does **not** prove Tauri works.
  Verify microphone capture in a real production Tauri build; if impossible,
  stop with `BLOCKED — required recording capability unavailable in target
  runtime` rather than adding a bespoke capture engine.

## Runtime recording capability (greenfield)

No `MediaRecorder`, `getUserMedia`, `enumerateDevices`, `AudioContext` or
`MediaStream` usage exists in `src/` today (Tone.js owns playback). The capture
boundary is a clean new addition. Capability probing (brief §11.2) — presence of
`navigator.mediaDevices`, `getUserMedia`, `enumerateDevices`, `MediaRecorder`,
`isTypeSupported`, `AudioContext`, splitter/merger/destination nodes,
`devicechange` — is deferred to P5.17-01 runtime verification and recorded then.

## Practice History

`domain/review.ts` + repository produce completed attempts / review-queue items
persisted in the Practice document. History UI lists attempts. P5.17 adds
retained-take facts (Recording retained, duration, date, mode, size, channel,
played-back-before-review, review result) and playback/delete, tolerant of a
missing/corrupt take (`Recording unavailable`), without breaking History.

## Playwright

`playwright.config.ts` — Chromium Desktop, projects for desktop/keyboard/narrow/
reduced-motion. Existing `e2e/phase5.16-production-activation.spec.ts` is the
model for production-default testing (no flag injection). Media E2E needs
`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` launch
args and a granted `microphone` permission (test-plan item, P5.17-02+).

## Generated fake audio

`.gitignore` already excludes `node_modules/`, `dist/`, `target/`,
`.local-evaluation/`, `test/private-midi/`. P5.17 must add an ignored directory
for deterministically generated fake input (brief §21.2) so no generated or real
audio is ever committed; the exact path is fixed in the test plan / P5.17-01.

## Baseline (measured at `ef31d4d`)

| Gate | Result |
| --- | --- |
| `npm run validate:phase-docs` | PASS (1 package: template) |
| phase-docs validator tests | PASS — 23 tests |
| full Vitest (`npm test`) | PASS — 271 files / 2091 tests |
| ESLint + Tailwind class lint | PASS |
| app TypeScript (`tsc --noEmit`) | PASS |
| E2E TypeScript (`typecheck:e2e`) | PASS |
| Rust (`cargo test`) | PASS — 41 tests |

Playwright and Tauri release builds were not run in this audit stage; they are
gates for later stages. No product code changed in P5.17-00, so these baselines
hold for the branch base.
