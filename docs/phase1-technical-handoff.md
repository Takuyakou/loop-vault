# Loop Vault Phase 1 Technical Handoff

This report describes the code that currently exists in the repository. It does not describe the intended design unless the code actually implements it.

Important: although the request says "Phase 1", the current repository already contains UI, Zustand store, persistence, import/export, settings, backup recovery, and Phase 5 documents. This handoff therefore reports the current implementation, while calling out where behavior goes beyond Phase 1.

## 1. Implementation Summary

Current user-facing operations:

- Launch the app and load a local vault. Entry points: `App()` in `src/App.tsx`, `initialize()` in `src/store/vaultStore.ts`.
- Create a new song idea. Entry points: `CreateDialog`, `handleCreate()` in `src/App.tsx`, `createIdea()` in `src/store/vaultStore.ts`.
- View Focus, monthly progress, pipeline counts, items missing Next Action, and stale items. Entry points: `HomeView` in `src/App.tsx`, `pickFocus()` in `src/domain/focus.ts`, `monthlyStats()` in `src/domain/monthlyStats.ts`.
- Search, filter, and sort the Library list. Entry points: `LibraryView` in `src/App.tsx`, `filterAndSortIdeas()` in `src/domain/libraryFilters.ts`.
- Edit title, BPM, key, genre, moods, chord memo, references, and assets. Entry point: `DetailView` in `src/App.tsx`.
- Update or clear the single Next Action. Entry points: `DetailView.saveNext()`, `DetailView.completeNext()`, `HomeView.completeNext()` in `src/App.tsx`, `updateNextAction()` in `src/store/vaultStore.ts`.
- Move ideas between statuses. Entry points: `DetailView.moveStatus()` in `src/App.tsx`, `transitionIdea()` in `src/store/vaultStore.ts`, `transition()` in `src/domain/transition.ts`.
- Open allowed local asset files and reveal asset folders. Entry points: `openAsset()`, `showAsset()`, `replaceAssetPath()` in `src/App.tsx`, `canOpenAssetPath()` in `src/domain/assetSecurity.ts`.
- Export/import JSON vault data. Entry points: `SettingsDialog` in `src/App.tsx`, `exportVault()` / `importVault()` in `src/store/vaultStore.ts`, `JsonVaultRepository` in `src/domain/repository.ts`.
- Restore backups. Entry points: `SettingsDialog.restore()`, `StartupState` in `src/App.tsx`, `restoreBackup()` in `src/store/vaultStore.ts`, `restore()` in `src/domain/repository.ts`.
- Delete an idea with a 5-second Undo window. Entry points: `requestDelete()` / `undoDelete()` in `src/App.tsx`, `deleteIdea()` in `src/store/vaultStore.ts`.

## 2. Project Structure

Main tree, excluding `node_modules` and generated output:

```text
docs/
  spec.md
  plan.md
  phase1-technical-handoff.md

src/
  App.tsx
  main.tsx
  styles.css
  domain/
  storage/
  store/

src-tauri/
  tauri.conf.json
  Cargo.toml
  capabilities/
  src/
```

Directory roles:

- `docs/`: product specification, implementation plan, and this handoff.
- `src/domain/`: TypeScript types, Zod validation, pure domain functions, and repository interfaces.
- `src/store/`: Zustand state management, autosave, startup sequencing, close guard.
- `src/storage/`: implementations of the `VaultStorage` interface for Tauri and browser memory.
- `src/App.tsx`: React UI and direct Tauri dialog/opener usage.
- `src-tauri/`: Tauri runtime configuration and Rust app entry point.

Layer separation as implemented:

- `src/domain/*` does not import React or Tauri APIs. It imports `zod` and local types/functions only. Evidence: `src/domain/schema.ts`, `src/domain/transition.ts`, `src/domain/focus.ts`, `src/domain/monthlyStats.ts`, `src/domain/libraryFilters.ts`.
- `src/storage/tauriVaultStorage.ts` imports Tauri FS APIs and implements `VaultStorage`.
- `src/App.tsx` imports Tauri path/dialog/opener APIs directly.
- `src/store/vaultStore.ts` imports domain functions and repository interfaces, and owns app state, autosave, and several update operations.

