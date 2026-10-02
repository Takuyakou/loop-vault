/**
 * 「凡例を出す」 in the workspace's ⚙ menu (P10.2 §1): on by default, device-local only,
 * never written to the Vault.
 */
const storageKey = "loop-vault:p10-legend-visible:v1";

export function getLegendVisible(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(storageKey) !== "off";
  } catch {
    return true;
  }
}

export function setLegendVisible(visible: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey, visible ? "on" : "off");
  } catch {
    // Storage can be unavailable (private mode); the legend then shows.
  }
}
