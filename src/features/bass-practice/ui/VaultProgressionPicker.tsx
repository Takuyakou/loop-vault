import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AppLanguage } from "../../../i18n";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/ui/primitives";
import { filterVaultPickerCandidates, type VaultPickerCandidateView } from "../application/vaultPickerCandidates";
import type { VaultChordContextSnapshot } from "../domain";

const MAX_VISIBLE_CANDIDATES = 50;

export interface VaultProgressionPickerProps {
  readonly language: AppLanguage;
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
  language,
  candidates,
  activeSignature,
  disabled = false,
  loading = false,
  error,
  onConfirm,
}: VaultProgressionPickerProps) {
  const ja = language === "ja";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedSignature, setSelectedSignature] = useState<string>();
  const deferredQuery = useDeferredValue(query);
  const candidateRefs = useRef(new Map<string, HTMLButtonElement>());

  const filteredCandidates = useMemo(
    () => filterVaultPickerCandidates(candidates, deferredQuery),
    [candidates, deferredQuery],
  );
  const visibleCandidates = useMemo(
    () => filteredCandidates.slice(0, MAX_VISIBLE_CANDIDATES),
    [filteredCandidates],
  );
  const selectedCandidate = visibleCandidates.find((candidate) => candidate.safeSnapshot.signature === selectedSignature)
    ?? visibleCandidates[0];
  const openPicker = () => {
    setQuery("");
    setSelectedSignature(
      candidates.find((candidate) => candidate.safeSnapshot.signature === activeSignature)?.safeSnapshot.signature
      ?? candidates[0]?.safeSnapshot.signature,
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
    if (!visibleCandidates.length) return;
    event.preventDefault();
    const current = Math.max(0, visibleCandidates.findIndex((candidate) => candidate.safeSnapshot.signature === selectedCandidate?.safeSnapshot.signature));
    const next = visibleCandidates[(current + direction + visibleCandidates.length) % visibleCandidates.length]!;
    setSelectedSignature(next.safeSnapshot.signature);
    candidateRefs.current.get(next.safeSnapshot.signature)?.focus();
  };

  return <>
    <Button
      id="bassline-vault-picker-open"
      data-testid="vault-progression-picker-open"
      variant="secondary"
      disabled={disabled}
      onClick={openPicker}
    >
      {ja ? "Vaultから選ぶ" : "Choose from Vault"}
    </Button>
    {open ? <Modal
      ariaLabelledBy="vault-progression-picker-heading"
      onClose={closePicker}
      panelClassName="w-full max-w-3xl rounded-[var(--lv-radius-lg)]"
    >
      <section className="min-w-0 p-4 sm:p-5" data-testid="vault-progression-picker">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{ja ? "読み取り専用" : "Read-only"}</p>
            <h2 id="vault-progression-picker-heading" className="mt-1 text-lg font-semibold">
              {ja ? "Vaultからコード進行を選ぶ" : "Choose a progression from Vault"}
            </h2>
            <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">
              {ja ? "確認するまで、現在の練習用コード進行は変わりません。" : "Your current practice progression stays unchanged until you confirm."}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={closePicker}>{ja ? "閉じる" : "Close"}</Button>
        </div>

        <label className="mt-4 block text-sm font-medium text-[var(--lv-text-secondary)]" htmlFor="vault-progression-picker-search">
          {ja ? "検索" : "Search"}
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
          placeholder={ja ? "\u30bf\u30a4\u30c8\u30eb\u3001\u30ad\u30fc\u3001\u30b3\u30fc\u30c9\u3001\u30bb\u30af\u30b7\u30e7\u30f3\u3067\u691c\u7d22" : "Search title, key, chords, or section"}
        />

        {loading ? <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{ja ? "Vaultの進行を読み込んでいます…" : "Loading Vault progressions…"}</p> : null}
        {!loading && error ? <p className="mt-4 text-sm text-[var(--lv-danger)]" role="alert">{error}</p> : null}
        {!loading && !error && candidates.length === 0 ? <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{ja ? "選択できる対応済みの4/4コード進行はまだありません。" : "There are no supported 4/4 Vault progressions to choose from yet."}</p> : null}
        {!loading && !error && candidates.length > 0 && filteredCandidates.length === 0 ? <p className="mt-4 text-sm text-[var(--lv-text-secondary)]" role="status">{ja ? "検索に一致するコード進行はありません。" : "No Vault progressions match your search."}</p> : null}

        {!loading && !error && visibleCandidates.length > 0 ? <>
          <div
            id="vault-progression-picker-candidates"
            className="mt-4 max-h-64 overflow-y-auto rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-2"
            role="group"
            aria-label={ja ? "Vaultのコード進行候補" : "Vault progression candidates"}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") moveSelection(event, 1);
              if (event.key === "ArrowUp") moveSelection(event, -1);
            }}
          >
            {visibleCandidates.map((candidate) => {
              const snapshot = candidate.safeSnapshot;
              const selected = snapshot.signature === selectedCandidate?.safeSnapshot.signature;
              const chords = snapshot.section.chords.map((chord) => chord.label).join(" \u00b7 ");
              const facts = pickerSnapshotLabel(snapshot, language);
              return <button
                key={snapshot.signature}
                ref={(element) => {
                  if (element) candidateRefs.current.set(snapshot.signature, element);
                  else candidateRefs.current.delete(snapshot.signature);
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
          {filteredCandidates.length > MAX_VISIBLE_CANDIDATES ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]" role="status">{ja ? `最初の${MAX_VISIBLE_CANDIDATES}件を表示しています。検索で絞り込んでください。` : `Showing the first ${MAX_VISIBLE_CANDIDATES} matches. Refine your search to narrow the list.`}</p> : null}
          {selectedCandidate ? <section className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3" aria-live="polite" data-testid="vault-progression-picker-preview">
            <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{ja ? "選択したセクション" : "Selected section"}</p>
            <p data-testid="vault-progression-picker-preview-title" className="mt-1 break-words font-medium">{selectedCandidate.displayTitle}</p>
            <p data-testid="vault-progression-picker-preview-chords" className="mt-1 break-words text-sm text-[var(--lv-text-secondary)]">{selectedCandidate.safeSnapshot.section.chords.map((chord) => chord.label).join(" \u00b7 ")}</p>
            <p data-testid="vault-progression-picker-preview-facts" className="mt-1 text-xs text-[var(--lv-text-muted)]">{pickerSnapshotLabel(selectedCandidate.safeSnapshot, language)}</p>
          </section> : null}
        </> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={closePicker}>{ja ? "キャンセル" : "Cancel"}</Button>
          <Button data-testid="vault-progression-picker-confirm" variant="primary" disabled={!selectedCandidate || loading || Boolean(error)} onClick={confirm}>
            {ja ? "このセクションを使う" : "Use this section"}
          </Button>
        </div>
      </section>
    </Modal> : null}
  </>;
}

function pickerSnapshotLabel(snapshot: VaultChordContextSnapshot, language: AppLanguage): string {
  const bars = language === "ja"
    ? `${snapshot.section.startBar}–${snapshot.section.endBar}小節`
    : `bars ${snapshot.section.startBar}–${snapshot.section.endBar}`;
  return `${snapshot.tonalContext.key} · ${bars} · ${snapshot.originalBpm} BPM`;
}