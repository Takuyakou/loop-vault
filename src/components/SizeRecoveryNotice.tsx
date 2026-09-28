
export function SizeRecoveryNotice({
  saving,
  error,
  onOpenVault,
}: {
  saving: boolean;
  error?: string;
  onOpenVault: () => void;
}) {
  const descriptionId = "vault-size-recovery-description";
  const statusId = "vault-size-recovery-status";
  const errorId = "vault-size-recovery-error";
  const describedBy = [descriptionId, statusId, ...(error && !saving ? [errorId] : [])].join(" ");
  return (
    <section
      className="mt-4 min-w-0 border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-50"
      aria-labelledby="vault-size-recovery-title"
      aria-describedby={describedBy}
      data-testid="vault-size-recovery-notice"
    >
      <h2 id="vault-size-recovery-title" className="font-semibold">
        {"Vaultを縮小してください"}
      </h2>
      <p id={descriptionId} className="mt-1 break-words text-xs text-amber-100">
        {"旧形式から復元したVaultが16 MiB上限を超えています。新規追加・書き出し・読み込みは停止中です。既存内容を短くするか、アイデア／進行を削除してください。上限内の変更は原子的な保存が成功した後に反映されます。"}
      </p>
      <p id={statusId} className="mt-2 break-words text-xs" role="status" aria-live="polite">
        {saving
          ? ("縮小したVaultを保存しています…")
          : ("現在は読み取り専用です。")}
      </p>
      {error && !saving ? (
        <p id={errorId} className="mt-2 break-words text-xs font-semibold" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-3 min-h-10 max-w-full rounded border border-amber-300/70 px-3 py-2 font-semibold text-amber-50 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] disabled:opacity-50"
        disabled={saving}
        aria-describedby={describedBy}
        onClick={onOpenVault}
      >
        {"Vaultを開いて縮小"}
      </button>
    </section>
  );
}