## 3. Data Model

Source: `src/domain/types.ts`

```ts
export type Status =
  | "idea"
  | "loop"
  | "arrange"
  | "mix"
  | "done"
  | "hold"
  | "abandoned";

export type AssetType = "midi" | "audio" | "flp" | "other";

export interface SongIdea {
  id: string;
  title: string;
  bpm?: number;
  key?: string;
  genre?: string;
  moods: string[];
  status: Status;
  prevStatus?: Status;
  nextAction: {
    text: string;
    updatedAt: string;
  };
  chordMemo: string;
  references: { title: string; url?: string; memo?: string }[];
  assets: {
    id: string;
    type: AssetType;
    path?: string;
    memo?: string;
    missing?: boolean;
  }[];
  chordDrip?: unknown;
  statusHistory: { status: Status; at: string }[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface VaultFile {
  app: "loopvault";
  fileVersion: 1;
  settings: { monthlyGoal: number };
  ideas: SongIdea[];
}
```

Field meanings and validation:

| Field | Required | Actual meaning / validation |
|---|---:|---|
| `id` | yes | UUID string. Enforced by `songIdeaSchema` in `src/domain/schema.ts`. |
| `title` | yes | 1-80 chars. Enforced by schema and trimmed/sliced on create. |
| `bpm` | no | Integer 40-300. Enforced by schema. |
| `key` | no | Free string. No musical key enum validation. |
| `genre` | no | Free string. |
| `moods` | yes | String array. |
| `status` | yes | One of `Status`. |
| `prevStatus` | no | Used when restoring from `hold` or `abandoned`. |
| `nextAction.text` | yes | Single Next Action text. Empty string is allowed. |
| `nextAction.updatedAt` | yes | ISO datetime string. |
| `chordMemo` | yes | Free text chord/progression memo. |
| `references` | yes | Array of `{ title, url?, memo? }`. URL must be valid if present. |
| `assets` | yes | Array of local asset references. File contents are not stored. |
| `chordDrip` | no | `unknown`; no implemented schema or behavior yet. |
| `statusHistory` | yes | Array of `{ status, at }`. |
| `createdAt` | yes | ISO datetime string. |
| `updatedAt` | yes | ISO datetime string. |
| `completedAt` | no | First completion timestamp for Done. |
| `settings.monthlyGoal` | yes | Integer >= 1. |

Status meanings inferred from implementation:

| Status | Implementation meaning |
|---|---|
| `idea` | Initial pipeline stage. |
| `loop` | Second active pipeline stage. |
| `arrange` | Third active pipeline stage. |
| `mix` | Fourth active pipeline stage. |
| `done` | Completed stage; sets `completedAt` on first entry. |
| `hold` | Inactive pause state with `prevStatus` restore target. |
| `abandoned` | Inactive abandoned state with `prevStatus` restore target. |

## 4. Core Logic

### Status transition

Source: `src/domain/transition.ts`

```ts
export type TransitionErrorCode =
  | "already-in-status"
  | "invalid-jump"
  | "missing-restore-target"
  | "invalid-restore-target";

export type TransitionResult =
  | { ok: true; idea: SongIdea }
  | {
      ok: false;
      error: {
        code: TransitionErrorCode;
        message: string;
      };
    };

export function transition(
  idea: SongIdea,
  to: Status,
  now: Date,
): TransitionResult
```

Inputs: current `SongIdea`, destination `Status`, explicit `Date`.

Outputs: success with updated `SongIdea`, or failure with `TransitionErrorCode`.

Actual behavior:

- Same-status transition is rejected with `already-in-status`.
- Pipeline statuses are `idea -> loop -> arrange -> mix -> done`.
- Pipeline moves must be adjacent. Skips such as `idea -> mix` are rejected.
- Moving to `hold` or `abandoned` is always allowed.
- Restoring from `hold` or `abandoned` is allowed only to `prevStatus`.
- Entering `done` sets `completedAt` only if it was not already set.
- Successful transitions append to `statusHistory` and update `updatedAt`.

