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
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "練習データを復旧できませんでした。"); }
    finally { setPending(undefined); }
  };
  return (
    <Surface className="space-y-4 p-5" aria-labelledby="practice-recovery-title">
      <StatusMessage title="練習の記録を読み込めませんでした" tone="error">
        {actionError ?? error}
      </StatusMessage>
      <div>
        <h3 id="practice-recovery-title" className="text-sm font-semibold">復旧の方法</h3>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
          {readOnly ? "この練習ファイルは読み取り専用です。変更する前に Loop Vault を更新してください。元のファイルは置き換えも非表示もしません。" : "選んだバックアップは置き換える前にすべて検証します。Vault のデータは変わりません。"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={Boolean(pending)} onClick={() => void run("retry", onRetry)}>
          {pending === "retry" ? "再読み込み中…" : "もう一度読み込む"}
        </Button>
        {onRestore ? backups.map((backup) => (
          <Button key={backup.name} variant="ghost" disabled={Boolean(pending)} onClick={() => void run(backup.name, () => onRestore(backup.name))}>
            {pending === backup.name ? "復元中…" : `バックアップ r${backup.revision} を復元`}
          </Button>
        )) : null}
        {onStartFresh ? <Button variant="ghost" disabled={Boolean(pending)} onClick={() => void run("start-fresh", onStartFresh)}>{pending === "start-fresh" ? "開始中…" : "新しく始める"}</Button> : null}
      </div>
      {!readOnly && onRestore && backups.length === 0 ? <p className="text-xs text-[var(--lv-text-muted)]">検証済みのバックアップがありません。壊れた元のファイルは安全に残してあるので、「新しく始める」は使えます。</p> : null}
    </Surface>
  );
}
