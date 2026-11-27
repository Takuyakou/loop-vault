# Contract 06 — Transport Reference Sound (`お手本音`)

Add a checkbox in the transport row labeled exactly or equivalently to `お手本音`.

## Initial/session state

The approved mock shows the checkbox ON. Use **ON as the default for a newly opened Voicing Loop session** unless an existing product preference already defines the reference-playback default. Keep the state session-local for P5.30 unless existing Practice preferences can be reused without a new schema/fileVersion change. Do not add persistence solely for this toggle.

## ON behavior

When transport actually begins the progression (after any count-in), sound the currently selected resolved voicing at each harmonic event boundary.

- one attack per chord event boundary;
- no extra in-event re-strike;
- event duration comes from P5.29 timing;
- selected timbre/output path follows existing Voicing Loop audio behavior;
- Source/Custom exactness and no-fallback rules apply;
- all five voicing selections use the same harmonic boundary schedule.

Pause/Stop/Exit/source change must stop owned reference notes immediately. Resume may re-articulate the currently active reference chord if existing pause semantics require note cleanup, but must never double-trigger it.

## OFF behavior

Transport advances visually and metronome behaves normally, but no automatic reference chord is sounded. Manual card audition/current-code audition still works.

This feature is a reference layer, **not** a comping pattern engine.
