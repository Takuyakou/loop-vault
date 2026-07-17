import { useMemo, useState } from "react";
import type { LiveChordHistoryEntry } from "../domain/liveMidi";
import type { SongIdea } from "../domain/types";
import type { AppCopy } from "../i18n";
import { Modal } from "./Modal";

export interface LiveMidiImportRequest {
  startIndex: number;
  endIndex: number;
  ideaId?: string;
  newIdeaTitle?: string;
}

export function LiveMidiImportDialog({ history, ideas, copy, onCancel, onSave }: {
  history: readonly LiveChordHistoryEntry[];
  ideas: readonly SongIdea[];
  copy: AppCopy["liveMidi"];
  onCancel: () => void;
  onSave: (request: LiveMidiImportRequest) => void;
}) {
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(history.length);
  const [destination, setDestination] = useState(ideas[0]?.id ?? "new");
  const [title, setTitle] = useState<string>(copy.title);
  const selectedLabels = useMemo(
    () => history.slice(start - 1, end).map((entry) => entry.label).join("  ·  "),
    [end, history, start],
  );
  const valid = start >= 1 && end >= start && end <= history.length
    && (destination !== "new" || title.trim().length > 0);

  return (
    <Modal onClose={onCancel} ariaLabelledBy="live-midi-import-title" panelClassName="w-full max-w-xl">
      <form className="p-5" onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSave({
          startIndex: start - 1,
          endIndex: end,
          ...(destination === "new" ? { newIdeaTitle: title.trim() } : { ideaId: destination }),
        });
      }}>
        <h2 id="live-midi-import-title" className="text-lg font-semibold">{copy.importTitle}</h2>
        <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{copy.importDescription}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="text-sm text-[var(--lv-text-secondary)]">
            {copy.rangeStart}
            <select className="mt-1 h-10 w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3" value={start} onChange={(event) => {
              const value = Number(event.target.value);
              setStart(value);
              if (end < value) setEnd(value);
            }}>
              {history.map((entry, index) => <option key={entry.id} value={index + 1}>{index + 1}. {entry.label}</option>)}
            </select>
          </label>
          <label className="text-sm text-[var(--lv-text-secondary)]">
            {copy.rangeEnd}
            <select className="mt-1 h-10 w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3" value={end} onChange={(event) => setEnd(Number(event.target.value))}>
              {history.map((entry, index) => <option key={entry.id} value={index + 1} disabled={index + 1 < start}>{index + 1}. {entry.label}</option>)}
            </select>
          </label>
        </div>

        <p className="mt-3 min-h-10 border-y border-[var(--lv-border)] py-2 text-sm font-semibold text-[var(--lv-text-secondary)]">{selectedLabels}</p>

        <label className="mt-4 block text-sm text-[var(--lv-text-secondary)]">
          {copy.destination}
          <select className="mt-1 h-10 w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3" value={destination} onChange={(event) => setDestination(event.target.value)}>
            {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
            <option value="new">{copy.newIdea}</option>
          </select>
        </label>
        {destination === "new" ? (
          <label className="mt-3 block text-sm text-[var(--lv-text-secondary)]">
            {copy.newIdeaTitle}
            <input className="mt-1 h-10 w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="lv-button-ghost px-4 py-2 text-sm" onClick={onCancel}>{copy.skipImport}</button>
          <button type="submit" className="rounded bg-[var(--lv-accent)] px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-50" disabled={!valid}>{copy.importAction}</button>
        </div>
      </form>
    </Modal>
  );
}
