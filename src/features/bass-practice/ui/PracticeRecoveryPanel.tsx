import { useState } from "react";
import { readableBackupDate } from "../../../views/SettingsView";
import { Button } from "../../../components/ui";
import { ProblemBackupRow, ProblemPanel } from "../../../components/ProblemPanel";
import type { PracticeBackupMetadata } from "../infra/repository";

/** P23-30 P7: the practice record's own recovery screen, on the shared `ProblemPanel`. */
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
    <ProblemPanel
      tone={readOnly ? "accent" : "warning"}
      title="練習の記録を読み込めませんでした"
      description="Bass Practice の記録のファイルです。Vault の進行は無事です。"
      what="練習の記録のファイルを読めませんでした。"
      data={readOnly
        ? "消えていません。元のファイルは置き換えも非表示もしません。"
        : "消えていません。元のファイルは残してあります。バックアップは置き換える前にすべて検証します。"}
      next={readOnly ? "Loop Vault を新しくしてください。" : "バックアップに戻すか、記録を空にして新しく始めます。"}
      details={actionError ?? error}
      labelledBy="practice-recovery-title"
    >
      <h3 id="practice-recovery-title" className="text-sm font-semibold">復旧の方法</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={Boolean(pending)} onClick={() => void run("retry", onRetry)}>
          {pending === "retry" ? "再読み込み中…" : "もう一度読み込む"}
        </Button>
        {onStartFresh ? (
          <Button variant="danger" disabled={Boolean(pending)} onClick={() => void run("start-fresh", onStartFresh)}>
            {pending === "start-fresh" ? "開始中…" : "記録を空にして新しく始める"}
          </Button>
        ) : null}
      </div>
      {onRestore && backups.length > 0 ? (
        <ul className="problem-backup-list mt-3">
          {backups.map((backup, index) => {
            const readable = readableBackupDate(backup.name);
            const date = readable ?? `バックアップ r${backup.revision}`;
            return (
              <ProblemBackupRow
                key={backup.name}
                date={date}
                sub={backup.name}
                newest={index === 0}
                actionLabel={readable ? `${date} のバックアップに戻す` : `${date} に戻す`}
                disabled={Boolean(pending)}
                onRestore={() => void run(backup.name, () => onRestore(backup.name))}
              />
            );
          })}
        </ul>
      ) : null}
      {pending && pending !== "retry" && pending !== "start-fresh" ? <p role="status" className="mt-2 text-xs text-[var(--lv-text-muted)]">復元中…</p> : null}
      {!readOnly && onRestore && backups.length === 0 ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]">検証済みのバックアップがありません。壊れた元のファイルは安全に残してあるので、「記録を空にして新しく始める」は使えます。</p> : null}
      {readOnly ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]">読み取り専用です。記録を書き換える前に Loop Vault を更新してください。</p> : null}
    </ProblemPanel>
  );
}
