# Phase 8.8.5 — Work Instructions

## 1. Audit before editing

Audit:
- current P8.8.4 branch and local master
- all MIDI/Text Capture tab render locations
- Standard/Extended workspace components
- audition timbre state/resolver
- all metronome toggles/state/schedulers across the app
- Voicing Loop Transport button implementations/styles
- Text Capture Transport button implementations/styles
- current BPM unset-vs-explicit-120 behavior
- current Standard key candidate UI
- current score preview view-model

Do not assume the prior P8.8.4 report proves the visual requirements.

---

## 2. MIDI/Text capture tabs: one shared invariant component

`MIDI / テキスト` must render once in the common Capture shell, above mode-specific content.

Requirements:
- same DOM component when switching MIDI <-> Text
- do not duplicate tabs inside Text or MIDI panels
- do not unmount/recreate a differently wrapped tab strip
- same parent padding/margin in all modes

Automated Playwright invariant at multiple widths:
- tabs wrapper x/y/width/height identical before/after MIDI<->Text switch
- MIDI button x/y/width/height identical
- Text button x/y/width/height identical
- exactly one tab strip exists

Use 1920, 1440, 1280, 1024, 899, 768 at minimum.

---

## 3. Standard/Extended share one workspace

Mode switching changes parser/reading mode only.

CRITICAL:
- switching Standard <-> Extended MUST NOT mutate, replace, reset or normalize the editor raw text
- selection/caret should remain stable where practical
- no sample text is inserted on mode switch

Automated test:
- paste a distinctive multi-line source
- capture exact UTF-16 text and selection
- Standard -> Extended -> Standard
- text remains byte/UTF-16-identical
- no accidental whitespace/line-ending rewrite by UI mode switching

---

## 4. Preserve current score preview

The provided HTML mock is NOT permission to simplify the preview parser/model.

Keep the real current P8.8.2/P8.8.4 preview semantics:
- HarmonicSpan duration proportionality
- authored reattack markers
- `=` hold
- `%` reattack
- `_` / N.C. rest
- annotations
- raw erroneous bar
- exact source spans
- 4 bars/row
- diagnostics
- practice limitation
- long-chart behavior

Do not replace these with equal-width synthetic blocks.

---

## 5. Global audition timbre

Text Preview/Vault text-card audition must use the same app-global audition timbre setting shown in the header.

No Text-only hidden/default hardcoded EP or Piano override.

Required:
- Piano selected -> text chord audition uses Piano path
- EP selected -> text chord audition uses EP path
- switching timbre affects subsequent auditions immediately
- Voicing Loop/other audition surfaces keep their existing intended global behavior
- no duplicate timbre state

Add direct integration tests around the resolver/output path, not only button state.

---

## 6. Global metronome preference

Move metronome ON/OFF to one global app-header control.

UI:
- clear metronome icon
- tooltip on hover/focus:
  - `メトロノーム：OFF`
  - `メトロノーム：ON`
- `aria-label`
- `aria-pressed`
- default OFF unless current persisted product contract says otherwise
- persistent preference across relevant navigation/restart using the existing settings mechanism

Semantics:
- global state shares only ON/OFF
- tempo remains owned by each feature transport
- Text Capture 120 BPM -> click at 120
- Voicing Loop 88 BPM -> click at 88
- Bass Practice/Chord Dojo/etc use their own current transport tempo if they support click

Audit every screen with a metronome function:
- Text Capture
- Voicing Loop
- Bass Practice
- Chord Dojo
- any other playback/tempo screen

If a screen has a duplicate metronome toggle:
- remove or route it through the global control
- do not leave conflicting local state
- do not force metronome audio into screens that do not support a click concept

Prefer shared preference + shared click scheduling primitives where safe.
Do not break transport timing.

---

## 7. TransportButton common component

Create/reuse a common TransportButton variant layer for at least Text Capture and Voicing Loop.

Approved color system:

### Primary transport
`Play / Pause / Resume`
- SAME teal family
- Pause is not warning-yellow
- Resume is not visually different from Play except label/icon
- hover remains teal-family

### Neutral transport
`Stop / Beginning`
- neutral/slate
- Stop is not error-red
- Beginning is not blue
- hover remains neutral/slate

### Loop
- OFF = neutral
- ON = purple/accent mode state
- hover when OFF = neutral
- hover when ON = purple-family

CRITICAL:
- do not apply one generic teal hover to every transport button
- hover styles must follow each button family

Diagnostic colors remain reserved:
- warning = warning/amber
- error = red

Transport actions must not look like diagnostics.

Add visual/class tests ensuring no warning/error token is reused by Pause/Stop.

---

## 8. Fixed Play/Pause/Resume geometry

The primary state button changes label:
- `▶ 再生`
- `Ⅱ 一時停止`
- `▶ 再開`

Its outer width must not change across these states.

Use a fixed/min width sized for the longest Japanese label.

Automated geometry test:
- record Transport group bounding box
- record name input x/y
- record Save button x/y
- cycle Play -> Pause -> Resume
- same viewport
- positions and widths remain invariant within 1 CSS px

No line-wrap solely because the label changed.

---

## 9. One-line desktop toolbar

On normal desktop widths, toolbar stays one line.

Target controls:
- Standard / Extended
- meter
- key
- BPM
- Transport
- transport state
- Name
- Vault save

Metronome is NOT inside this toolbar anymore.

Do not solve normal desktop overflow by forcing a second row.

First optimize:
- gap
- horizontal padding
- compact labels
- stable widths
- remove redundant helper text from toolbar

