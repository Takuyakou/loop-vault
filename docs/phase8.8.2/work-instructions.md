# Phase 8.8.2 Work Instructions

## Scope

Complete the Text Capture flow: Paste, See, Hear, Fix, Save, Practice. The user-supplied v2 HTML mock is the visual source. Keep Standard text, Phase 8.8.1 exact timing, written spelling, Vault fileVersion 2, current Generated voicing, MIDI Source/Custom behavior and Product Analyzer unchanged. Do not begin Phase 8.9/9.

## Contracts

Use one shared BPM scrub in Voicing Loop and Text Capture, with 30–240 clamp and established pointer, keyboard and wheel behavior. Amber indicates pending metadata suggestions and warnings. On desktop use an approximately 40/60 internally scrollable editor/preview layout; under 900px use Input/Preview tabs. Render four bars per row, duration-proportional HarmonicSpan bands, attack markers, rest, annotations, exact source-span navigation, and a sticky save bar. Do not turn comments into semantic sections.

Parse errors block save; warnings and practice limits remain separate. Valid but practice-incompatible scores remain saveable with disabled practice action and reason. Freeze preview playback at Play until Stop/end; edits affect the next Play. Use existing playback controller and Generated voicing. Preserve raw text, exact timing, chosen BPM/meter and input after failed save. Limit real-world evidence to local-only aggregates.

## Non-goals

No Home/Vault-wide/Progression-page/Bass Practice redesign, Reference Voicing, Vault v3, Product MIDI Analyzer changes, Phase 8.9 or Phase 9 work.

## Gates

Each stage gets focused regression, documentation validation, diff review and its own commit. Final candidate and final master require focused text/Vault/Voicing/BPM tests, frozen PRE, full Vitest, App/E2E TypeScript, repository/class/source lint, production build, relevant Playwright, responsive/accessibility, documentation/handoff, privacy, and diff check. Build output stays on D. A master merge requires explicit human chat authorization per AGENTS.md; no push, tag or release.

## Definition of Done

The text flow and protected contracts pass the required candidate gates, the candidate remains reviewable for a human-authorized local master merge, and a runnable D-drive Windows EXE follows post-merge gates.
