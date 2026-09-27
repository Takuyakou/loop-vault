// P8.9-02 device-local shell preferences (never stored in the Vault file).
const STANDARD_TITLE_BAR_KEY = "loop-vault:standard-title-bar:v1";
const SIDEBAR_COLLAPSED_KEY = "loop-vault:sidebar-collapsed:v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readFlag(key: string, storage: StorageLike): boolean | undefined {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as { version?: unknown; value?: unknown };
    return parsed.version === 1 && typeof parsed.value === "boolean" ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function writeFlag(key: string, value: boolean, storage: StorageLike): void {
  try {
    storage.setItem(key, JSON.stringify({ version: 1, value }));
  } catch {
    // A blocked preference store must not break the shell.
  }
}

/** 「標準のタイトルバーを使う」: applied from the next launch. */
export function loadUseStandardTitleBar(storage: StorageLike = window.localStorage): boolean {
  return readFlag(STANDARD_TITLE_BAR_KEY, storage) === true;
}

export function saveUseStandardTitleBar(value: boolean, storage: StorageLike = window.localStorage): void {
  writeFlag(STANDARD_TITLE_BAR_KEY, value, storage);
}

/** The sidebar state the user chose by hand; undefined = follow the window width. */
export function loadSidebarCollapsed(storage: StorageLike = window.localStorage): boolean | undefined {
  return readFlag(SIDEBAR_COLLAPSED_KEY, storage);
}

export function saveSidebarCollapsed(value: boolean, storage: StorageLike = window.localStorage): void {
  writeFlag(SIDEBAR_COLLAPSED_KEY, value, storage);
}
