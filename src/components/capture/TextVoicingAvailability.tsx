import type { textVoicingAvailability } from "../../domain/textVoicingAvailability";

export function TextVoicingAvailability({ availability }: {
  readonly availability: ReturnType<typeof textVoicingAvailability>;
}) {
  if (!availability.total) return null;
  return <div className="px-3 py-2 text-xs text-[var(--lv-text-muted)]" data-testid="text-voicing-availability" role="status">
    <p>{`登録できる音: ${availability.registered} / ${availability.total}コード。試聴音はアプリの推奨音です（元MIDIから抽出した音ではありません）。`}</p>
    {availability.unavailable.length ? <p className="mt-1 text-[var(--lv-warning)]" data-testid="text-voicing-unavailable">
      {`試聴の音を作れません: ${availability.unavailable.join("、")}。コード記号だけを保存し、登録音の練習には追加しません。`}
    </p> : null}
  </div>;
}