Called from: `transitionIdea()` in `src/store/vaultStore.ts`, then UI handlers in `src/App.tsx`.

Purity: pure function. It has no side effects, no direct `Date.now()`, and no global state dependency.

### Focus selection

Source: `src/domain/focus.ts`

```ts
export interface FocusCandidate {
  idea: SongIdea;
  statusWeight: number;
  idleMs: number;
  idleDays: number;
}

export interface StaleIdea {
  idea: SongIdea;
  idleDays: number;
  suggestHold: boolean;
}

export interface PickFocusResult {
  focus?: SongIdea;
  candidates: FocusCandidate[];
  needsNextAction: SongIdea[];
  stale: StaleIdea[];
}

export function pickFocus(ideas: SongIdea[], now: Date): PickFocusResult
```

Inputs: `SongIdea[]`, explicit `Date`.

Outputs: focus candidate, sorted candidates, items needing Next Action, stale items.

Actual behavior:

- Active statuses are `idea`, `loop`, `arrange`, `mix`.
- Status weights are `idea=1`, `loop=2`, `arrange=3`, `mix=4`.
- Items with blank `nextAction.text` are excluded from `candidates` and placed in `needsNextAction`.
- Candidate sort order is status weight descending, idle time descending, then title ascending.
- Stale means idle time greater than 7 days.
- Hold suggestion means idle time greater than 14 days.
- `hold`, `abandoned`, and `done` are excluded from focus and stale lists.

Called from: `HomeView` in `src/App.tsx`.

Purity: pure function. No side effects and no global clock access.

### Monthly stats

Source: `src/domain/monthlyStats.ts`

```ts
export interface MonthDoneCount {
  year: number;
  month: number;
  label: string;
  doneCount: number;
}

export interface MonthlyStats {
  year: number;
  month: number;
  doneCount: number;
  goal: number;
  remainingDays: number;
  pipelineCounts: Record<Status, number>;
  trailingMonths: MonthDoneCount[];
}

export function monthlyStats(
  ideas: SongIdea[],
  now: Date,
  goal: number,
): MonthlyStats
```

Inputs: `SongIdea[]`, explicit `Date`, monthly goal.

Outputs: current month count, goal, remaining days, pipeline counts, trailing 12-month counts.

Actual behavior:

- `goal` is normalized with `Math.max(1, Math.trunc(goal))`.
- Current month `doneCount` uses `completedAt`.
- `remainingDays` is `daysInMonth(now) - now.getDate()`.
- `pipelineCounts` counts every status, including inactive statuses.
- `trailingMonths` uses first `done` entry in `statusHistory`, falling back to `completedAt`.

Called from: `HomeView` in `src/App.tsx`.

Purity: pure function. No side effects and no global clock access.

### Library filtering and sorting

Source: `src/domain/libraryFilters.ts`

```ts
export type SortField = "updatedAt" | "createdAt" | "bpm";
export type SortDirection = "asc" | "desc";

export interface IdeaFilters {
  statuses?: Status[];
  genres?: string[];
  moods?: string[];
  query?: string;
}

export interface IdeaSort {
  field: SortField;
  direction: SortDirection;
}

export function filterIdeas(
  ideas: SongIdea[],
  filters: IdeaFilters = {},
): SongIdea[]

export function sortIdeas(ideas: SongIdea[], sort: IdeaSort): SongIdea[]

export function filterAndSortIdeas(
  ideas: SongIdea[],
  filters: IdeaFilters,
  sort: IdeaSort,
): SongIdea[]
```

Inputs: ideas, optional filters, sort field/direction.

Actual behavior:

- Status filter matches exact status.
- Genre and mood filters are normalized by trimming and lowercasing.
- Query searches `title`, `chordMemo`, and `nextAction.text`.
- Sort fields are `updatedAt`, `createdAt`, and `bpm`.
- For BPM sort, `undefined` BPM records are always last.

