import bankData from "./bank.json";
import policyData from "./policy.json";

/**
 * P23-40: the product-side read-only view of the P23-39 v3 freeze.
 *
 * The frozen JSON is copied into `src/domain/guidedCourse/` so the product bundle never imports the
 * design area (`src/courseDesign/`). `frozenFixture.test.ts` fails if this copy drifts from
 * `docs/contracts/p23-39/bank-lv1-3-v3.json` / `policy-lv1-3-v3.json`; nothing here generates answers.
 */
export type CourseLevel = 1 | 2 | 3;
export type CoursePrompt = "name" | "ear";
export type CoursePlacement = "root" | "inv1" | "inv2" | "inv3";
export type CourseQuality = "maj" | "min" | "maj7" | "min7" | "dom7" | "min7b5";

export interface CourseEarPrompt {
  readonly kind: "two-choice" | "identify";
  readonly choices: readonly CourseQuality[];
  readonly choiceDisplayed: boolean;
  readonly playbacks: 1;
  readonly rootPresented: true;
  readonly bass: "root";
}

export interface CourseItem {
  readonly id: string;
  readonly level: CourseLevel;
  readonly prompt: CoursePrompt;
  readonly quality: CourseQuality;
  readonly root: number;
  readonly cell: string;
  readonly placement: CoursePlacement;
  readonly referenceNotes: readonly number[];
  readonly requiredPitchClasses: readonly number[];
  readonly allowedPitchClasses: readonly number[];
  readonly bass: "free" | "root";
  readonly judge: "core";
  readonly source: "synthetic-public";
  readonly family: string;
  readonly ear?: CourseEarPrompt;
}

export interface CourseDifferentiation {
  readonly cells: "shared" | "distinct" | "distinct-where-available";
  readonly items: "disjoint";
  readonly placement: "distinct";
  readonly order: "independent";
  readonly sharedCells: number;
  readonly distinctCells: number;
  readonly rule: string;
}

export interface CourseLevelSets {
  readonly name: {
    readonly sameDay: readonly string[];
    readonly delay: readonly string[];
    readonly required: { readonly sameDay: number; readonly delay: number };
    readonly differentiation: CourseDifferentiation;
  };
  readonly ear?: { readonly items: readonly string[]; readonly required: number };
}

export interface CourseBank {
  readonly version: string;
  readonly policyVersion: string;
  readonly contractVersion: string;
  readonly pairId: string;
  readonly seed: number;
  readonly items: readonly CourseItem[];
  readonly order: readonly string[];
  readonly sets: Record<CourseLevel, CourseLevelSets>;
  readonly counts: {
    readonly total: number;
    readonly byLevel: readonly { readonly level: CourseLevel; readonly count: number; readonly name: number; readonly ear: number }[];
    readonly byQuality: readonly { readonly quality: CourseQuality; readonly count: number }[];
    readonly byRoot: readonly { readonly root: number; readonly count: number }[];
  };
}

export interface CourseLevelPolicy {
  readonly questions: number;
  readonly pass: number;
  readonly perQuality?: { readonly min: number; readonly of: number };
  readonly roots: number;
  readonly delay: { readonly questions: number; readonly pass: number };
  readonly speed?: { readonly limitMs: number; readonly ofCorrect: number };
  readonly ear?: { readonly questions: number; readonly pass: number };
}

export interface CoursePolicy {
  readonly version: string;
  readonly bankVersion: string;
  readonly contractVersion: string;
  readonly pairId: string;
  readonly levels: Record<string, CourseLevelPolicy>;
  readonly rules: Readonly<Record<string, string>>;
  readonly answerPolicy: Readonly<Record<string, string>>;
}

export const COURSE_BANK = bankData as unknown as CourseBank;
export const COURSE_POLICY = policyData as unknown as CoursePolicy;

export const COURSE_LEVELS: readonly CourseLevel[] = [1, 2, 3];
export const COURSE_BANK_VERSION = COURSE_BANK.version;
export const COURSE_POLICY_VERSION = COURSE_BANK.policyVersion;
export const COURSE_PAIR_ID = COURSE_BANK.pairId;
export const COURSE_CONTRACT_VERSION = COURSE_BANK.contractVersion;

/** The frozen timing/invalidity values (identical to the P23-39 v3 contract). */
export const SETTLE_MS = 60;
export const CAPTURE_WINDOW_MS = 1500;
export const RESPONSE_TIMEOUT_MS = 10_000;
export const SPEED_LIMIT_MS = 3000;
export const POLL_MS = 10;
export const STALL_MS = 250;
export const CLOCK_JUMP_TOLERANCE_MS = 100;
export const MIN_DELAY_MS = 12 * 60 * 60 * 1000;
export const BPM_MIN = 30;
export const BPM_MAX = 240;

export const BLOCK_LABEL: Readonly<Record<"sameDay" | "delay", string>> = {
  sameDay: "同日",
  delay: "遅延確認",
};

export function courseItemById(id: string): CourseItem | undefined {
  return COURSE_BANK.items.find((item) => item.id === id);
}

export function coursePolicy(level: CourseLevel): CourseLevelPolicy {
  return COURSE_POLICY.levels[String(level)]!;
}

export function courseLevelSets(level: CourseLevel): CourseLevelSets {
  return COURSE_BANK.sets[level];
}

/** The name questions of a same-day attempt, in the frozen presentation order. */
export function sameDayNameIds(level: CourseLevel): readonly string[] {
  return COURSE_BANK.sets[level].name.sameDay;
}

export function sameDayEarIds(level: CourseLevel): readonly string[] {
  return COURSE_BANK.sets[level].ear?.items ?? [];
}

export function delayIds(level: CourseLevel): readonly string[] {
  return COURSE_BANK.sets[level].name.delay;
}

/** Every evaluated item of the same-day evaluation (name block + ear block for Lv1/Lv2). */
export function sameDayIds(level: CourseLevel): readonly string[] {
  return [...sameDayNameIds(level), ...sameDayEarIds(level)];
}

export function itemLabel(item: CourseItem): string {
  const names = ["C", "D♭", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"];
  const suffix: Record<CourseQuality, string> = { maj: "", min: "m", maj7: "maj7", min7: "m7", dom7: "7", min7b5: "m7♭5" };
  return `${names[item.root]}${suffix[item.quality]}`;
}

/** The chord label for an ear prompt (the root is presented; the quality is the answer). */
export function itemRootLabel(item: CourseItem): string {
  return ["C", "D♭", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"][item.root]!;
}
