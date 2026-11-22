import { Select } from "../../../../components/ui/controls";
import { SettingsRow } from "../../../../components/SettingsRow";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import type { ChannelMode } from "../domain/types";
import { useRecordChannel } from "../application/recordChannelStore";

/**
 * Practice Settings control for Record & Compare (acceptance feedback / brief
 * §16). It shares the persisted input-channel value with the Record & Compare
 * panel, so changing it in either place stays in sync. Renders only when the
 * feature flag is on.
 *
 * P23-26 S4: the same value drawn as one row of the 「MIDI 入力」 section.
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
    <div id="settings-record-compare" data-testid="settings-record-compare">
      <SettingsRow
        title="Bass Practice の録音に使うチャンネル"
        description="Record & Compare で選ぶものと同じ設定です。録音は、この PC の中だけに残ります。"
        control={(
          <Select
            id="settings-record-channel"
            aria-label="入力チャンネル"
            data-testid="settings-record-channel"
            className="w-full"
            value={channel}
            onChange={(event) => setChannel(event.target.value as ChannelMode)}
          >
            {CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        )}
      />
    </div>
  );
}