Responsive wrap is allowed at deliberately narrower breakpoints.

Name + Save must remain one cluster.
If wrapping occurs at narrow width, they move together.

Test at:
- 1920
- 1600
- 1440
- 1366
- 1280
- 1024

Define/document the breakpoint where one-line layout may intentionally wrap.

---

## 10. Key control

Key may remain unset.

UI:
- `未確定` is a valid state
- show estimated candidates separately
- allow all 24 major/minor keys
- selecting a key confirms it
- no auto-confirm
- save remains allowed when current contract allows unset key

Do not show only three candidate keys as if they are the only valid choices.

---

## 11. BPM unset vs explicit 120

Preserve the existing semantic distinction.

Unset:
- show `—`
- nearby compact hint `試聴120`
- preview/playback may use 120 as fallback
- persisted BPM remains unset

Explicit 120:
- show `120`
- persisted BPM is 120

BPM scrub/direct edit remains shared with Voicing Loop behavior.

---

## 12. Standard meter

Standard remains 4/4-only unless the existing parser contract changed separately.

If the shared meter control is disabled in Standard:
- display 4/4
- tooltip/help says `通常モードは4/4のみ`
- do not leave an unexplained disabled field

Extended uses supported selectable meters.

---

## 13. Source spelling

Keep authored written spelling in Standard and Extended preview.

Examples:
- `Db7(#9)` stays `Db7(#9)`
- `BbM7` stays `BbM7`

Internal canonical identity may differ.

---

## 14. Chord-band pointer / hover

All interactive chord/HarmonicSpan bands:
- `cursor: pointer`
- obvious hover state
- hover uses teal-family border/background/shadow
- selected state stronger than hover
- keyboard focus-visible for interactive equivalent
- tooltip may show chord + audition timbre

Do not style passive rest/hold regions as clickable unless they truly are.

---

## 15. Save placement and lower status

User decision:
- Name + `Vaultに保存` remain in the top toolbar, to the right of Transport on normal desktop.
- Keep them as one cluster.

Lower area is for:
- bars
- annotations
- meter
- BPM state
- error/warning/practice counts
- compact capability summary
- save-blocked reason if needed

Because save action is top-mounted, a blocked Save button must still expose the reason:
- inline lower status
- and accessible association/tooltip/message near action when invoked/focused

Do not lose the P8.8.2 error explanation UX.

---

## 16. No sample corruption

Committed examples must be synthetic and valid for their mode.

Standard examples must obey 1/2/4 chords per 4/4 bar.

Do not commit the user's real progression.

---

## 17. P8.8.3 semantics protected

Run permanent Product-supported semantic regression:
- A = 0
- B = 0
- F = 0
- `text-chord-tones-v1` unchanged
- MIDI-derived SOURCE/CUSTOM/Generated unchanged

No semantic redesign in P8.8.5.

---

## 18. Transport behavior from P8.8.4 preserved

Do not regress:
- smooth playhead
- exact span/attack seek
- bar seek
- Play/Pause/Resume
- Stop -> Play anchor
- explicit Beginning
- whole progression Loop
- frozen playback snapshot while editing
- live BPM reschedule preserving musical position
- current bar/current chord indicators
- Space shortcut exclusion while editing

P8.8.5 changes layout/shared UI/state ownership, not these contracts.

---

## 19. Automated UI gates

Required Playwright/component gates include:

### Capture tab geometry
- MIDI/Text same exact tab strip geometry across modes

### Mode-switch text retention
- Standard/Extended preserves raw text

### Toolbar geometry
- 1366+ target one-row invariant unless actual app sidebar reduces available width below documented breakpoint
- Play/Pause/Resume label change does not shift Save cluster

### Global metronome
- one global toggle
- state persists
- relevant screens read same ON/OFF
- per-screen BPM remains independent
- no duplicate local toggles

### Timbre
- Piano/EP changes actual Text audition output path

### Preview
- current real preview semantics preserved

### Hover
- chord pointer/hover
- button family hover token matches variant

### Responsive
- no page-level horizontal overflow

---

## 20. Stage plan

P8.8.5-00 Repo/UI/state audit
P8.8.5-01 Shared CaptureModeTabs geometry correction
P8.8.5-02 Global audition timbre + global metronome preference
P8.8.5-03 Shared TransportButton variants + fixed geometry
P8.8.5-04 Standard/Extended workspace polish + key/BPM/meter/source retention
P8.8.5-05 Preview interaction/hover + save/status accessibility
P8.8.5-06 Responsive/geometry/perf/regression gates
P8.8.5-07 Candidate closeout -> merge policy -> post-merge -> Windows EXE

Stop before Phase 8.9.

---

## 21. Final success state

`PHASE 8.8.5 = GLOBAL PLAYBACK UI CONSOLIDATED / TEXT CAPTURE POLISHED / TRANSPORT VISUALS SHARED / P8.8.3 SEMANTICS PRESERVED / WINDOWS EXE READY`

Do not push, tag, release, or start Phase 8.9 automatically.

## Scope

Implement the Phase 8.8.5 UI/state corrections for Text Capture, global audition timbre, global metronome ON/OFF, and shared transport visuals using the real product parser and score model.

## Non-goals

No Product Analyzer/Extractor redesign, Vault schema change, P8.8.3 semantic retuning, Phase 8.9/9 implementation, push, tag or release.

## Definition of Done

Stages 00–07 have independent commits and recorded passing gates; candidate is ready for the separate human-authorized local master merge decision. The raw Windows EXE follows an authorized merge and fresh post-merge gates.
