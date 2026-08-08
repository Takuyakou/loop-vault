<!-- phase-id: 5.18 -->

# Contract 05 — Privacy and Protected Surfaces

## Never commit or report
- personal/external MIDI, recordings, private audio, raw device identifiers
- `.local-evaluation` inputs or generated local evaluation artifacts
- personal absolute paths, raw source MIDI, or source filesystem paths

## Protected surfaces
P5.18 must leave P5.15, the Vault schema/repository, Analyzer, MIDI Exporter,
Chord Dojo, Live MIDI, FreePats source assets/mapping/licensing, and P5.17
binary-take storage unchanged unless a later explicit stage says otherwise.
P5.18-00 changes none of them.

## Evidence
Stage evidence is text-only, deterministic, repository-relative where paths
are needed, and records commands/results without private inputs. `docs/CURRENT_STATE.md`
remains retired and absent.