import { ImportIcon } from "./icons";
import { Button, EmptyState } from "./ui";

/** P8.9-08: the one "nothing captured yet" guide shared by Home, Vault and the app's empty state. */
export function FirstCaptureGuide({ onMidi, onText, className = "" }: {
  onMidi: () => void;
  onText?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      className={`lv-first-capture ${className}`}
      icon={<ImportIcon size={20} />}
      title="最初の進行を取り込む"
      description="MIDI かコード譜のテキストから進行を取り込むと、ここに並びます。"
      action={(
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onMidi}>MIDI から取り込む</Button>
          {onText ? <Button variant="neutral" onClick={onText}>テキストから取り込む</Button> : null}
        </div>
      )}
    />
  );
}
