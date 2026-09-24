# Voicing Loop v2 — merge review handoff

Branch: `feat/voicing-loop-v2`. Base: local master `de298b9`. Stage commits: `feb44ab` (VL-00), `012ced7` (VL-01), `9371b33` (VL-02), `40a9afe` (VL-03), `630c645` (VL-04), `14b4dff` (VL-05 code), `6d1db55` (responsive clarification). The final report commit is documented by Git history.

## Decision state

`VOICING LOOP V2 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE` once final candidate HEAD gates pass. Do not merge before the human product acceptance in Contract 06 is recorded PASS. Then perform final smoke/diff review and request a separate human merge authorization. No merge, push, tag, or release was performed in this work.

## Product scope and rollback

The C v3 workspace, bounded V2 WebAudio transport, chord-onset navigation, and 128 PracticeGroup bound are the only product behavior changes. Existing Product Analyzer/extractor, Identity/Decoder, Vault v2, and Phase 8/9 research stay as they were. The default V2 transport can be switched off with `lv-voicing-loop-v2=off` in localStorage before view mount; this selects the old card audition/transport path and requires no Vault data change.

## Evidence and limitations

See `VL-05-hardening.md` for the automated gate matrix and the final 1440×900 fixed-dependency audit. The PDF hierarchy remains the visual contract; 1600×900 is the primary comparison viewport, while 1440×900 is only a sample. The attached PDF and all screenshots remain local-only. The transport has no external MIDI output, so MIDI Note Off/CC64/CC123 output commands are not exercised; WebAudio voice release, disposal, and active-note ledger are verified. Actual Roland hardware feel and stuck-note/pedal acceptance remain human product checks. The existing constant-meter 1/4–12/4 scope and unsupported meter/tempo-change limitations remain unchanged.
