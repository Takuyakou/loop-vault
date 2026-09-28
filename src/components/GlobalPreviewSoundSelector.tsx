import type { AppCopy } from "../i18n";
import { usePreviewSound } from "./PreviewSoundProvider";
import { SegmentedControl } from "./ui";

/** P8.9-08: header preview tone as the mock's ピアノ／エレピ segment (RHome.dc.html). Same saved preference. */
export function GlobalPreviewSoundSelector({ copy }: { copy: AppCopy }) {
  const { sound, setSound } = usePreviewSound();
  return (
    <SegmentedControl
      label={copy.capture.previewSound}
      className="lv-header-segmented shrink-0"
      value={sound}
      onChange={setSound}
      options={[
        { value: "piano", label: copy.capture.piano, title: `${copy.capture.previewSound}: ${copy.capture.piano}` },
        { value: "electric-piano", label: copy.capture.electricPiano, title: `${copy.capture.previewSound}: ${copy.capture.electricPiano}` },
      ]}
    />
  );
}
