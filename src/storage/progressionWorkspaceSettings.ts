const KEY = "loopvault:progression-align-notes";
export function getAlignProgressionNotes(): boolean { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } }
export function setAlignProgressionNotes(value: boolean): void { try { localStorage.setItem(KEY,value?"on":"off"); } catch { /* session still works without storage */ } }
