# Loop Vault — Architecture Map

When to read:
Read this before architecture work, or when locating a system's boundaries.

Do not preload:
Do not read this for unrelated UI-only tasks.

Paths below are verified against the current working tree. `src/`, `scripts/`,
and `docs/ai-handoff/` references are machine-validated (HARD); docs/phase
references are historical (SOFT). Co-located `*.test.ts` / `*.test.tsx` files
exist beside most modules.

---

## Cross-cutting architecture status

Confirmed building blocks (each exists independently in committed code):

- `sourceVoicing` (per-chord pitch/octave)
- `Source Bassline` (selected bass voice, exact beats)
- Analyzer (chord identity / segmentation / ranking)
- Voicing Rules (first wave)
- Progression Voicing Practice rendering

Proposed unifying contract (not yet fully realized):

```text
Source Truth → Harmony Interpretation → Practice Rendering
```

---

## 1. App shell & view routing

- Paths: `src/App.tsx`, `src/main.tsx`, `src/components/AppShell.tsx`, `src/views/`
- Responsibilities: view switching, startup/recovery states, close guards, master volume, undo queue, Vault/practice wiring.
- Views: Home, Library, Detail, Capture, Progression Detail, Progression Voicing Practice, Practice, History, Settings.

## 2. Vault (data model + persistence + store)

- Paths: `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/repository.ts`, `src/domain/transition.ts`, `src/store/vaultStore.ts`, `src/storage/`
- Responsibilities: `VaultFile` (`fileVersion: 2`) with `SongIdea[]`; Zod parsing with quarantine; v1→v2 migration; atomic save + backup rotation; status transitions; autosave.
- Protected: Vault schema / `fileVersion` must not change without authorization.

## 3. MIDI Import / Capture

- Paths: `src/domain/midi/rawSmf.ts`, `src/domain/midi/parser.ts`, `src/domain/midi/timing.ts`, `src/domain/midi/voices.ts`, `src/views/CaptureView.tsx`, `src/components/capture/`
- Responsibilities: SMF parse to `MidiSongData`, tempo/meter/total bars, track/voice role inference, pre-analysis voice selection, Source Bassline and Text Progression entry panels.

## 4. Analyzer (deterministic symbolic chord detection)

- Paths: `src/domain/midi/analysis.ts`, `src/domain/midi/legacy.ts`, `src/domain/midi/hybrid.ts`, `src/domain/midi/legacyBoundaryReranker.ts`, `src/domain/midi/voiceAwareReranker.ts`, `src/domain/midi/phase4Analyzer.ts`
- Responsibilities: weighted note scoring against chord templates, timeline smoothing, candidate-block selection.
- Role: Harmony Interpretation — it estimates chord identity; it is not a source-truth recorder.
- Modes: `legacy`, `hybrid-v1`, `legacy-boundary-rerank`, `voice-aware-rerank-v1`, `phase4-v1` (default), `phase4.1-v1`, `phase4.1.2-v1`, `phase4.1.2-core-v1`, `phase4.1.2-g2-v1`, `phase4.1.2-core-g2-v1`.
- Protected: do not change detection / ranking incidentally.

## 5. Voice Roles

- Paths: `src/domain/midi/types.ts` (`Voice`, `VoiceRole`, `VoiceRoleInference`), `src/domain/midi/voices.ts`
- Responsibilities: infer bass/harmony/pad/melody/percussion roles per voice from channel, program, track name, and measured statistics.

## 6. Voicing Memory / Source Voicing

- Paths: `src/domain/voicing/`, `src/domain/types.ts` (`ChordVoicingMemory`, `VoicingSnapshot`)
- Responsibilities: capture a per-chord pitch/octave snapshot (`sourceVoicing`, no timing) and a practice override (`practiceVoicingOverride`); keep capture preview and save path identical.
- Protected: source voicing is never quantized / retimed / transposed / rewritten.

## 7. Source Bassline (exact-beat source capture)

