import type { CorrectionCard, CorrectionNote } from "../../domain/correction/correctionModel";
import { noteLabel } from "../../domain/correction/correctionModel";
import { chordToneDiff, nameCandidatesFor } from "../../domain/correction/nameCandidates";

/** The right-hand panel for the selected card (spec v2.2 §4.4). Display only in P10.0-02. */
export function CorrectionInspector({ card, notes, playing, onPlaySource, onPlayCard }: {
  card: CorrectionCard;
  notes: readonly CorrectionNote[];
  playing: "source" | "card" | null;
  onPlaySource: () => void;
  onPlayCard: () => void;
}) {
  const used = notes.filter((note) => note.used);
  const pitches = [...new Map(used.map((note) => [note.pitch, note])).values()].sort((a, b) => a.pitch - b.pitch);
  const warnIds = new Set(card.reviewReasons.flatMap((reason) => reason.noteIds));
  const names = nameCandidatesFor(card, notes);
  const diff = chordToneDiff(card.name, notes);
  return (
    <div className="lv-cw-insp-body" aria-live="polite" data-testid="correction-inspector">
      <div>
        <p className="lv-cw-eyebrow">選んだカード</p>
        <h3 className="lv-cw-insp-name" data-testid="correction-inspector-name">{card.name.label}</h3>
        <p className="lv-cw-muted">{card.bar}小節{card.beat}拍から・{formatBeats(card.duration)}拍・自動の名前</p>
      </div>

      {card.reviewReasons.length ? card.reviewReasons.map((reason) => (
        <div key={reason.kind} className="lv-cw-reason" data-testid="correction-review-reason">
          <b>要確認</b>
          <span>{reason.text}</span>
        </div>
      )) : <div className="lv-cw-ok">このカードに要確認の印はありません。</div>}

      <section>
        <h4 className="lv-cw-h4">鳴らす音</h4>
        {pitches.length ? (
          <div className="lv-cw-pitches">
            {pitches.map((note) => (
              <span key={note.pitch} className="lv-cw-pitch" data-kind={warnIds.has(note.id) ? "warn" : note.roleHint === "bass" ? "bass" : "harmony"}>
                {noteLabel(note.pitch)}
              </span>
            ))}
          </div>
        ) : <p className="lv-cw-muted">元の MIDI から取った音はありません（生成の音で鳴ります）。</p>}
      </section>

      <section>
        <h4 className="lv-cw-h4">聴き比べ</h4>
        <div className="lv-cw-ab">
          <button type="button" aria-pressed={playing === "source"} onClick={onPlaySource} data-testid="correction-play-source">
            <b>A 元の音</b>
            <span>区間に鳴っている音すべて</span>
          </button>
          <button type="button" aria-pressed={playing === "card"} onClick={onPlayCard} data-testid="correction-play-card">
            <b>B カードの音</b>
            <span>保存すると鳴る音</span>
          </button>
        </div>
      </section>

      <section>
        <h4 className="lv-cw-h4">名前の候補</h4>
        <ol className="lv-cw-alts" data-testid="correction-name-candidates">
          {names.map((name, index) => (
            <li key={name.label} className="lv-cw-alt" data-current={name.label === card.name.label || undefined}>
              <span className="lv-cw-alt-no">{index + 1}</span>
              <span className="lv-cw-alt-name">{name.label}</span>
            </li>
          ))}
        </ol>
        <p className="lv-cw-muted">候補を選ぶ操作は次の段階で使えるようになります。</p>
      </section>

      <section>
        <h4 className="lv-cw-h4">構成音との違い（参考）</h4>
        <dl className="lv-cw-tones">
          <dt>{card.name.label} の構成音</dt>
          <dd>{diff.chordTones.join(" ")}</dd>
          <dt>今の音</dt>
          <dd>{diff.currentTones.join(" ") || "なし"}</dd>
          <dt>追加候補（参考）</dt>
          <dd data-testid="correction-addable">{diff.addable.length ? diff.addable.map((tone) => `＋${tone}`).join(" ") : "なし"}</dd>
        </dl>
        <p className="lv-cw-muted">名前の構成音にあって、今の音に無い音です。省くのが普通の音もあるので、足すかどうかは耳で決めてください。</p>
      </section>
    </div>
  );
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
