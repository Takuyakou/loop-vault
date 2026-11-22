/**
 * P23-52 (rule 1, adopted 2026-11-18): while a level's "別の日にもう一度" waits, the next level can start.
 * Only one such check may wait at a time — while Lv1's check waits and Lv2's same-day check is passed, Lv3
 * cannot start until Lv1's check is done. "修了" (passed) still means the delayed check is passed.
 *
 * The course is one line of stations: Lv1, Lv2, Lv3 (basic store), Lv4–Lv7, Lv8, 総合確認 (advanced store).
 * Lv8 counts as one station here (its three groups already wait for each other inside the level).
 */
export type StationId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | "capstone";

export const STATIONS: readonly StationId[] = [1, 2, 3, 4, 5, 6, 7, 8, "capstone"];

export interface StationProgress {
  readonly id: StationId;
  readonly sameDayPassed: boolean;
  readonly delayPassed: boolean;
  /** The delayed check can be taken now (the next day or later, 12 hours or more). */
  readonly delayEligible: boolean;
}

export type StationState =
  /** 修了: the delayed check is passed. */
  | "done"
  /** The same-day check is passed and the delayed check can be taken now (yellow). */
  | "due"
  /** The same-day check is passed; the delayed check opens later. */
  | "waiting"
  /** The station to work on now. */
  | "now"
  /** Not open yet. */
  | "locked";

export interface CourseFrontier {
  /** The first station whose same-day check is not passed, when it may start; undefined when a check must come first. */
  readonly current: StationId | undefined;
  /** The first station whose delayed check can be taken now. */
  readonly due: StationId | undefined;
  readonly states: ReadonlyMap<StationId, StationState>;
}

export function courseFrontier(progress: readonly StationProgress[]): CourseFrontier {
  const states = new Map<StationId, StationState>();
  let pendingBefore = 0;
  let current: StationId | undefined;
  let blocked = false;
  let due: StationId | undefined;
  for (const station of progress) {
    if (station.sameDayPassed && station.delayPassed) {
      states.set(station.id, "done");
      continue;
    }
    if (station.sameDayPassed) {
      states.set(station.id, station.delayEligible ? "due" : "waiting");
      if (station.delayEligible && due === undefined) due = station.id;
      pendingBefore += 1;
      continue;
    }
    if (current === undefined && !blocked) {
      if (pendingBefore <= 1) {
        current = station.id;
        states.set(station.id, "now");
      } else {
        blocked = true;
        states.set(station.id, "locked");
      }
      continue;
    }
    states.set(station.id, "locked");
  }
  return { current, due, states };
}
