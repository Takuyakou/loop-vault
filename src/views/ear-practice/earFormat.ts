export const pct = (value?: number): string => (value === undefined ? "—" : `${Math.round(value * 100)}%`);
export const secText = (value?: number): string => (value === undefined ? "—" : `${value.toFixed(1)}s`);
export const countText = (value?: number): string => (value === undefined ? "—" : value.toFixed(1));

export interface Diff {
  text: string;
  /** Whether it went the better way (more first tries, fewer seconds); `same` when it did not move. */
  better: boolean | "same";
}

/** `↑ +8` (points) for a rate; undefined when either side is missing. */
export function diffRate(now?: number, before?: number): Diff | undefined {
  if (now === undefined || before === undefined) return undefined;
  const points = Math.round(now * 100) - Math.round(before * 100);
  return points === 0 ? { text: "→ ±0", better: "same" } : { text: points > 0 ? `↑ +${points}` : `↓ −${-points}`, better: points > 0 };
}

/** `↓ −0.6` for seconds (fewer is better). */
export function diffSeconds(now?: number, before?: number): Diff | undefined {
  if (now === undefined || before === undefined) return undefined;
  const tenths = Math.round(now * 10) - Math.round(before * 10);
  return tenths === 0 ? { text: "→ ±0", better: "same" } : { text: tenths > 0 ? `↑ +${(tenths / 10).toFixed(1)}` : `↓ −${(-tenths / 10).toFixed(1)}`, better: tenths < 0 };
}

/** A count, fewer is better (listening again, hints). */
export function diffCount(now?: number, before?: number, digits = 0): Diff | undefined {
  if (now === undefined || before === undefined) return undefined;
  const scale = 10 ** digits;
  const change = Math.round(now * scale) - Math.round(before * scale);
  const shown = (Math.abs(change) / scale).toFixed(digits);
  return change === 0 ? { text: "→ ±0", better: "same" } : { text: change > 0 ? `↑ +${shown}` : `↓ −${shown}`, better: change < 0 };
}

/** `10/19` for a Monday (`YYYY-MM-DD`) or the date of an instant in Japan time. */
export function dayLabel(value: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(new Date(value).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
}
