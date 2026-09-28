// P8.9-08: startup, recovery and quarantine states on the shared parts (LoadingState, StatusMessage).
// Moved out of App.tsx so the dev-only component gallery can show them; behavior is unchanged.
import type { AppCopy } from "../i18n";
import type { defaultVaultStore } from "../store/defaultVaultStore";
import { Button, LoadingState, StatusMessage } from "./ui";

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
      </div>
    );
  }
  return (
    <div className="lv-startup" data-testid="startup-state">
      <div className="w-full max-w-2xl">
        {loadStatus === "recovery" && recovery ? (
          <StatusMessage tone="warning" title={copy.startup.recoveryTitle}>
            <p>{copy.startup.recoveryBody}</p>
            {recovery.corruptPath ? <p className="mt-2 break-all text-xs text-[var(--lv-text-muted)]">{recovery.corruptPath}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
              {recovery.backups.length > 0 ? recovery.backups.map((backup) => (
                <Button key={backup.name} variant="neutral" className="justify-start text-left" onClick={() => requestRestoreBackup(backup.name)}>
                  {copy.startup.restoreBackup(backup.name)}
                </Button>
              )) : <p className="text-sm text-[var(--lv-text-muted)]">{copy.startup.noBackups}</p>}
            </div>
          </StatusMessage>
        ) : null}
        {loadStatus === "readonly" && readonly ? (
          <StatusMessage tone="warning" title={copy.startup.readonlyTitle}>
            {readonly.fileVersion ? copy.startup.newerVersion(readonly.fileVersion) : readonly.message}
          </StatusMessage>
        ) : null}
        {loadStatus === "error" ? (
          <StatusMessage tone="error" title={copy.startup.errorTitle}>{error ?? copy.startup.unknownError}</StatusMessage>
        ) : null}
      </div>
    </div>
  );
}

/** What happened, that nothing was deleted, and what to do next. The recovery itself is unchanged. */
export function QuarantineNotice({ count, copy }: { count: number; copy: AppCopy;}) {
  if (count === 0) return null;
  return (
    <StatusMessage tone="warning" className="mb-4" title="読み込めない記録を隔離しました">
      <p>{copy.startup.quarantine(count)}</p>
      <p>データは消していません。不完全な上書きを防ぐため、今は保存を止めています。</p>
      <p>次にすること：設定の「データ」から、置き換えで読み込むか、正常なバックアップを復元してください。</p>
    </StatusMessage>
  );
}
