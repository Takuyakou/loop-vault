import { useState } from "react";
import { Button, StatusMessage, Surface } from "../../../components/ui";
import type { PracticeBackupMetadata } from "../infra/repository";

export function PracticeRecoveryPanel({ backups, error, onRestore, onRetry, onStartFresh, readOnly = false }: {
  backups: readonly PracticeBackupMetadata[];
  error: string;
  onRestore?: (name: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onStartFresh?: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [pending, setPending] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const run = async (key: string, action: () => Promise<void>) => {
    if (pending) return;
    setPending(key); setActionError(undefined);
    try { await action(); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "Practice recovery could not be completed."); }
    finally { setPending(undefined); }
  };
  return (
    <Surface className="space-y-4 p-5" aria-labelledby="practice-recovery-title">
      <StatusMessage title="Practice progress could not be loaded" tone="error">
        {actionError ?? error}
      </StatusMessage>
      <div>
        <h3 id="practice-recovery-title" className="text-sm font-semibold">Recovery options</h3>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
          {readOnly ? "This Practice file is read-only. Update Loop Vault before making changes; the canonical file will not be replaced or hidden." : "The selected backup is fully validated before replacement. Vault data is never changed."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={Boolean(pending)} onClick={() => void run("retry", onRetry)}>
          {pending === "retry" ? "Retrying…" : "Retry load"}
        </Button>
        {onRestore ? backups.map((backup) => (
          <Button key={backup.name} variant="ghost" disabled={Boolean(pending)} onClick={() => void run(backup.name, () => onRestore(backup.name))}>
            {pending === backup.name ? "Restoring…" : `Restore backup r${backup.revision}`}
          </Button>
        )) : null}
        {onStartFresh ? <Button variant="ghost" disabled={Boolean(pending)} onClick={() => void run("start-fresh", onStartFresh)}>{pending === "start-fresh" ? "Starting…" : "Start Fresh"}</Button> : null}
      </div>
      {!readOnly && onRestore && backups.length === 0 ? <p className="text-xs text-[var(--lv-text-muted)]">No validated backup candidates are available. Start Fresh remains available because the corrupt original was safely retained.</p> : null}
    </Surface>
  );
}
