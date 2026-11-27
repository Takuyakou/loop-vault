/** K: the names shown for the five choices (no numbers on screen) and for what a card actually plays. */
import type { GeneratedShapeChoice, GeneratedShapeOptions, UsedVoicingShape } from ".";

/** The short names (the band and the menu's button). */
export const SHAPE_LABEL: Readonly<Record<GeneratedShapeChoice, string>> = {
  basic: "基本", shell: "シェル", rootless: "ルートレス", triad: "シェル+三和音", quartal: "4 度積み",
};

const USED_PART_LABEL: Readonly<Record<string, string>> = { tension: "テンション", spread: "広げる" };

/** The name of what a card actually plays (K `used`). */
export function usedShapeName(used: UsedVoicingShape): string {
  if (used === "legacy") return "今までの作り方";
  const [head, ...parts] = used.split("+");
  const name = head === "close" ? "詰めた形" : SHAPE_LABEL[head as GeneratedShapeChoice];
  return [name, ...parts.map((part) => USED_PART_LABEL[part] ?? part)].join(" + ");
}

/** The name of the requested choice and parts (「ルートレス + 広げる」「基本 + テンション」). */
export function requestedShapeName(options: GeneratedShapeOptions): string {
  const parts: string[] = [];
  const basic = options.shape === "basic";
  if (options.tension && (basic || options.shape === "shell")) parts.push("テンション");
  if (options.spread && (basic || options.shape === "shell" || options.shape === "rootless")) parts.push("広げる");
  return [SHAPE_LABEL[options.shape], ...parts].join(" + ");
}
