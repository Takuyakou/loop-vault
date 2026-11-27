# P13 subsection 4 — Local approximate feedback

A module worker extracts monophonic notes from decoded PCM with McLeod NSDF,2048/256 reference window/hop at48kHz and28–450Hz frequency scope. No target notes enter audio extraction. Software capture offset is subtracted before optional pitch-matched median correction capped at±250ms. One-to-one onset matching uses2× tolerance; labels are correct, pitch mismatch, early, late, missed and unmatched extra.

Silence, sustained clipping, unsupported recording size and cancellation produce explanations without attempts. Only MIDI mode requests this analysis; legacy recordings remain self-review only. No network request or PCM persistence is introduced.

Public bundled FreePats qualification uses120 cases: finger/pick, BPM60/100/140, B0/E1, pitch alterations,20/60/120ms timing deviations, missing/extra notes, quiet/noisy audio and0/40/120/240ms delay. Extras are matched against their known synthetic identity in latency-corrected coordinates, rather than just counting predicted extras. The freeze command records true or false, preventing reuse of stale qualification.

Evidence: `../evidence/audio-qualification.json`. All required metrics passed in focused verification. Actual-interface recordings remain Human Product Acceptance evidence, not automated Gold; no private input has been inspected or committed.
