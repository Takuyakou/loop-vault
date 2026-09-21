# Loop Vault — Architecture Map

When to read:
Read this before architecture work, or when locating a system's boundaries.

Do not preload:
Do not read this for unrelated UI-only tasks.

Paths below are verified against the current working tree. `src/`, `scripts/`,
and `docs/ai-handoff/` references are machine-validated (HARD); docs/phase
references are historical (SOFT). Co-located `*.test.ts` files exist beside most
domain modules.

---

## 1. App shell & view routing

- Paths: `src/App.tsx`, `src/main.tsx`, `src/components/AppShell.tsx`, `src/views/`
- Responsibilities: view switching, startup/recovery states, close guards, master volume, undo queue, Vault/practice wiring.
- Views: Home, Library, Detail, Capture, Progression Detail, Practice, History, Settings.

## 2. Vault (data model + persistence + store)

- Paths: `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/repository.ts`, `src/domain/transition.ts`, `src/store/vaultStore.ts`, `src/storage/`
- Responsibilities: `VaultFile` (`fileVersion: 1`) with `SongIdea[]`; Zod parsing with quarantine; atomic save + backup rotation; status transitions; autosave.
- Protected: Vault schema / `fileVersion` must not change without authorization.

## 3. MIDI Import / Capture

- Paths: `src/domain/midi/rawSmf.ts`, `src/domain/midi/parser.ts`, `src/domain/midi/timing.ts`, `src/domain/midi/voices.ts`, `src/views/CaptureView.tsx`
- Responsibilities: SMF parse to `MidiSongData`, tempo/meter/total bars, track/voice role inference, pre-analysis voice selection UI.

## 4. Analyzer (deterministic symbolic chord detection)

- Paths: `src/domain/midi/analysis.ts`, `src/domain/midi/legacy.ts`, `src/domain/midi/hybrid.ts`, `src/domain/midi/legacyBoundaryReranker.ts`, `src/domain/midi/voiceAwareReranker.ts`, `src/domain/midi/phase4Analyzer.ts`
- Responsibilities: weighted note scoring against chord templates, timeline smoothing, candidate-block selection.
- Modes: `legacy`, `hybrid-v1`, `legacy-boundary-rerank`, `voice-aware-rerank-v1`, `phase4-v1` (default), `phase4.1-v1`, `phase4.1.2-v1`, `phase4.1.2-core-v1`, `phase4.1.2-g2-v1`, `phase4.1.2-core-g2-v1`.
- Protected: do not change detection / ranking incidentally.

## 5. Voice Roles

- Paths: `src/domain/midi/types.ts` (`Voice`, `VoiceRole`, `VoiceRoleInference`), `src/domain/midi/voices.ts`
- Responsibilities: infer bass/harmony/pad/melody/percussion roles per voice from channel, program, track name, and measured statistics.

## 6. Voicing Memory / Source Voicing

- Paths: `src/domain/voicing/`, `src/domain/voicing/sourceVoicing.ts`, `src/domain/voicing/extractVoicing.ts`, `src/domain/types.ts` (`ChordVoicingMemory`, `VoicingSnapshot`)
- Responsibilities: capture the original MIDI pitches for a chord (`sourceVoicing`) and a practice override (`practiceVoicingOverride`); keep capture preview and save path identical.
- Protected: source voicing is never quantized / retimed / transposed / rewritten.

## 7. Progression editing / classification

- Paths: `src/domain/progressionEditing/`, `src/domain/progressionClassification/`, `src/domain/progressionText.ts`
- Responsibilities: editable progression slots, quick candidates, style candidates, split/merge, edit history; automatic mood/source/use tags; text formatting.

## 8. Practice (Chord Dojo + voicing + transposition + mix)

- Paths: `src/domain/voicingPractice/`, `src/domain/practiceTransposition/`, `src/domain/practiceMix/`, `src/views/PracticeView.tsx`, `src/components/practice/`
- Responsibilities: voicing generation (shell/open/rootless, style generator, transition cost), transposition practice, mix sessions, keyboard practice UI.

## 9. Bass Practice (+ Record & Compare)

- Paths: `src/features/bass-practice/`, `src-tauri/src/practice_storage.rs`
- Responsibilities: Degree Echo / Rhythm Echo / Bassline Echo exercises, Record & Compare self-review, local practice history; Rust persistence of practice data and backups.

## 10. Live MIDI

- Paths: `src/domain/liveMidi/`, `src/liveMidi/`, `src-tauri/src/live_midi/`
- Responsibilities: real-time chord detection from a physical MIDI keyboard, mini-window, device selection, latency metrics. Separate detector from file analysis.

## 11. Progression Advisor (LLM)

- Paths: `src/domain/progressionAdvisor/`, `src/llm/`, `src-tauri/src/llm/`
- Responsibilities: build/validate LLM prompts and responses for progression ideas; API key kept in the OS keychain (never in the frontend).

## 12. MIDI Export / native DAW drag

- Paths: `src/domain/midiExport/`, `src/midiExport/`, `src-tauri/src/midi_export.rs`, `src-tauri/src/native_drag.rs`
- Responsibilities: write a saved progression to MIDI; native drag-and-drop into a DAW.

## 13. i18n

- Paths: `src/i18n.ts`
- Responsibilities: Japanese / English strings and language toggle.

## 14. Test & validation infrastructure

- Paths: `src/**/*.test.ts`, `src/**/*.test.tsx`, `e2e/`, `test/`, `scripts/phase-docs/`, `scripts/check-staged-files.mjs`, `scripts/ai-handoff/`
- Responsibilities: Vitest unit/domain tests, Playwright E2E/visual tests, phase-doc validator, staged-file privacy guard, handoff validator.
- See `TEST-STRATEGY.md`.

## Historical direction (SOFT references, not current runtime)

- `docs/current-midi-detection-spec.md` describes an earlier default analyzer (`legacy-v1`); current default is `phase4-v1`.
- `docs/phase5.18.2/README.md` records the completed Vault source-discoverability phase.
- Voicing rule engine v2 (P5.33) and Source Truth / Harmony Interpretation / Practice Rendering are PROPOSED, not yet implemented in committed code.
