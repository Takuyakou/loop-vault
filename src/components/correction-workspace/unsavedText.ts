/** Spec v2.5 §10.2: the in-app confirmation when unsaved workspace changes would be lost. No 「破棄」 or 「直し」. */
export const UNSAVED_TITLE = "保存していない変更があります";

export function unsavedMessage(count: number, verb: "閉じる" | "移る" | "開く"): string {
  const action = verb === "閉じる" ? "閉じると" : verb === "移る" ? "移ると" : "開くと";
  return `この曲で直した内容のうち、${count} 件をまだ Vault に保存していません。このまま${action}、その変更は消えます。`;
}
