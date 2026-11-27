# Loop Vault Current App Technical Handoff

This document reports the current implementation of Loop Vault as it exists in code. It is not a restatement of `docs/spec.md`. When the implementation differs from the spec, this document calls that out as a known issue or spec difference.

Verification at the time this document was created:

- `npm.cmd test`: 9 test files passed, 49 tests passed.
- `npm.cmd run build`: passed. This runs `tsc && vite build`.
- There is no `lint` script in `package.json`, so lint status is not available.

## 1. Implementation Summary

### App Shell

- Shows the app title, view tabs, Settings button, New button, and save status (`Saving`, `Pending`, `Saved`). Entry point: `AppShell` in `src/App.tsx`.
- Initializes the vault on mount and registers browser/Tauri close guards. Entry points: `App()` in `src/App.tsx`, `initialize()` in `src/store/vaultStore.ts`, `registerBrowserCloseGuard()` / `registerTauriCloseGuard()` in `src/store/closeGuard.ts`.
- Shows recovery, read-only, loading, or generic error states instead of the main app when startup is not ready. Entry point: `StartupState` in `src/App.tsx`.

### Home / Focus

- Shows monthly completion progress and remaining days. Entry points: `HomeView` in `src/App.tsx`, `monthlyStats()` in `src/domain/monthlyStats.ts`.
- Picks one focus candidate from active ideas with a non-empty Next Action. Entry points: `HomeView` in `src/App.tsx`, `pickFocus()` in `src/domain/focus.ts`.
- Lists ideas that need a Next Action. Entry point: `HomeView` in `src/App.tsx`.
- Lists stale ideas and allows moving 14+ day stale ideas to `hold`. Entry points: `HomeView` in `src/App.tsx`, `transitionIdea()` in `src/store/vaultStore.ts`.
- Allows clearing the focused idea's Next Action. Entry point: `HomeView.completeNext()` in `src/App.tsx`.

### Library

- Searches ideas by title, chord memo, and Next Action text. Entry points: `LibraryView` in `src/App.tsx`, `filterAndSortIdeas()` in `src/domain/libraryFilters.ts`.
- Filters by one status, one genre string, and one mood string in the UI. Entry point: `LibraryView` in `src/App.tsx`.
- Sorts by updated date, created date, or BPM. Entry points: `LibraryView` in `src/App.tsx`, `sortIdeas()` in `src/domain/libraryFilters.ts`.
- Opens an idea detail view by clicking its card. Entry point: `openDetail()` in `src/App.tsx`.

### Detail

- Edits title, BPM, key, genre, moods, and chord memo. Entry point: `DetailView` in `src/App.tsx`, using `updateIdea()` from `src/store/vaultStore.ts`.
- Updates or clears the single Next Action. Entry points: `DetailView.saveNext()`, `DetailView.completeNext()` in `src/App.tsx`, `updateNextAction()` in `src/store/vaultStore.ts`.
- Moves between statuses using domain transition logic. Entry points: `DetailView.moveStatus()` in `src/App.tsx`, `transitionIdea()` in `src/store/vaultStore.ts`, `transition()` in `src/domain/transition.ts`.
- Adds and removes references. Entry points: `addReference()` / `removeReference()` in `src/App.tsx`.
- Adds, removes, opens, reveals, and relinks assets. Entry points: `addAsset()`, `removeAsset()`, `openAsset()`, `showAsset()`, `replaceAssetPath()` in `src/App.tsx`.
- Shows status history. Entry point: `DetailView` in `src/App.tsx`.
- Deletes an idea after confirmation and gives a 5-second Undo toast. Entry points: `requestDelete()` / `undoDelete()` in `src/App.tsx`, `deleteIdea()` in `src/store/vaultStore.ts`.

### Create Dialog

- Creates a new idea with a title and initial pipeline status. Entry points: `CreateDialog` / `handleCreate()` in `src/App.tsx`, `createIdea()` in `src/store/vaultStore.ts`.
- Initial status options are limited to `idea`, `loop`, `arrange`, `mix`, and `done` because `CreateDialog` maps over `pipeline`, not all statuses. Entry point: `CreateDialog` in `src/App.tsx`.

### Settings

