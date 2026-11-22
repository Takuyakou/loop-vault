import type { CourseLevel } from "../../domain/chordDojo/guidedCourse/bank";
import { ADVANCED_LEVELS, advancedLevelSpec, type AdvancedCourseLevel } from "../../domain/chordDojo/guidedCourse/advanced/levels";

/**
 * P23-45 level selector for the whole guided course. It lists Lv1–8 and 総合確認 with the short
 * ability name, so a learner can practise a later level before promotion without changing the
 * official progress of any level.
 */
export type GuidedLevelChoice = CourseLevel | AdvancedCourseLevel;

export const GUIDED_LEVEL_OPTIONS: readonly { value: GuidedLevelChoice; label: string }[] = [
  { value: 1, label: "Lv1 メジャーとマイナー" },
  { value: 2, label: "Lv2 4種類のセブンス" },
  { value: 3, label: "Lv3 12キーで引き出す" },
  ...ADVANCED_LEVELS.map((spec) => ({ value: spec.level, label: `${spec.label} ${spec.ability}` })),
];

export function guidedLevelLabel(value: GuidedLevelChoice): string {
  if (typeof value === "number" && value <= 3) return `Lv${value}`;
  return advancedLevelSpec(value as AdvancedCourseLevel).label;
}

export function GuidedLevelSelect(props: {
  readonly value: GuidedLevelChoice;
  readonly onChange: (value: GuidedLevelChoice) => void;
  readonly disabled?: boolean;
  /** Marks the level that is currently the official next step. */
  readonly official?: AdvancedCourseLevel | undefined;
}) {
  return <label className="ac-level-select">
    <span className="sr-only">レベルを選ぶ</span>
    <select
      data-testid="guided-level-select"
      aria-label="レベルを選ぶ"
      value={String(props.value)}
      disabled={props.disabled ?? false}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        props.onChange(raw === "capstone" ? "capstone" : (Number(raw) as GuidedLevelChoice));
      }}
    >
      {GUIDED_LEVEL_OPTIONS.map((option) => <option key={String(option.value)} value={String(option.value)}>
        {option.label}{option.value === props.official ? "（公式）" : ""}
      </option>)}
    </select>
  </label>;
}
