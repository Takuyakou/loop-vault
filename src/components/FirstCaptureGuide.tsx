import { useState } from "react";
import { ImportIcon } from "./icons";
import { Button } from "./ui";

const FLOW = ["MIDI を落とす", "パートを確かめる", "選んで保存"] as const;

/** The one "nothing captured yet" guide shared by Home, Vault and the app's empty state. */
export function FirstCaptureGuide({ onMidi, onText, onSamples, className = "" }: {
  onMidi: () => void;
  onText?: () => void;
  /** P24-03: adds the three sample progressions; the button is drawn only when this is given. */
  onSamples?: () => void;
  className?: string;
}) {
  // P24-03: one press adds all three; until the store has them the button stays pressed.
  const [samplesBusy, setSamplesBusy] = useState(false);
  return (
    <section className={`lv-first-capture ${className}`} data-testid="first-capture-guide" aria-labelledby="first-capture-title">
      <div className="lv-first-capture-icon" aria-hidden="true"><ImportIcon size={22} /></div>
      <h3 id="first-capture-title" className="lv-first-capture-title">最初の進行を取り込む</h3>
      <p className="lv-first-capture-text">MIDI かコード譜のテキストから進行を取り込むと、ここに並びます。</p>
      <div className="lv-first-capture-actions">
        <Button variant="primary" onClick={onMidi}>MIDI から取り込む</Button>
        {onText ? <Button variant="neutral" onClick={onText}>コード譜のテキストを貼り付け</Button> : null}
        {onSamples ? <Button variant="neutral" disabled={samplesBusy} data-testid="first-capture-samples"
          onClick={() => { setSamplesBusy(true); try { onSamples(); } finally { setSamplesBusy(false); } }}>サンプル進行を 3 件入れて試す</Button> : null}
      </div>
      <ol className="lv-first-capture-flow" aria-label="取り込みの流れ">
        {FLOW.map((step, index) => (
          <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>
        ))}
      </ol>
    </section>
  );
}