Called from: `LibraryView` in `src/App.tsx`.

Purity: pure functions. No side effects.

### Next Action update and completion

Source: `src/store/vaultStore.ts`, `src/App.tsx`

```ts
updateNextAction: (id: string, text: string, now?: Date) => void;
```

Implementation:

```ts
updateNextAction(id, text, actionNow = now()) {
  const updatedAt = actionNow.toISOString();
  applyVaultChange((vault) => ({
    ...vault,
    ideas: vault.ideas.map((idea) =>
      idea.id === id
        ? {
            ...idea,
            nextAction: { text, updatedAt },
            updatedAt,
          }
        : idea,
    ),
  }));
}
```

Actual behavior:

- Updates `nextAction.text`.
- Updates `nextAction.updatedAt`.
- Updates parent `SongIdea.updatedAt`.
- Schedules autosave through `applyVaultChange()`.

Completion behavior:

- There is no separate pure domain function for completing Next Action.
- UI completion is implemented by calling `updateNextAction(id, "", new Date())`.
- This means "completed" is represented as an empty Next Action, not as a history event.

Purity: not pure. This is a Zustand store action with state updates and autosave scheduling.

## 5. Persistence And Startup Sequence

### Storage format and paths

Source: `src/domain/repository.ts`

```ts
export const VAULT_DIR = "loopvault";
export const DATA_PATH = `${VAULT_DIR}/data.json`;
export const TEMP_DATA_PATH = `${DATA_PATH}.tmp`;
export const BACKUP_DIR = `${VAULT_DIR}/backups`;
export const MAX_BACKUPS = 20;
```

Data is stored as pretty-printed JSON with a trailing newline:

```ts
export function serializeVault(vault: VaultFile): string {
  return `${JSON.stringify(vaultFileSchema.parse(vault), null, 2)}\n`;
}
```

Tauri storage uses `BaseDirectory.AppData` unless the call is marked `external`.
Source: `src/storage/tauriVaultStorage.ts`

### Repository interfaces

Source: `src/domain/repository.ts`

```ts
export interface VaultBackup {
  name: string;
  path: string;
  createdAt: string;
}

export interface VaultLoadResult {
  vault: VaultFile;
  quarantine: QuarantinedRecord[];
  created: boolean;
}

export interface VaultRepository {
  load(): Promise<VaultLoadResult>;
  save(vault: VaultFile): Promise<void>;
  exportTo(path: string): Promise<void>;
  importFrom(path: string, options?: VaultImportOptions): Promise<VaultLoadResult>;
  listBackups(): Promise<VaultBackup[]>;
  restore(backupName: string): Promise<VaultLoadResult>;
}

export type VaultImportMode = "replace" | "merge";

export interface VaultImportOptions {
  mode?: VaultImportMode;
}

export interface VaultStorage {
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readText(path: string, options?: { external?: boolean }): Promise<string>;
  writeText(
    path: string,
    contents: string,
    options?: { external?: boolean },
  ): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
}
```

Actual implementation:

- `JsonVaultRepository` implements `VaultRepository`.
- `TauriVaultStorage` implements `VaultStorage` using Tauri plugin FS.
- `BrowserMemoryVaultStorage` implements `VaultStorage` using in-memory maps for browser preview.
- `defaultVaultStore` chooses Tauri storage if `__TAURI_INTERNALS__` exists, otherwise browser memory.

Sources: `src/domain/repository.ts`, `src/storage/tauriVaultStorage.ts`, `src/storage/browserMemoryVaultStorage.ts`, `src/store/defaultVaultStore.ts`

### Save trigger

Source: `src/store/vaultStore.ts`

- `applyVaultChange()` sets `unsaved: true` and schedules save.
- Autosave uses a default debounce of 500ms.
- `flush()` writes immediately if `unsaved` is true.
- `exportVault()` flushes pending changes before export.
- `registerBrowserCloseGuard()` and `registerTauriCloseGuard()` protect close when `unsaved` or `saving` is true.