- Paths: `src/domain/sourceBassline/`, `src/components/capture/SourceBasslineCapturePanel.tsx`
- Responsibilities: capture a selected bass voice as `SourceBasslineSnapshotV1` with exact beats (4/4) and captured harmony spans; bass-specific, not full polyphonic source.

## 8. Text Progression Entry

- Paths: `src/domain/textProgression.ts`, `src/domain/textProgressionDraft.ts`, `src/domain/textProgressionVoicing.ts`, `src/domain/textScoreTokenizer.ts`, `src/components/capture/TextProgressionCapturePanel.tsx`
- Responsibilities: parse a text progression (with slash/control semantics) into chord events, then build a draft for the Vault. A separate input path, not an exact MIDI performance representation.

## 9. Voicing Rules engine (P5.33 first wave)

- Paths: `src/domain/voicingRules/`, `src/domain/voicingRules/firstWaveRules.ts`, `src/domain/voicingRules/goldenCorpus.ts`, `src/domain/voicingRules/studyGenerator.ts`
- Responsibilities: deterministic promotion of a bounded first wave of voicing rules with source / study / coverage / context / provenance axes (not a wholesale import of all research records).
- Role: Practice Rendering — voicing selection/generation; distinct from the analyzer's chord interpretation.

## 10. Progression Voicing Practice (Voicing Loop surface)

- Paths: `src/domain/progressionVoicingPractice/`, `src/domain/progressionVoicingPractice/clock.ts`, `src/domain/progressionVoicingPractice/handoff.ts`, `src/domain/progressionVoicingPractice/voicingResolution.ts`, `src/views/ProgressionVoicingPracticeView.tsx`
- Responsibilities: re-open a saved Vault block, resolve a voicing selection, and rehearse it with a practice clock and count-in.

## 11. Practice (Chord Dojo + voicing + transposition + mix)

- Paths: `src/domain/voicingPractice/`, `src/domain/practiceTransposition/`, `src/domain/practiceMix/`, `src/views/PracticeView.tsx`, `src/components/practice/`
- Responsibilities: voicing generation (shell/open/rootless, style generator, transition cost), transposition practice, mix sessions, keyboard practice UI.

## 12. Bass Practice (+ Record & Compare)

- Paths: `src/features/bass-practice/`, `src-tauri/src/practice_storage.rs`
- Responsibilities: Degree Echo / Rhythm Echo / Bassline Echo exercises, Record & Compare self-review, local practice history; Rust persistence of practice data and backups.

## 13. Live MIDI

- Paths: `src/domain/liveMidi/`, `src/liveMidi/`, `src-tauri/src/live_midi/`
- Responsibilities: real-time chord detection from a physical MIDI keyboard, mini-window, device selection, latency metrics. Separate detector from file analysis.

## 14. Progression Advisor (LLM)

- Paths: `src/domain/progressionAdvisor/`, `src/llm/`, `src-tauri/src/llm/`
- Responsibilities: build/validate LLM prompts and responses for progression ideas; API key kept in the OS keychain (never in the frontend).

## 15. MIDI Export / native DAW drag

- Paths: `src/domain/midiExport/`, `src/midiExport/`, `src-tauri/src/midi_export.rs`, `src-tauri/src/native_drag.rs`
- Responsibilities: write a saved progression to MIDI; native drag-and-drop into a DAW.

## 16. Security

- Paths: `src/security/`
- Responsibilities: intake budgets and Tauri security configuration (CSP, capability grants).

## 17. i18n

- Paths: `src/i18n.ts`
- Responsibilities: Japanese / English strings and language toggle.

## 18. Test & validation infrastructure

- Paths: `scripts/ai-handoff/`, `scripts/phase-docs/`, `scripts/check-staged-files.mjs`, `src/testing/`
- Responsibilities: handoff validator, phase-doc validator, staged-file privacy guard, E2E fixtures.
- See `TEST-STRATEGY.md`.

## Historical direction (SOFT references)

- `docs/current-midi-detection-spec.md` describes an earlier default analyzer (`legacy-v1`); current default is `phase4-v1`.
- `docs/phase5.33/README.md` records the adopted Voicing Rule engine v2 scope; the first wave is now in committed code.
