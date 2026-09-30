import { useState } from "react";
import type { ChordSymbol } from "../../domain/types";
import { noteNameFromPitchClass } from "../../domain/chords";
import type { CorrectionCard, CorrectionNote } from "../../domain/correction/correctionModel";
import { noteLabel } from "../../domain/correction/correctionModel";
import { chordToneDiff, nameCandidatesFor } from "../../domain/correction/nameCandidates";

/** The right-hand panel for the selected card (spec v2.3 §4.4, §6.3, §6.4, §7.5). */
export interface CorrectionInspectorProps {
  card: CorrectionCard;
  notes: readonly CorrectionNote[];
  playing: "source" | "card" | null;
  onPlaySource: () => void;
  onPlayCard: () => void;
  onDelete: (ids: string[]) => void;
  onRestore: (ids: string[]) => void;
  onAddPitchClass: (pitchClass: number) => void;
  onSelectShortSame: (noteId: string) => void;
  shortSameCount: (noteId: string) => number;
  onEditNotes: () => void;
  /** P10.0-04: choosing a candidate; the buttons are shown but disabled without it. */
  onChooseName?: (name: ChordSymbol) => void;
  extraActions?: React.ReactNode;
}

export function CorrectionInspector(props: CorrectionInspectorProps) {
  const { card, notes } = props;
  const [picking, setPicking] = useState(false);
  const warnIds = new Set(card.reviewReasons.flatMap((reason) => reason.noteIds));
  const names = nameCandidatesFor(card, notes);
  const diff = chordToneDiff(card.name, notes);
  const rows = [...notes].sort((a, b) => b.pitch - a.pitch || Number(b.used) - Number(a.used));
  return (
    <div className="lv-cw-insp-body" aria-live="polite" data-testid="correction-inspector">
      <div>
        <p className="lv-cw-eyebrow">選んだカード</p>
        <h3 className="lv-cw-insp-name" data-testid="correction-inspector-name">{card.name.label}</h3>
        <p className="lv-cw-muted">
          {card.bar}小節{card.beat}拍から・{formatBeats(card.duration)}拍{card.attacks > 1 ? `・打ち直し ×${card.attacks}` : ""}
        </p>
        <span className="lv-cw-name-tag" data-user={card.nameSource === "user" || undefined}>
          {card.nameSource === "user" ? "あなたが決めた名前" : "自動の名前（音を変えると候補から更新）"}
        </span>
      </div>

      {card.noteWarning ? <div className="lv-cw-reason" role="status"><b>{card.noteWarning}</b></div> : null}
      {card.reviewReasons.length ? card.reviewReasons.map((reason) => (
        <div key={reason.kind} className="lv-cw-reason" data-testid="correction-review-reason">
          <b>要確認</b>
          <span>{reason.text}</span>
          <div className="lv-cw-actions">
            {reason.kind === "melody" ? (
              <button type="button" className="lv-cw-btn" onClick={() => props.onDelete(reason.noteIds)}>
                {noteLabel(notes.find((note) => note.id === reason.noteIds[0])?.pitch ?? 60)} を外す
              </button>
            ) : null}
            {reason.kind === "percussion" && reason.noteIds[0] ? (
              <button type="button" className="lv-cw-btn" onClick={() => props.onSelectShortSame(reason.noteIds[0]!)}>
                同じ高さの短い音を選ぶ（{props.shortSameCount(reason.noteIds[0])}個）
              </button>
            ) : null}
            <button type="button" className="lv-cw-btn" onClick={props.onEditNotes}>音を直す</button>
            {props.extraActions}
          </div>
        </div>
      )) : <div className="lv-cw-ok">このカードに要確認の印はありません。{props.extraActions ? <div className="lv-cw-actions">{props.extraActions}</div> : null}</div>}

      <section>
        <div className="lv-cw-row-between">
          <h4 className="lv-cw-h4">鳴らす音</h4>
          <button type="button" className="lv-cw-btn" data-kind="accent" aria-expanded={picking} onClick={() => setPicking((value) => !value)} data-testid="correction-add-note">
            ＋ 音を足す
          </button>
        </div>
        {picking ? (
          <div className="lv-cw-add-row" role="group" aria-label="足す音を選ぶ">
            {Array.from({ length: 12 }, (_, pc) => (
              <button key={pc} type="button" onClick={() => { props.onAddPitchClass(pc); setPicking(false); }}>{noteNameFromPitchClass(pc)}</button>
            ))}
          </div>
        ) : null}
        <ul className="lv-cw-nlist" data-testid="correction-note-list">
          {rows.map((note) => (
            <li key={note.id} className="lv-cw-nrow" data-used={note.used || undefined}>
              <span className="lv-cw-nrow-pitch" data-kind={note.provenance === "MANUAL_ADDED" ? "manual" : warnIds.has(note.id) ? "warn" : note.used ? note.roleHint === "bass" ? "bass" : "harmony" : "off"}>
                {noteLabel(note.pitch)}
              </span>
              <span className="lv-cw-nrow-why">{noteWhy(note)}</span>
              {note.provenance === "MANUAL_ADDED" ? (
                <button type="button" className="lv-cw-tog" onClick={() => props.onDelete([note.id])}>消す</button>
              ) : note.used ? (
                <button type="button" className="lv-cw-tog" onClick={() => props.onDelete([note.id])}>外す</button>
              ) : (
                <button type="button" className="lv-cw-tog" data-out onClick={() => props.onRestore([note.id])}>戻す</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="lv-cw-h4">聴き比べ</h4>
        <div className="lv-cw-ab">
          <button type="button" aria-pressed={props.playing === "source"} onClick={props.onPlaySource} data-testid="correction-play-source">
            <b>A 元の音</b>
            <span>区間に鳴っている音すべて</span>
          </button>
          <button type="button" aria-pressed={props.playing === "card"} onClick={props.onPlayCard} data-testid="correction-play-card">
            <b>B カードの音</b>
            <span>保存すると鳴る音</span>
          </button>
        </div>
      </section>

      <section>
        <h4 className="lv-cw-h4">名前の候補</h4>
        <div className="lv-cw-alts" data-testid="correction-name-candidates">
          {names.map((name, index) => (
            <button
              key={name.label}
              type="button"
              className="lv-cw-alt"
              aria-pressed={name.label === card.name.label}
              disabled={!props.onChooseName}
              onClick={() => props.onChooseName?.(name)}
              title={`${index + 1} を押しても選べます`}
            >
              <span className="lv-cw-alt-no">{index + 1}</span>
              <span className="lv-cw-alt-name">{name.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4 className="lv-cw-h4">構成音との違い（参考）</h4>
        <dl className="lv-cw-tones">
          <dt>{card.name.label} の構成音</dt>
          <dd>{diff.chordTones.join(" ")}</dd>
          <dt>今の音</dt>
          <dd>{diff.currentTones.join(" ") || "なし"}</dd>
          <dt>追加候補（参考）</dt>
          <dd data-testid="correction-addable">
            {diff.addable.length ? diff.addable.map((tone) => (
              <button key={tone} type="button" className="lv-cw-addable" onClick={() => props.onAddPitchClass(pitchClassOf(tone))}>＋{tone}</button>
            )) : "なし"}
          </dd>
        </dl>
        <p className="lv-cw-muted">名前の構成音にあって、今の音に無い音です。省くのが普通の音もあるので、足すかどうかは耳で決めてください。</p>
      </section>
    </div>
  );
}

function noteWhy(note: CorrectionNote): string {
  if (note.provenance === "MANUAL_ADDED") return "手動で足した音";
  const moved = note.originalPitch !== undefined ? `元は ${noteLabel(note.originalPitch)}・` : "";
  const role = note.roleHint === "melody" ? "メロディの Voice・" : note.roleHint === "bass" ? "ベース・" : note.roleHint === "percussion" ? "短い繰り返し・" : "";
  return `${moved}${role}${note.used ? "使っている" : "外した"}`;
}

function pitchClassOf(name: string): number {
  for (let pc = 0; pc < 12; pc += 1) if (noteNameFromPitchClass(pc) === name) return pc;
  return 0;
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