- Displays the app data path by calling `appDataDir()` and appending `loopvault/data.json`. Entry point: `SettingsDialog` in `src/App.tsx`.
- Opens the app data folder. Entry point: `openDataFolder()` in `src/App.tsx`.
- Edits monthly goal. Entry points: `SettingsDialog` in `src/App.tsx`, `setMonthlyGoal()` in `src/store/vaultStore.ts`.
- Exports a JSON copy. Entry points: `exportData()` in `src/App.tsx`, `exportVault()` in `src/store/vaultStore.ts`, `JsonVaultRepository.exportTo()` in `src/domain/repository.ts`.
- Imports JSON with `merge` or `replace`. Entry points: `importData()` in `src/App.tsx`, `importVault()` in `src/store/vaultStore.ts`, `JsonVaultRepository.importFrom()` in `src/domain/repository.ts`.
- Lists and restores backups. Entry points: `SettingsDialog`, `restore()` in `src/App.tsx`, `refreshBackups()` / `restoreBackup()` in `src/store/vaultStore.ts`.

## 2. Project Structure And Layer Separation

Main tree, excluding `node_modules` and generated output:

```text
docs/
  spec.md
  plan.md
  phase1-technical-handoff.md
  current-app-technical-handoff.md

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

Roles:

- `src/App.tsx`: React UI, local UI state, form handlers, Tauri dialog/opener calls.
- `src/main.tsx`: React root mounting.
- `src/styles.css`: Tailwind base/styles.
- `src/domain/types.ts`: core TypeScript data model.
- `src/domain/schema.ts`: Zod schemas and vault JSON parsing.
- `src/domain/transition.ts`: status transition domain logic.
- `src/domain/focus.ts`: Focus candidate and stale item selection.
- `src/domain/monthlyStats.ts`: current-month and trailing-month aggregation.
- `src/domain/libraryFilters.ts`: Library filtering and sorting.
- `src/domain/assetSecurity.ts`: local asset extension whitelist logic.
- `src/domain/repository.ts`: repository interfaces and JSON repository implementation.
- `src/storage/tauriVaultStorage.ts`: Tauri filesystem implementation of `VaultStorage`.
- `src/storage/browserMemoryVaultStorage.ts`: in-memory browser-preview implementation of `VaultStorage`.
- `src/store/vaultStore.ts`: Zustand vanilla store, startup sequence, autosave, CRUD, import/export/restore.
- `src/store/defaultVaultStore.ts`: selects Tauri or browser memory storage.
- `src/store/closeGuard.ts`: unsaved/saving close protection.
- `src-tauri/capabilities/default.json`: Tauri permissions and filesystem scope.
- `src-tauri/src/lib.rs`: Tauri plugin registration.

Layer separation as implemented:

- UI layer: `src/App.tsx`, `src/main.tsx`.
- State layer: `src/store/*`.
- Domain layer: `src/domain/*`.
- Persistence layer: `src/domain/repository.ts` for interfaces and JSON repository behavior; `src/storage/*` for concrete storage adapters.

The domain layer does not import React, Zustand, or Tauri APIs. Actual imports in `src/domain/*` are local types/functions and `zod` in `src/domain/schema.ts`. The Tauri APIs are imported in `src/App.tsx`, `src/storage/tauriVaultStorage.ts`, and `src/store/closeGuard.ts`. Zustand is imported in `src/store/vaultStore.ts` and `src/App.tsx`.

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

Related parse/validation types from `src/domain/schema.ts`:

```ts
export interface QuarantinedRecord {
  index: number;
  value: unknown;
  issues: z.ZodIssue[];
}

export type VaultParseIssue =
  | {
      kind: "invalid-json";
      message: string;
    }
  | {
      kind: "future-version";
      fileVersion: number;
    }
  | {
      kind: "invalid-vault";
      issues: z.ZodIssue[];
    };

export type VaultParseResult =
  | {
      ok: true;
      vault: VaultFile;
      quarantine: QuarantinedRecord[];
    }
  | {
      ok: false;
      error: VaultParseIssue;
    };
```

Field table:

| Field | Required | Values / validation | Meaning |
|---|---:|---|---|
| `SongIdea.id` | yes | UUID by schema | Stable idea id. |
| `title` | yes | string, 1-80 chars | Idea title. |
| `bpm` | no | integer 40-300 | BPM metadata. |
| `key` | no | any string | Musical key text; no enum validation. |
| `genre` | no | any string | Genre label. |
| `moods` | yes | string array | Mood labels. |
| `status` | yes | `Status` | Current pipeline/inactive state. |
| `prevStatus` | no | `Status` | Restore target from `hold` or `abandoned`. |
| `nextAction.text` | yes | string, empty allowed | Single active next step. |
| `nextAction.updatedAt` | yes | ISO datetime with offset | Next Action update time. |
| `chordMemo` | yes | string | Free-text chord progression memo. |
| `references` | yes | array of `{ title, url?, memo? }` | Reference tracks/links. |
| `assets` | yes | array of asset objects | Local project/MIDI/audio path references. |
| `chordDrip` | no | `unknown` | Placeholder for future Chord Drip payload. |
| `statusHistory` | yes | array of `{ status, at }` | Transition history. |
| `createdAt` | yes | ISO datetime with offset | Creation time. |
| `updatedAt` | yes | ISO datetime with offset | Last app-level update time. |
| `completedAt` | no | ISO datetime with offset | First Done timestamp. |
| `VaultFile.app` | yes | `"loopvault"` | File app marker. |
| `VaultFile.fileVersion` | yes | `1` | Supported vault version. |
| `VaultFile.settings.monthlyGoal` | yes | integer >= 1 | Monthly done goal. |
| `VaultFile.ideas` | yes | `SongIdea[]` | Stored ideas. |

Status transition reality:

| Status | Meaning in current implementation | Can transition to |
|---|---|---|
| `idea` | Active initial idea stage | `loop`, `hold`, `abandoned` |
| `loop` | Active loop stage | `idea`, `arrange`, `hold`, `abandoned` |
| `arrange` | Active arrangement stage | `loop`, `mix`, `hold`, `abandoned` |
| `mix` | Active mix stage | `arrange`, `done`, `hold`, `abandoned` |
| `done` | Completed stage | `mix`, `hold`, `abandoned` |
| `hold` | Inactive paused state | only its recorded `prevStatus` |
| `abandoned` | Inactive abandoned state | only its recorded `prevStatus` |

Settings:

- The only persisted setting is `settings.monthlyGoal`.
- Data path is not stored in settings. It is computed/displayed in `SettingsDialog` with `appDataDir()` plus `loopvault/data.json`.
- The save format is the `VaultFile` JSON object in `loopvault/data.json`.

## 4. Core Logic

### Status Transition

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

Input: current idea, target status, explicit current time.

Output: updated idea on success or a structured transition error on failure.

Behavior:

- Rejects same-status moves.
- Allows only adjacent pipeline moves among `idea`, `loop`, `arrange`, `mix`, `done`.
- Allows moving any status to `hold` or `abandoned`.
- Allows restoring from `hold` or `abandoned` only to `prevStatus`.
- Sets `completedAt` only on the first successful move to `done`.
- Appends every successful transition to `statusHistory`.
- Updates `updatedAt` on successful transition.

Callers: `transitionIdea()` in `src/store/vaultStore.ts`, then `DetailView.moveStatus()` and stale Hold action in `src/App.tsx`.

Purity: pure. It has no side effects, no `Date.now()`, and no global state dependency. Time is injected.

### Focus Selection

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

Input: ideas and explicit current time.

Output: one focus idea, all candidates, active ideas missing Next Action, and stale active ideas.

Behavior:

- Active statuses are `idea`, `loop`, `arrange`, `mix`.
- Weights are `idea=1`, `loop=2`, `arrange=3`, `mix=4`.
- Blank Next Action items are excluded from focus candidates.
- Sort order is status weight descending, idle time descending, title ascending.
- Stale means idle time greater than 7 days.
- Hold suggestion means idle time greater than 14 days.

Caller: `HomeView` in `src/App.tsx`.

Purity: pure. No side effects and no direct clock access.

### Monthly Stats

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

Input: ideas, explicit current time, monthly goal.

Output: current month, done count, normalized goal, remaining days, status counts, trailing 12-month counts.

Behavior:

- Normalizes goal with `Math.max(1, Math.trunc(goal))`.
- Current-month `doneCount` uses `completedAt`.
- Pipeline counts include all statuses.
- Trailing 12-month counts use the first `done` entry in `statusHistory`, falling back to `completedAt`.

Caller: `HomeView` in `src/App.tsx`.

Purity: pure. No side effects and no direct clock access.

### Library Filter / Sort

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

Input: ideas, filter object, sort object.

Output: filtered/sorted ideas.

Behavior:

- `statuses` matches exact status.
- `genres` and `moods` are lowercased/trimmed for comparison.
- `query` searches title, chord memo, and Next Action text.
- BPM sort keeps records without BPM last.

Caller: `LibraryView` in `src/App.tsx`.

Purity: pure. No side effects.

### Next Action Update / Completion

Source: `src/store/vaultStore.ts`, `src/App.tsx`

Store action signature:

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

Input: idea id, replacement Next Action text, optional timestamp.

Output: no return value. It mutates store state through Zustand and schedules autosave.

Behavior:

- Replaces the single `nextAction` slot.
- Updates both `nextAction.updatedAt` and idea `updatedAt`.
- Completion is represented by setting `text` to `""`.
- There is no separate Next Action history or domain function.

Callers: `HomeView.completeNext()`, `DetailView.saveNext()`, `DetailView.completeNext()`, `DetailView.moveStatus()` in `src/App.tsx`.

Purity: not pure. It mutates store state and schedules save. It uses the store-level injected `now()` default if no timestamp is passed.

## 5. State Management

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

Major actions:

- `initialize()`: loads repository data and maps repository errors to startup state.
- `createIdea()`: creates an idea with default empty fields.
- `updateIdea()`: shallow merges partial idea changes and updates `updatedAt`.
- `deleteIdea()`: removes an idea.
- `transitionIdea()`: calls domain `transition()` and applies success.
- `updateNextAction()`: replaces single Next Action.
- `setMonthlyGoal()`: normalizes and saves monthly goal.
- `refreshBackups()`: loads backup list.
- `exportVault()`: flushes pending changes and writes export.
- `importVault()`: imports with `replace` or `merge`.
- `restoreBackup()`: restores selected backup.
- `flush()`: writes current vault if `unsaved` is true.

Responsibility split:

- Store calls `transition()` for status rules.
- Store does not call `pickFocus()`, `monthlyStats()`, or `filterAndSortIdeas()`; UI calls those directly.
- Store owns idea creation, generic update, Next Action update, autosave, startup mapping, import/export, and backup restore.
- Therefore the store is not just a thin wrapper over pure functions. It contains significant app logic.

Autosave and close protection:

- `applyVaultChange()` sets `unsaved: true` and calls `scheduleSave()`.
- `scheduleSave()` debounces `flush()` by `debounceMs`, default `500`.
- `flush()` writes via `repository.save(currentVault(get()))`.
- `registerBrowserCloseGuard()` blocks browser unload if `unsaved` or `saving`.
- `registerTauriCloseGuard()` prevents Tauri close, asks for confirmation, flushes, then closes.

UI access pattern:

- Main vault data is read from Zustand selectors in `App()`.
- UI updates data through store actions passed down as props.
- UI does directly compute derived views by calling pure domain functions (`pickFocus`, `monthlyStats`, `filterAndSortIdeas`).
- UI also has direct Tauri API usage for dialogs/opening files. It does not directly call `JsonVaultRepository`.

## 6. Persistence, Startup, And Data Protection

Source: `src/domain/repository.ts`

```ts
export const VAULT_DIR = "loopvault";
export const DATA_PATH = `${VAULT_DIR}/data.json`;
export const TEMP_DATA_PATH = `${DATA_PATH}.tmp`;
export const BACKUP_DIR = `${VAULT_DIR}/backups`;
export const MAX_BACKUPS = 20;
```

Repository interfaces:

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

Implementation:

- `JsonVaultRepository` implements `VaultRepository`.
- `TauriVaultStorage` implements `VaultStorage` with `@tauri-apps/plugin-fs`.
- `BrowserMemoryVaultStorage` implements `VaultStorage` with in-memory maps for browser preview.
- `defaultVaultStore` chooses Tauri storage when `__TAURI_INTERNALS__` exists, otherwise memory storage.

Save format:

```ts
export function serializeVault(vault: VaultFile): string {
  return `${JSON.stringify(vaultFileSchema.parse(vault), null, 2)}\n`;
}
```

Save location:

- Logical path is `loopvault/data.json`.
- In Tauri, non-external storage uses `BaseDirectory.AppData`.
- The UI displays `appDataDir() + "loopvault/data.json"` in Settings.

Atomic write:

- `save()` writes to `loopvault/data.json.tmp`.
- It then renames that temp file to `loopvault/data.json`.
- This is implemented in `JsonVaultRepository.save()`.

Backup and rotation:

- On successful load of an existing data file, `createStartupBackup()` copies `data.json` to `loopvault/backups/data-YYYYMMDD-HHmm.json`.
- `rotateBackups()` keeps the newest 20 matching backup files.
- Backup listing filters by `data-\d{8}-\d{4}.json`.

Startup behavior:

| Case | Actual behavior |
|---|---|
| First launch / missing `data.json` | Creates an empty vault and saves it. |
| JSON syntax damage | Renames `data.json` to `data.corrupt-YYYYMMDD-HHmmss.json`, throws `invalid-json`, and store enters `recovery`. It does not silently overwrite with an empty vault. |
| Individual invalid idea | Loads valid ideas and returns invalid ones in `quarantine`; UI shows a quarantine notice. |
| `fileVersion > 1` | Throws `future-version`; store enters `readonly`. |
| Other load error | Store enters `error`. |

Import/export:

- Export writes the currently loaded vault as JSON to a selected external path.
- `exportVault()` flushes pending store changes before calling repository export.
- Import reads JSON from an external path.
- Import validates via `parseLoadedVault()` before save.
- `replace` mode uses imported vault.
- `merge` mode merges current and incoming ideas. On id collision, newer `updatedAt` wins.
- Imported invalid records can be quarantined because import uses the same parser.

User-facing import/export error behavior:

- Store catches export/import errors and writes `error`.
- Settings displays `error` in the Import section.
- Known issue: `SettingsDialog.importData()` always shows `"Import complete."` after `await importVault(...)`, even if the store caught an error.

## 7. Music, MIDI, And Asset Implementation

Music fields in `SongIdea`:

```ts
bpm?: number;
key?: string;
genre?: string;
moods: string[];
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
```

Asset type:

```ts
export type AssetType = "midi" | "audio" | "flp" | "other";
```

Source: `src/domain/types.ts`

Asset extension logic from `src/domain/assetSecurity.ts`:

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

export function assetExtension(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLocaleLowerCase() : "";
}

export function canOpenAssetPath(path: string | undefined): boolean {
  return Boolean(path && openableExtensions.has(assetExtension(path)));
}

export function openableAssetExtensions(): string[] {
  return [...openableExtensions].sort();
}
```

File open/reveal behavior:

- Asset picker uses Tauri `openFileDialog()` with allowed music asset extensions.
- `openAsset()` blocks unsupported extensions using `canOpenAssetPath()`.
- `openAsset()` calls Tauri `openPath(asset.path)` for allowed files.
- If opening fails, the asset is marked `missing: true`.
- `showAsset()` calls Tauri `revealItemInDir(asset.path)`.
- Missing assets show `Reset path`, which reopens the file picker and clears `missing`.

Structured music data status:

- BPM and key exist as scalar metadata fields.
- Chord progression is text only in `chordMemo`.
- There is no structured chord list, MIDI note list, audio analysis result, or detected progression type.
- `chordDrip?: unknown` exists but has no schema, parser, UI, or behavior.
- MIDI/audio file bytes are not stored; only local paths and metadata are stored.

## 8. Tests

Test files:

- `src/domain/smoke.test.ts`: basic scaffold smoke test.
- `src/domain/assetSecurity.test.ts`: allowed asset extensions and blocked executable extensions.
- `src/domain/focus.test.ts`: focus priority, idle tie-break, blank Next Action separation, stale/Hold thresholds, inactive exclusions.
- `src/domain/libraryFilters.test.ts`: status/genre/mood/query filtering and date/BPM sorting.
- `src/domain/monthlyStats.test.ts`: current local month counts, timezone boundary behavior, pipeline counts, trailing Done history.
- `src/domain/transition.test.ts`: invalid jumps, Hold/Abandoned restore, Done revisit, status history.
- `src/domain/schema.test.ts`: valid vault parsing, invalid JSON, record quarantine.
- `src/domain/repository.test.ts`: tmp rename save, backup rotation, first launch, corrupt JSON quarantine file, record quarantine, future version, import merge, invalid import safety.
- `src/store/vaultStore.test.ts`: load, autosave debounce, flush, Next Action update, transition integration, recovery/readonly, restore, export/import, save failure, weekly workflow simulation.

Covered:

- Core domain functions.
- JSON parsing and validation.
- Repository save/load/import/export/restore behavior.
- Store startup, autosave, and common state transitions.

Not covered:

- React component rendering.
- User interaction with forms/buttons.
- Native Tauri dialog/opener integration.
- Tauri filesystem permission behavior on real external import/export paths.
- Close guard behavior.
- MIDI/audio parsing, because no such feature exists.

Status:

- `npm.cmd test`: passed, 49 tests.
- `npm.cmd run build`: passed.
- `lint`: no script exists in `package.json`.

## 9. Extension Points And Constraints

For a future feature that generates or appends `SongIdea` records from MIDI/audio/external input:

Recommended layer placement:

- Put pure parsing/normalization logic under `src/domain/`, for example `src/domain/importSources.ts` or `src/domain/musicAnalysis.ts`.
- Keep Tauri file selection, long-running native commands, or filesystem access outside `src/domain/`, likely in UI/service code or a new storage/adapter module.
- Add schema types in `src/domain/schema.ts` if the generated payload becomes persisted.
- Add store actions in `src/store/vaultStore.ts` for async import/analysis flows that create or update ideas.

Reusable existing pieces:

- `SongIdea`, `AssetType`, `VaultFile` from `src/domain/types.ts`.
- `songIdeaSchema`, `vaultFileSchema`, `parseVaultFileJson()` from `src/domain/schema.ts`.
- `createEmptyVault()`, `serializeVault()`, `mergeVaults()` from `src/domain/repository.ts`.
- `canOpenAssetPath()`, `openableAssetExtensions()` from `src/domain/assetSecurity.ts`.
- `createIdea()` can create a minimal idea, but it only accepts `title` and `status`; richer generated records currently require `updateIdea()` after creation or a new store action.
- `updateIdea()` can persist generated metadata, chord memo, references, assets, and future fields.

Path a generated idea should use:

- Prefer store actions over direct repository writes, because store actions update UI state, set `unsaved`, and schedule autosave.
- Direct repository writes would bypass the current in-memory Zustand state and could cause UI/data divergence.
- For a rich generated idea, the cleanest extension would be a new store action such as `createIdeaFromDraft(draft)` that validates or normalizes a domain-level draft and then calls `applyVaultChange()`.

Constraints and technical debt:

- `App.tsx` is large and mixes UI, Tauri API calls, form state, toasts, and some workflow rules.
- Creation logic is minimal: `createIdea(title, status)` cannot accept BPM/key/chord/assets at creation time.
- `updateIdea()` shallow merges `Partial<SongIdea>` and does not run `songIdeaSchema` before saving; validation happens on repository serialization.
- `chordDrip` is `unknown`, so future structured imports need a real type and schema.
- Chord data is text-only in `chordMemo`; there is no structured chord progression field.
- `HomeView` uses `useMemo(() => new Date(), [])`, so time-dependent focus/monthly values do not refresh while the view remains mounted.
- Import/export success UX is not reliable on import failure because Settings always shows `"Import complete."` after `importVault()` resolves.
- Long-running analysis would need new store state such as `analysisStatus`, `analysisError`, or per-job progress. Current store has only broad `loading`, `saving`, and `error`, which are not enough for concurrent or cancellable analysis jobs.
- Current UI has a single global toast string and one global `error`; concurrent async operations could overwrite each other's status.
- Asset opening is extension-based and path-based; there is no file existence preflight before open.

## 10. Spec Differences And Known Issues

- Spec difference / known issue: Import failure can display `"Import complete."` because `SettingsDialog.importData()` does not inspect whether `importVault()` set an error. Sources: `src/App.tsx`, `src/store/vaultStore.ts`.
- Known issue: Tauri close confirmation text in `src/store/closeGuard.ts` is mojibake.
- Spec difference: `chordDrip` is only `unknown`; no structured Chord Drip schema or import pipeline is implemented. Source: `src/domain/types.ts`.
- Spec difference: Next Action completion is stored as empty text. No history of completed Next Actions exists. Sources: `src/App.tsx`, `src/store/vaultStore.ts`.
- Known issue: `HomeView` time-dependent calculations do not refresh while mounted. Source: `src/App.tsx`.
- Spec difference / permission risk: `src-tauri/capabilities/default.json` scopes FS to AppData/LocalData, while import/export use external paths. This should be verified in the packaged Tauri app.
- Known limitation: UI exposes single status/genre/mood filters, although domain filter API supports arrays. Sources: `src/App.tsx`, `src/domain/libraryFilters.ts`.
- Known limitation: No React UI tests or desktop E2E tests exist.
- Known limitation: No MIDI/audio analysis exists. The app stores metadata and local paths only.
- Known limitation: Data path is displayed but not user-configurable or stored in settings.
- Known limitation: `settings` currently contains only `monthlyGoal`; backup policy and storage location are hard-coded. Sources: `src/domain/types.ts`, `src/domain/repository.ts`.

