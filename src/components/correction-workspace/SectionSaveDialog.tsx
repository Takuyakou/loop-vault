import { useId, useRef, useState } from "react";
import { sectionMemo, type SectionSaveRow } from "../../domain/correction/sectionSave";
import type { SongIdea } from "../../domain/types";
import { Modal } from "../Modal";
import { Button } from "../ui";
import type { SaveReady } from "./WorkspaceSaveForm";
import { rangeLabel } from "./WorkspaceSaveForm";

/**
 * P10.2 addendum 2 §2.2: 「区切りごとに保存」 — one progression a segment (the same chords
 * once), into a new idea or one that exists. Looks like the app's ConfirmDialog. A progression
 * has no title of its own in the Vault (the idea has); its memo keeps the section's name (P10.3 §4).
 */
export function SectionSaveDialog({ rows, ideas, ideaTitle, onCreate, onAppend, onGoToCard, onClose, onDone }: {
  rows: readonly SectionSaveRow[];
  ideas: readonly SongIdea[];
  /** The new idea's title (from the file name). */
  ideaTitle: string;
  /** `memoNote`: the section's name for the progression's memo (P10.3 §4). */
  onCreate: (ready: SaveReady, title: string, memoNote: string) => string | undefined;
  onAppend: (ready: SaveReady, ideaId: string, memoNote: string) => boolean;
  onGoToCard: (cardId: string) => void;
  onClose: () => void;
  /** The rows saved, and the first one that failed (the rest were not tried). */
  onDone: (saved: SectionSaveRow[], failed: SectionSaveRow | undefined) => void;
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(rows.filter((row) => row.result.ok && !row.saved).map((row) => row.segment.id)));
  const [destination, setDestination] = useState<"new" | "append">("new");
  const [ideaId, setIdeaId] = useState("");
  const backRef = useRef<HTMLButtonElement>(null);
  const titleId = `${useId()}-title`;
  const chosen = rows.filter((row) => ticked.has(row.segment.id) && row.result.ok);
  const canSave = chosen.length > 0 && (destination === "new" || ideaId !== "");

  const save = () => {
    const saved: SectionSaveRow[] = [];
    let target = destination === "append" ? ideaId : undefined;
    for (const row of chosen) {
      if (!row.result.ok) continue;
      // A new idea is made by the first one; the rest are added to it.
      const ok = target === undefined
        ? Boolean(target = onCreate(row.result, ideaTitle, sectionMemo(row.segment)))
        : onAppend(row.result, target, sectionMemo(row.segment));
      if (!ok) { onDone(saved, row); return; }
      saved.push(row);
    }
    onDone(saved, undefined);
  };

  return (
    <Modal ariaLabelledBy={titleId} initialFocusRef={backRef} onClose={onClose} panelClassName="w-full max-w-xl p-5" layerClassName="z-[70]">
      <div data-testid="correction-section-save">
        <h2 id={titleId} className="text-xl font-semibold">区切りごとに保存</h2>
        <ul className="lv-cw-section-list">
          {rows.map((row) => {
            const problem = row.result.ok ? undefined : row.result.problems[0];
            const id = `section-${row.segment.id}`;
            return (
              <li key={row.segment.id} className="lv-cw-section-row" data-testid="correction-section-row" data-disabled={problem ? true : undefined}>
                <input
                  id={id}
                  type="checkbox"
                  checked={ticked.has(row.segment.id) && !problem}
                  disabled={Boolean(problem)}
                  onChange={(event) => setTicked((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(row.segment.id); else next.delete(row.segment.id);
                    return next;
                  })}
                />
                <label htmlFor={id}>
                  <b>{row.segment.label}</b>
                  {/* The 8-bar stand-in segments are named by their bars already. */}
                  {rangeLabel(row.range) !== row.segment.label ? <span className="lv-cw-muted">{rangeLabel(row.range)}</span> : null}
                  {row.saved ? <span className="lv-cw-saved">保存済み</span> : null}
                  <span className="lv-cw-section-names">{row.names.join(" ")}</span>
                  {row.sameAs.length ? <span className="lv-cw-muted">{row.sameAs.join("・")} と同じ</span> : null}
                </label>
                {problem ? (
                  <span className="lv-cw-section-problem">
                    {problem.text}
                    {problem.cardId ? <button type="button" className="lv-cw-btn" onClick={() => { onClose(); onGoToCard(problem.cardId); }}>このカードへ</button> : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <fieldset className="lv-cw-section-dest">
          <legend className="lv-cw-h4">保存先</legend>
          <label><input type="radio" name="section-destination" checked={destination === "new"} onChange={() => setDestination("new")} /> 新しいアイデア（題名：{ideaTitle}）</label>
          <label>
            <input type="radio" name="section-destination" checked={destination === "append"} onChange={() => setDestination("append")} /> 今あるアイデアに追加
            {destination === "append" ? (
              <select aria-label="追加するアイデア" value={ideaId} onChange={(event) => setIdeaId(event.target.value)}>
                <option value="">選んでください</option>
                {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
              </select>
            ) : null}
          </label>
        </fieldset>
        <p className="lv-cw-muted">保存すると、外した音は戻せなくなります</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={backRef} variant="neutral" onClick={onClose}>戻る</Button>
          <Button variant="primary" className="font-semibold" disabled={!canSave} onClick={save} data-testid="correction-section-save-confirm">{chosen.length}個を保存</Button>
        </div>
      </div>
    </Modal>
  );
}
