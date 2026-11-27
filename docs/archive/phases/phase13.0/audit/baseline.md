# Baseline audit — P13.0-01 / subsection 0

Baseline `8d107d3225201658a167cd3319eb73c85adcb492`, local master 7 commits ahead of origin. Existing unrelated untracked reports and diagnostics are preserved. Existing worktree reused, no new worktree.

- BassPracticeModeView mounts Degree persistently; other modes currently mount on selection. Existing mode/domain contracts stay intact.
- EchoPracticeChrome supplies headers/stages. Existing diagrams, controls and histories are distributed inside each view.
- PracticeSettings currently edited in Degree setup. Reuse this schema and callback for shared instrument settings.
- RecordCompareSection / RecordingSessionController own consent, channel routing, start offset, capture lifecycle and explicit Keep. Existing four modes have no analysis. Extend only through opt-in MIDI-mode completion callbacks and commands.
- parseMidi delegates to raw SMF parser. Raw parser exposes meter changes; import must validate the entire meter map, not only its initial meter.
- Monophonic projection lives in sourceBasslinePractice (lowest pitch at simultaneous onset; duration clipped at next onset). Export and reuse that algorithm without changing legacy results.
- BrowserPracticeStorage / native practice_storage provide revision/token checks, temp replace, backup retention and quarantine. Add an allowlisted independent namespace rather than duplicate filesystem algorithms.
- Library recording duration must respect existing 60-second retained-take limit; long practice windows must be bounded explicitly.
- Home activity reads existing practice records; add independent MIDI attempts without inserting songs into Vault.
- Canonical visual reference: bass-practice-mock.html. Alternate HTML is reference material. Reference 1440x900 is not a fixed production constraint.

No private MIDI, Vault or recordings accessed. Native input acceptance requires subsequent user testing; synthetic grading qualification is independently required.
