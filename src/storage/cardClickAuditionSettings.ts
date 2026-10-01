/**
 * P10.0-07 「押して鳴らす」: play a card's notes when it is clicked in the workspace.
 * Device-local only; never written to the Vault. Off by default.
 */
const storageKey = "loop-vault:p10-card-click-audition:v1";

export function getCardClickAudition(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(storageKey) === "on";
  } catch {
    return false;
  }
}

export function setCardClickAudition(enabled: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (enabled) localStorage.setItem(storageKey, "on");
    else localStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable (private mode); the switch then stays off for this session.
  }
}
