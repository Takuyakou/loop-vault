# Loop Vault Phase 5 Checklist

Phase 5 closes the MVP with one operational pass and a full abnormal-case audit based on `docs/spec.md` section 3.11.

## Operational Simulation

- [x] Register a new idea from the create dialog and jump into Detail immediately
- [x] Move through `idea -> loop`
- [x] Leave the item untouched long enough to show stale handling in Focus logic
- [x] Move the item to `hold`
- [x] Restore from `hold` back to its previous pipeline status
- [x] Continue `loop -> arrange -> mix -> done`
- [x] Confirm `completedAt` is retained by the domain transition rules
- [x] Check friction fixes from the pass:
  - missing asset now shows `Reset path`
  - unsupported extensions now keep `Open` disabled and steer the user to `Folder`

Automated coverage:

- `src/store/vaultStore.test.ts` `supports the weekly workflow from capture to done`

## Abnormal Cases From Spec 3.11

| Case | Expected behavior | Automated coverage | Manual check |
|---|---|---|---|
| `data.json` missing on first launch | Create an empty vault without error | `src/domain/repository.test.ts` `loads an empty vault when data.json does not exist` | Open the app with an empty app data folder |
| `data.json` JSON damage | Move bad file to `data.corrupt-*.json`, do not overwrite with empty data, show recovery | `src/domain/repository.test.ts` `moves syntax-damaged JSON...` and `src/store/vaultStore.test.ts` `enters recovery mode for corrupt JSON...` | Confirm corrupt file is visible in the app data folder |
| Individual record schema failure | Keep valid records, quarantine only bad rows | `src/domain/schema.test.ts` `quarantines invalid records...` and `src/domain/repository.test.ts` `quarantines only invalid records...` | Confirm quarantine warning appears in Home |
| Newer `fileVersion` | Read-only startup with update guidance | `src/domain/repository.test.ts` `reports future fileVersion...` and `src/store/vaultStore.test.ts` `enters readonly mode...` | Launch with a fixture set to `fileVersion: 2` |
| Asset path missing | Mark asset as missing, show recovery affordance, failed open shows toast | UI behavior updated in `src/App.tsx` | Try opening a deleted `.flp`, then use `Reset path` |
| Unsupported extension on open | Allow folder reveal only, block direct open | `src/domain/assetSecurity.test.ts` | Register a `.exe` or `.bat` path and confirm `Open` stays disabled |
| Write failure | Keep unsaved changes and surface retryable error | `src/store/vaultStore.test.ts` `keeps unsaved changes when save fails` | Force a permission error in app data |
| Invalid import JSON | Reject import, preserve current vault, show error | `src/domain/repository.test.ts` `does not touch data.json when import JSON is invalid` and `src/store/vaultStore.test.ts` `keeps current ideas when import fails` | Import a malformed JSON file from Settings |
| Delete mistake | Confirmation dialog plus 5-second undo | Existing UI flow in `src/App.tsx` | Delete an idea and hit `Undo` before the timer ends |

## Notes

- The remaining manual checks are the OS-integrated ones: app data folder reveal, native file open, and permission failures.
- Everything else in section 3.11 is now covered by repo or store-level tests.
