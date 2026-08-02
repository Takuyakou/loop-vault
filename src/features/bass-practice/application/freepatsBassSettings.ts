export type BassPracticeTimbreSetting = "freepats" | "synth";

const STORAGE_KEY = "loop-vault:bass-practice-timbre:v1";

export function readBassPracticeTimbreSetting(storage: Pick<Storage, "getItem"> | undefined = browserStorage()): BassPracticeTimbreSetting {
  return storage?.getItem(STORAGE_KEY) === "synth" ? "synth" : "freepats";
}

export function writeBassPracticeTimbreSetting(value: BassPracticeTimbreSetting, storage: Pick<Storage, "setItem"> | undefined = browserStorage()): void {
  storage?.setItem(STORAGE_KEY, value);
}

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}