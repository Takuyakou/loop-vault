/**
 * P10.0-06 developer switch: 「古い取り込み画面を使う（一時）」. The correction
 * workspace is the default after a MIDI analysis; this brings the old screen back
 * until P10.0-07 removes it. Device-local only; never written to the Vault. Off by
 * default. The P10.0-02 key (`loop-vault:p10-workspace:v1`) is not read any more.
 */
const storageKey = "loop-vault:p10-legacy-capture:v1";

export function getLegacyCaptureEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(storageKey) === "on";
  } catch {
    return false;
  }
}

export function setLegacyCaptureEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (enabled) localStorage.setItem(storageKey, "on");
    else localStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable (private mode); the switch then stays off.
  }
}
