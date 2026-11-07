import { Select } from "../../../../components/ui/controls";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import type { ChannelMode } from "../domain/types";
import { useRecordChannel } from "../application/recordChannelStore";

/**
 * Practice Settings control for Record & Compare (acceptance feedback / brief
 * §16). It shares the persisted input-channel value with the Record & Compare
 * panel, so changing it in either place stays in sync. Renders only when the
 * feature flag is on.
 */

const CHANNELS: readonly { readonly value: ChannelMode; readonly label: string }[] = [
  { value: "auto", label: "自動" },
  { value: "left", label: "左（入力1）" },
  { value: "right", label: "右（入力2）" },
  { value: "mono-sum", label: "左右を合わせる（モノ）" },
];

export interface BassPracticeRecordingSettingsSectionProps {
  readonly enabledOverride?: boolean;
}

export function BassPracticeRecordingSettingsSection({
  enabledOverride,
}: BassPracticeRecordingSettingsSectionProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const [channel, setChannel] = useRecordChannel();
  if (!enabled) return null;

  return (
    <section
      id="settings-record-compare"
      aria-labelledby="settings-record-compare-title"
      data-testid="settings-record-compare"
      className="lv-settings-card"
    >
      <h3 id="settings-record-compare-title" className="lv-settings-card-title">
        Bass Practice · Record &amp; Compare
      </h3>
      <label className="mt-3 block text-xs text-[var(--lv-text-secondary)]" htmlFor="settings-record-channel">
        入力チャンネル
        <Select
          id="settings-record-channel"
          aria-label="入力チャンネル"
          data-testid="settings-record-channel"
          className="mt-1 block w-full max-w-xs"
          value={channel}
          onChange={(event) => setChannel(event.target.value as ChannelMode)}
        >
          {CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </label>
      <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
        録音の入力チャンネルです。Record &amp; Compare 側の選択とこの設定は同期します。
        録音はローカルのみです。従来の4つの練習は自己評価で、MIDI のベースラインだけ録音後に目安の判定を行います。
      </p>
    </section>
  );
}
