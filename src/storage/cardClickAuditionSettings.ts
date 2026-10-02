/**
 * 「押して鳴らす」: play a card's notes when it is clicked in the workspace.
 * Device-local only; never written to the Vault. On by default since P10.1 §10:
 * "on"/"off" is written, and no value means on (so an earlier "off", which was
 * stored as no value, starts on again).
 */
const storageKey = "loop-vault:p10-card-click-audition:v1";

export function getCardClickAudition(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(storageKey) !== "off";
  } catch {
    return true;
  }
}

export function setCardClickAudition(enabled: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey, enabled ? "on" : "off");
  } catch {
    // Storage can be unavailable (private mode); the switch then keeps its default (on).
  }
}