### Backup and rotation

Source: `src/domain/repository.ts`

- On successful `load()` of an existing vault, `createStartupBackup()` copies `data.json` into `loopvault/backups`.
- Backup filename format is `data-YYYYMMDD-HHmm.json`.
- Rotation keeps newest 20 backups.
- Corrupt JSON is moved to `data.corrupt-YYYYMMDD-HHmmss.json`.

### Startup cases actually implemented

Source: `src/domain/repository.ts`, `src/domain/schema.ts`, `src/store/vaultStore.ts`

| Case | Actual behavior |
|---|---|
| `data.json` missing | Create empty vault, save it, return `created: true`. |
| JSON syntax damage | Move original file to `data.corrupt-*`, enter store `recovery` mode. |
| Individual invalid idea record | Keep valid ideas, return invalid records in `quarantine`. |
| Newer `fileVersion` | Throw `future-version`, enter store `readonly` mode. |
| Other load failure | Store enters `error` mode. |

## 6. State Management

Source: `src/store/vaultStore.ts`

```ts
export type LoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "recovery"
  | "readonly"
  | "error";

export interface RecoveryState {
  kind: "corrupt-json";
  message: string;
  corruptPath?: string;
  backups: VaultBackup[];
}

export interface ReadonlyState {
  kind: "future-version";
  message: string;
  fileVersion?: number;
}

export interface VaultStoreState {
  ideas: SongIdea[];
  settings: VaultFile["settings"];
  loadStatus: LoadStatus;
  quarantine: QuarantinedRecord[];
  recovery?: RecoveryState;
  readonly?: ReadonlyState;
  unsaved: boolean;
  saving: boolean;
  lastSavedAt?: string;
  backups: VaultBackup[];
  error?: string;
  initialize: () => Promise<void>;
  createIdea: (title: string, status?: Status) => string | undefined;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  deleteIdea: (id: string) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  setMonthlyGoal: (goal: number) => void;
  refreshBackups: () => Promise<void>;
  exportVault: (path: string) => Promise<void>;
  importVault: (path: string, mode: VaultImportMode) => Promise<void>;
  restoreBackup: (backupName: string) => Promise<void>;
  flush: () => Promise<void>;
}
```

Responsibility split:

- Store calls pure domain logic for status transitions only through `transition()`.
- Store owns creation, generic updates, Next Action updates, monthly goal update, delete, autosave, recovery mapping, import/export calls, and backup restore.
- Focus, monthly stats, and library filtering are called directly from UI, not from store.

This means the store is not just a thin wrapper around domain functions. It contains meaningful application logic.

## 7. MIDI And Music-Related Implementation

Implemented:

- `bpm?: number`
- `key?: string`
- `genre?: string`
- `moods: string[]`
- `chordMemo: string`
- `assets[].type: "midi" | "audio" | "flp" | "other"`
- `assets[].path?: string`
- `chordDrip?: unknown`

Source: `src/domain/types.ts`

Asset open whitelist:

Source: `src/domain/assetSecurity.ts`

```ts
const openableExtensions = new Set([
  ".flp",
  ".mid",
  ".midi",
  ".wav",
  ".mp3",
  ".flac",
  ".zip",
]);

export function assetExtension(path: string): string

export function canOpenAssetPath(path: string | undefined): boolean

export function openableAssetExtensions(): string[]
```

Not implemented:

- MIDI file parsing.
- MIDI-to-chord detection.
- Audio analysis.
- BPM/key auto-detection.
- Structured `chordDrip` schema.
- DAW integration beyond opening local files and revealing folders.

Storage format:

- The vault stores file paths and metadata only.
- It does not embed MIDI/audio/project file bytes.

## 8. Tests

Test files:

