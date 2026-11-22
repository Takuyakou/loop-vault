import type { ReactNode } from "react";

/**
 * P23-26 S4: one settings row — the name and its explanation on the left, the control on the right.
 * Used by the whole screen so every row reads the same way.
 */
export function SettingsRow({
  title,
  description,
  control,
  badge,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly control: ReactNode;
  /** A small 「足す」 mark for a setting this release adds. */
  readonly badge?: string;
}) {
  return (
    <div className="lv-settings-row">
      <div className="lv-settings-row-text">
        <b>
          {title}
          {badge ? <em className="lv-settings-row-badge">{badge}</em> : null}
        </b>
        {description ? <span>{description}</span> : null}
      </div>
      <div className="lv-settings-row-control">{control}</div>
    </div>
  );
}
