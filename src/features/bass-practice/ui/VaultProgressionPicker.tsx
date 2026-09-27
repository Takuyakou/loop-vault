import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/ui/primitives";
import {
  filterVaultPickerCandidates,
  groupVaultPickerCandidates,
  type VaultPickerCandidateView,
} from "../application/vaultPickerCandidates";
import type { VaultChordContextSnapshot } from "../domain";

const MAX_VISIBLE_CANDIDATES = 50;

export interface VaultProgressionPickerProps {
  readonly candidates: readonly VaultPickerCandidateView[];
  readonly activeSignature?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onConfirm: (signature: string) => void;
}

/**
 * A read-only source-selection transaction for detached Vault snapshots.
 * The active practice source stays untouched until the user confirms.
 */
export function VaultProgressionPicker({
  candidates,
  activeSignature,
  disabled = false,
  loading = false,
  error,
  onConfirm,
}: VaultProgressionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedSignature, setSelectedSignature] = useState<string>();
  const deferredQuery = useDeferredValue(query);
  const candidateRefs = useRef(new Map<string, HTMLButtonElement>());

  const filteredCandidates = useMemo(
    () => filterVaultPickerCandidates(candidates, deferredQuery),
    [candidates, deferredQuery],
  );
  const progressionGroups = useMemo(
    () => groupVaultPickerCandidates(candidates),
    [candidates],
  );
  const filteredProgressions = useMemo(
    () => groupVaultPickerCandidates(filteredCandidates),
    [filteredCandidates],
  );
  const visibleProgressions = useMemo(
    () => filteredProgressions.slice(0, MAX_VISIBLE_CANDIDATES),
    [filteredProgressions],
  );
  const selectedProgression = visibleProgressions.find((progression) => (
    progression.candidates.some((candidate) => candidate.safeSnapshot.signature === selectedSignature)
  )) ?? visibleProgressions[0];
  const selectedCandidate = selectedProgression?.candidates.find(
    (candidate) => candidate.safeSnapshot.signature === selectedSignature,
  ) ?? selectedProgression?.preferredCandidate;
  const openPicker = () => {
    setQuery("");
    setSelectedSignature(
      candidates.find((candidate) => candidate.safeSnapshot.signature === activeSignature)?.safeSnapshot.signature
      ?? progressionGroups[0]?.preferredCandidate.safeSnapshot.signature,
    );
    setOpen(true);
  };
  const closePicker = () => setOpen(false);
  const confirm = () => {
    if (!selectedCandidate || loading || error) return;
    onConfirm(selectedCandidate.safeSnapshot.signature);
    closePicker();
  };
  const moveSelection = (event: KeyboardEvent<HTMLElement>, direction: -1 | 1) => {
    if (!visibleProgressions.length) return;
    event.preventDefault();
    const current = Math.max(0, visibleProgressions.findIndex((progression) => progression.id === selectedProgression?.id));
    const next = visibleProgressions[(current + direction + visibleProgressions.length) % visibleProgressions.length]!;
    setSelectedSignature(next.preferredCandidate.safeSnapshot.signature);
    candidateRefs.current.get(next.id)?.focus();
  };

  return <>
    <Button
      id="bassline-vault-picker-open"
      data-testid="vault-progression-picker-open"
      variant="secondary"
      disabled={disabled}
      onClick={openPicker}
    >
      {"Vaultから選ぶ"}
    </Button>
    {open ? <Modal
      ariaLabelledBy="vault-progression-picker-heading"
      onClose={closePicker}
      panelClassName="w-full max-w-3xl rounded-[var(--lv-radius-lg)]"
    >
      <section className="min-w-0 p-4 sm:p-5" data-testid="vault-progression-picker">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{"読み取り専用"}</p>
            <h2 id="vault-progression-picker-heading" className="mt-1 text-lg font-semibold">
              {"Vaultからコード進行を選ぶ"}
            </h2>
            <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">
              {"確認するまで、現在の練習用コード進行は変わりません。"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={closePicker}>{"閉じる"}</Button>
        </div>

        <label className="mt-4 block text-sm font-medium text-[var(--lv-text-secondary)]" htmlFor="vault-progression-picker-search">
          {"検索"}
        </label>
        <input
          id="vault-progression-picker-search"
          data-testid="vault-progression-picker-search"
          data-autofocus
          aria-controls="vault-progression-picker-candidates"
          className="lv-input mt-2 w-full"
          value={query}
          disabled={loading}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") moveSelection(event, 1);
            if (event.key === "ArrowUp") moveSelection(event, -1);
          }}
          placeholder={"\u30bf\u30a4\u30c8\u30eb\u3001\u30ad\u30fc\u3001\u30b3\u30fc\u30c9\u3001\u30bb\u30af\u30b7\u30e7\u30f3\u3067\u691c\u7d22"}
        />

        {loading ? <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{"Vaultの進行を読み込んでいます…"}</p> : null}
        {!loading && error ? <p className="mt-4 text-sm text-[var(--lv-danger)]" role="alert">{error}</p> : null}
        {!loading && !error && candidates.length === 0 ? <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{"選択できる対応済みの4/4コード進行はまだありません。"}</p> : null}
        {!loading && !error && candidates.length > 0 && filteredCandidates.length === 0 ? <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{"検索に一致するコード進行はありません。"}</p> : null}

        {!loading && !error && visibleProgressions.length > 0 ? <>
          <div
            id="vault-progression-picker-candidates"
            className="mt-4 max-h-64 overflow-y-auto rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-2"
            role="group"
            aria-label={"Vaultのコード進行候補"}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") moveSelection(event, 1);
              if (event.key === "ArrowUp") moveSelection(event, -1);
            }}
          >
            {visibleProgressions.map((progression) => {
              const candidate = progression.preferredCandidate;
              const snapshot = candidate.safeSnapshot;
              const selected = progression.id === selectedProgression?.id;
              const chords = snapshot.section.chords.map((chord) => chord.label).join(" \u00b7 ");
              const facts = pickerSnapshotLabel(snapshot);
              return <button
                key={progression.id}
                ref={(element) => {
                  if (element) candidateRefs.current.set(progression.id, element);
                  else candidateRefs.current.delete(progression.id);
                }}
                type="button"
                data-testid="vault-progression-picker-candidate"
                aria-label={`${candidate.displayTitle}. ${chords}. ${facts}`}
                aria-pressed={selected}
                className={`block min-w-0 w-full rounded-[var(--lv-radius-sm)] px-3 py-2 text-left text-sm ${selected ? "bg-[var(--lv-accent-soft)] text-[var(--lv-text-primary)]" : "hover:bg-[var(--lv-surface-hover)]"}`}
                onClick={() => setSelectedSignature(snapshot.signature)}
              >
                <span
                  data-testid="vault-progression-picker-candidate-title"
                  className="block min-w-0 truncate font-medium"
                  title={candidate.displayTitle}
                >
                  {candidate.displayTitle}
                </span>
                <span data-testid="vault-progression-picker-candidate-chords" className="mt-1 block break-words text-xs text-[var(--lv-text-secondary)]">{chords}</span>
                <span data-testid="vault-progression-picker-candidate-facts" className="mt-1 block text-xs text-[var(--lv-text-muted)]">{facts}</span>
              </button>;
            })}
          </div>
          {filteredProgressions.length > MAX_VISIBLE_CANDIDATES ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]" role="status">{`最初の${MAX_VISIBLE_CANDIDATES}件を表示しています。検索で絞り込んでください。`}</p> : null}
          {selectedCandidate ? <section className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" aria-live="polite" data-testid="vault-progression-picker-preview">
            <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{"選択したセクション"}</p>
            <p data-testid="vault-progression-picker-preview-title" className="mt-1 break-words font-medium">{selectedCandidate.displayTitle}</p>
            <p data-testid="vault-progression-picker-preview-chords" className="mt-1 break-words text-sm text-[var(--lv-text-secondary)]">{selectedCandidate.safeSnapshot.section.chords.map((chord) => chord.label).join(" \u00b7 ")}</p>
            <p data-testid="vault-progression-picker-preview-facts" className="mt-1 text-xs text-[var(--lv-text-muted)]">{pickerSnapshotLabel(selectedCandidate.safeSnapshot)}</p>
            {selectedProgression && selectedProgression.candidates.length > 1 ? <label className="mt-3 block text-sm font-medium text-[var(--lv-text-secondary)]" htmlFor="vault-progression-picker-section">
              {"練習する範囲"}
              <select
                id="vault-progression-picker-section"
                data-testid="vault-progression-picker-section"
                className="lv-input mt-1 w-full"
                value={selectedCandidate.safeSnapshot.signature}
                onChange={(event) => setSelectedSignature(event.currentTarget.value)}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {selectedProgression.candidates.map((sectionCandidate) => <option key={sectionCandidate.safeSnapshot.signature} value={sectionCandidate.safeSnapshot.signature}>
                  {pickerSectionLabel(sectionCandidate.safeSnapshot)}
                </option>)}
              </select>
            </label> : null}
          </section> : null}
        </> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={closePicker}>{"キャンセル"}</Button>
          <Button data-testid="vault-progression-picker-confirm" variant="primary" disabled={!selectedCandidate || loading || Boolean(error)} onClick={confirm}>
            {"このセクションを使う"}
          </Button>
        </div>
      </section>
    </Modal> : null}
  </>;
}

function pickerSnapshotLabel(snapshot: VaultChordContextSnapshot): string {
  const bars = `${snapshot.section.startBar}–${snapshot.section.endBar}小節`;
  return `${snapshot.tonalContext.key} · ${bars} · ${snapshot.originalBpm} BPM`;
}
function pickerSectionLabel(snapshot: VaultChordContextSnapshot): string {
  const range = `${snapshot.section.startBar}–${snapshot.section.endBar}`;
  return `${range}小節`;
}