- `src/domain/smoke.test.ts`: scaffold smoke test.
- `src/domain/assetSecurity.test.ts`: allowed music/audio/project extensions and blocked executable extensions.
- `src/domain/focus.test.ts`: focus priority, idle-time tie-breaks, missing Next Action separation, stale and Hold thresholds, inactive exclusions.
- `src/domain/libraryFilters.test.ts`: status/genre/mood/query filtering and updated/created/BPM sorting.
- `src/domain/monthlyStats.test.ts`: current-month Done count, local timezone boundaries, pipeline counts, trailing 12-month Done counts.
- `src/domain/transition.test.ts`: invalid jumps, Hold/Abandoned restore, Done revisit, status history.
- `src/domain/schema.test.ts`: valid vault parsing, invalid JSON, quarantining invalid records.
- `src/domain/repository.test.ts`: tmp rename save, 20-generation backups, first launch, corrupt JSON move, quarantine, future fileVersion, import merge, invalid import safety.
- `src/store/vaultStore.test.ts`: repository load, autosave debounce, flush, Next Action update, transition integration, recovery/readonly states, restore, export, import, save failure, weekly workflow simulation.

Covered:

- Most domain logic.
- Repository abnormal cases.
- Store startup, autosave, import/export, backup restore, and save failure.

Not covered:

- React component rendering behavior.
- Native Tauri dialog/opener behavior.
- End-to-end desktop workflows.
- `closeGuard` behavior.
- MIDI/chord parsing, because it is not implemented.

Latest known test result from this session:

```text
9 test files passed
49 tests passed
```

## 9. Extension Points And Constraints

For a feature that generates `SongIdea` from input data, the most natural placement is:

- Add validation or transformation functions under `src/domain/` if the logic is pure.
- Reuse `SongIdea`, `VaultFile`, `songIdeaSchema`, `createEmptyVault`, `assetSecurity`, and `VaultRepository`.
- Call store actions from UI or add a dedicated store action if the operation creates or updates ideas.
- Keep Tauri file dialogs and native file access outside `src/domain/`.

Useful existing code:

- `SongIdea` and `VaultFile`: `src/domain/types.ts`
- `songIdeaSchema` and `vaultFileSchema`: `src/domain/schema.ts`
- `createEmptyVault`, `serializeVault`, `mergeVaults`: `src/domain/repository.ts`
- `transition`: `src/domain/transition.ts`
- `pickFocus`: `src/domain/focus.ts`
- `monthlyStats`: `src/domain/monthlyStats.ts`
- `filterAndSortIdeas`: `src/domain/libraryFilters.ts`
- `canOpenAssetPath`: `src/domain/assetSecurity.ts`

Constraints and technical debt:

- `src/App.tsx` is large and mixes UI, local form state, Tauri dialog/opener calls, and some workflow rules.
- `createIdea`, `updateIdea`, and `updateNextAction` are store-level logic, not pure domain functions.
- `chordDrip` is currently `unknown`, so a future structured Chord Drip import needs a schema and migration strategy.
- `HomeView` captures `now` once with `useMemo(() => new Date(), [])`; stale days and monthly progress do not tick while the view stays mounted.
- Import failure is caught inside `importVault()`, but `SettingsDialog.importData()` always shows `"Import complete."` after awaiting it. This can show success even after failure.
- UI tests are absent.

## 10. Spec Differences And Known Issues

- Current implementation goes beyond Phase 1. UI, store, import/export, backup restore, README, and checklist exist.
- `chordDrip` exists only as `unknown`; structured Chord Drip import is not implemented.
- Next Action completion is represented by clearing the text. There is no completion history or dedicated domain function.
- Import failure can still produce an `"Import complete."` toast because `SettingsDialog.importData()` does not inspect `store.error`.
- Tauri close guard message in `src/store/closeGuard.ts` is mojibake and should be fixed.
- Tauri FS capability allows AppData/LocalData scope. Import/export uses external paths, so the exact native permission behavior for arbitrary file locations should be manually verified.
- Library domain supports arrays for statuses/genres/moods, but the UI exposes single status/genre/mood inputs.
- `HomeView` time-dependent calculations are not automatically refreshed after mount.
- No UI or E2E tests exist yet.

