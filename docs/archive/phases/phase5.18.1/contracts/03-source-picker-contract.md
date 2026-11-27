<!-- phase-id: 5.18.1 -->

# Contract 03 — Source Selector / Vault Picker

## Entry point

Bassline Echo itself must expose a visible and accessible `Vaultから選ぶ` action.

Progression Detail handoff is preserved but is not the only path.

## Transaction

Opening or highlighting an item does not change the active source.

The source changes only after explicit confirmation.

Cancel preserves the previous source.

## Read-only

The picker reads Vault data and creates a safe Practice snapshot.
It never writes to the Vault.

## Minimum states

- loading
- empty
- error
- searchable list
- candidate preview
- section selection
- confirm
- cancel

## Lifecycle

Confirmed source changes safely stop playback, accompaniment and metronome,
and reconcile the existing recording/session contract without deleting retained takes.
