// P8.9-08: startup, recovery and quarantine states on the shared parts (LoadingState, StatusMessage).
// Moved out of App.tsx so the dev-only component gallery can show them; behavior is unchanged.
// P23-30 P2-P8: the four startup screens and the quarantine notice now share `ProblemPanel`.
import type { AppCopy } from "../i18n";
import type { defaultVaultStore } from "../store/defaultVaultStore";
import { readableBackupDate } from "../views/SettingsView";
import { ProblemBackupRow, ProblemPanel } from "./ProblemPanel";
import { LoadingState } from "./ui";

/** P23-30 P4: the rotating automatic backup (`data-20261111-0930.json`) or a name somebody chose. */
const AUTOMATIC_BACKUP_NAME = /^data-\d{8}-\d{4}\.json$/;

/** Newest first; a name we cannot read the date from keeps the order the store gave. */
function newestFirst<T extends { readonly name: string; readonly createdAt?: string; readonly revision?: number }>(backups: readonly T[]): T[] {
  return [...backups].sort((left, right) => {
    const leftAt = left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
    const rightAt = right.createdAt ? Date.parse(right.createdAt) : Number.NaN;
    if (!Number.isNaN(leftAt) && !Number.isNaN(rightAt) && leftAt !== rightAt) return rightAt - leftAt;
    if (!Number.isNaN(leftAt) && Number.isNaN(rightAt)) return -1;
    if (Number.isNaN(leftAt) && !Number.isNaN(rightAt)) return 1;
    if (left.revision !== undefined && right.revision !== undefined && left.revision !== right.revision) return right.revision - left.revision;
    return right.name.localeCompare(left.name);
  });
}

export function StartupState({
  loadStatus,
  recovery,
  readonly,
  error,
  requestRestoreBackup,
  copy,
}: {
  loadStatus: string;
  recovery: ReturnType<typeof defaultVaultStore.getState>["recovery"];
  readonly: ReturnType<typeof defaultVaultStore.getState>["readonly"];
  error?: string;
  requestRestoreBackup: (backupName: string) => void;
  copy: AppCopy;
}) {
  if (loadStatus === "loading" || loadStatus === "idle") {
    return (
      <div className="lv-startup" data-testid="startup-loading">
        <img src="/loop-vault-icon.svg" alt="" width="56" height="56" className="lv-startup-logo" />
        <LoadingState label={copy.startup.loadingTitle} description={copy.startup.loadingBody} />
        <span className="lv-startup-loading-bar" aria-hidden="true"><i /></span>
      </div>
    );
  }
  return (
    <div className="lv-startup" data-testid="startup-state">
      <div className="w-full max-w-2xl">
        {loadStatus === "recovery" && recovery ? (
          <RecoveryPanel recovery={recovery} copy={copy} requestRestoreBackup={requestRestoreBackup} />
        ) : null}
        {loadStatus === "readonly" && readonly ? (
          <ProblemPanel
            tone="accent"
            title={copy.startup.readonlyTitle}
            description={copy.startup.readonlyDesc}
            what={readonly.fileVersion ? copy.startup.readonlyWhat(readonly.fileVersion) : readonly.message}
            data={copy.startup.readonlyData}
            next={copy.startup.readonlyNext}
          />
        ) : null}
        {loadStatus === "error" ? (
          <ProblemPanel
            tone="error"
            title={copy.startup.errorTitle}
            description={copy.startup.errorDesc}
            what={copy.startup.errorWhat}
            data={copy.startup.errorData}
            next={copy.startup.errorNext}
            details={error ?? copy.startup.unknownError}
          />
        ) : null}
      </div>
    </div>
  );
}

function RecoveryPanel({
  recovery,
  copy,
  requestRestoreBackup,
}: {
  recovery: NonNullable<ReturnType<typeof defaultVaultStore.getState>["recovery"]>;
  copy: AppCopy;
  requestRestoreBackup: (backupName: string) => void;
}) {
  const backups = newestFirst(recovery.backups);
  return (
    <ProblemPanel
      tone="warning"
      title={copy.startup.recoveryTitle}
      description={copy.startup.recoveryDesc}
      what={recovery.kind === "migration-recovery" ? recovery.message : copy.startup.recoveryWhat}
      data={copy.startup.recoveryData}
      next={backups.length > 0
        ? copy.startup.recoveryNextWithBackups
        : `${copy.startup.recoveryNextNoBackups}${copy.startup.recoveryNextFallback}`}
      {...(recovery.corruptPath ? { details: recovery.corruptPath } : {})}
    >
      {backups.length > 0 ? (
        <ul className="problem-backup-list">
          {backups.map((backup, index) => {
            const date = readableBackupDate(backup.name) ?? backup.name;
            return (
              <ProblemBackupRow
                key={backup.name}
                date={date}
                sub={AUTOMATIC_BACKUP_NAME.test(backup.name) ? copy.startup.backupAuto : backup.name}
                newest={index === 0}
                actionLabel={copy.startup.restoreBackupLabel(date)}
                onRestore={() => requestRestoreBackup(backup.name)}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[var(--lv-text-muted)]">{copy.startup.noBackups}</p>
      )}
    </ProblemPanel>
  );
}

/** What happened, that nothing was deleted, and what to do next. The recovery itself is unchanged. */
export function QuarantineNotice({ count, copy }: { count: number; copy: AppCopy }) {
  if (count === 0) return null;
  return (
    <div className="mb-4">
      <ProblemPanel
        tone="warning"
        title="読み込めない記録を隔離しました"
        description={copy.startup.quarantine(count)}
        what={copy.startup.quarantine(count)}
        data={copy.startup.quarantineData}
        next={copy.startup.quarantineNext}
        compact
      />
    </div>
  );
}
