# Product Contract Matrix (Stages 01–02)

The [baseline inventory](00-baseline-inventory.json) classifies every collected test file into T0 static, T1 domain, T2 component/integration, T3 product path, or T4 visual/system. This matrix identifies the smallest **strong** retained checks for current product behavior. Historical phase names are provenance, not ownership. A browser test remains where real focus, layout, storage, fonts, or transport wiring is the risk. None of these rows is authorized for deletion solely because another layer exists.

| Current Product Contract | Primary protection | Browser/system seam retained | Owner / tier |
| --- | --- | --- | --- |
| P8.8.3 624-row product-supported semantic corpus, A Semantic Error = 0, B Defining Tone Loss = 0, F Unknown = 0, `text-chord-tones-v1` | `src/domain/phase883Matrix.test.ts`, `phase883Semantic.test.ts`, `phase883Audition.test.ts`, `phase883Practice.test.ts`; frozen `docs/phase8.8.3/product-supported-matrix.json` | Representative Extended Text save and Voicing Loop open in `e2e/phase8.8-extended-text.spec.ts` | Text harmony, T1 + T3 |
| P8.8.4 Play/Pause/Resume, exact span seek, bar seek, Stop anchor | `src/components/capture/TextCaptureTransport.test.tsx`; `src/domain/extendedTextExactTiming.test.ts` | `e2e/phase8.8.4-text-transport.spec.ts` verifies actual click/seek and saved path | Text transport, T1/T2 + T3 |
| P8.8.4 smooth playhead, live BPM, frozen playback snapshot while editing | `src/domain/extendedTextPlayback.test.ts`, `src/components/capture/TextCaptureTransport.test.tsx` | Long score playhead stays in place in `e2e/phase8.8.4-text-transport.spec.ts` | Text transport, T1/T2 + T3 |
| P8.8.5 MIDI/Text common location, Standard/Extended source text kept | Capture component tests and `e2e/phase8.8.5-capture-geometry.spec.ts` / `phase8.8.5-text-workspace.spec.ts` | Mode switching and DOM geometry are browser-only | Text Capture, T2 + T3/T4 |
| P8.8.5 global audition timbre and metronome | `src/components/PreviewSoundProvider.test.tsx`, `MetronomeProvider.test.tsx`, `TextGlobalPlayback.test.tsx` | `e2e/phase8.8.5-capture-geometry.spec.ts` checks global control across modes | Shared playback, T2 + T3 |
| P8.8.5 BPM unset versus explicit 120, shared Transport visual states, offline local fonts | `src/components/capture/TextGlobalPlayback.test.tsx`, `TextCaptureTransport.test.tsx`; transport class lint | `e2e/phase8.8.5-final-ui.spec.ts` checks browser layout and actual loaded font faces | Text Capture / shared UI, T2 + T4 |
| P8.8.6 shared Standard/Extended status and pristine empty state | `src/components/capture/textCaptureStatus.test.ts` | `e2e/phase8.8.6-capture-closure.spec.ts` checks actual UI parity | Text Capture, T1 + T3 |
| P8.8.6 desktop outer vertical/horizontal overflow = 0, long chart Editor/Preview internal scroll, retired Standard UI absent | No pure unit substitute for scroll geometry | `e2e/phase8.8.6-capture-closure.spec.ts` across four desktop viewports and 70/150/200 bars | Text Capture, T4 |
| Vault read/save round trip and preserved records | Vault persistence/store unit and integration tests | `e2e/vault-flow.spec.ts` keeps real user path | Vault, T1/T2 + T3 |
| Chord Dojo reachable by keyboard and end content visible | Practice view/component tests | `e2e/keyboard.spec.ts`, `phase5.13-3.spec.ts` after updating retired tab semantics | Practice, T2 + T3/T4 |
| Voicing Loop global controls, playback and responsive bounds | Voicing Loop state/transport tests | `e2e/voicing-loop-v2.spec.ts`, later VL-09–VL-12 browser tests | Voicing Loop, T2 + T3/T4 |
| Privacy, schema, source contract and phase handoff | `security:scan`, phase-doc/AI validators, TypeScript and lint | No snapshot substitute | T0 |

## Placement rule

A domain grammar or 624-row semantic invariant belongs at T1. A component's wiring or persistence contract belongs at T2. T3 keeps a representative full product path. T4 checks geometry, accessibility, local fonts and intentional visual appearance. Parameterized rows keep their case identifier in the test title so failures remain actionable.

## Coverage change rule

Before removing or relocating a test, record why its unique assertion is unnecessary, the overlapping case, the retained replacement, and this matrix row. If no existing check is equally strong, keep it. Do not alter `src/` behavior for historical E2E selectors or visual baselines.
