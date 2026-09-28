
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
      className="lv-status-warning mb-4 min-w-0 border p-4 text-sm"
      aria-labelledby="vault-size-recovery-title"
      aria-describedby={describedBy}
      data-testid="vault-size-recovery-notice"
    >
      <h2 id="vault-size-recovery-title" className="font-semibold text-[var(--lv-text)]">
        {"Vaultを縮小してください"}
      </h2>
      <p id={descriptionId} className="mt-1 break-words text-[var(--lv-text-secondary)]">
        {"旧形式から復元したVaultが16 MiB上限を超えています。新規追加・書き出し・読み込みは停止中です。既存内容を短くするか、アイデア／進行を削除してください。上限内の変更は原子的な保存が成功した後に反映されます。"}
      </p>
      <p id={statusId} className="mt-2 break-words text-xs text-[var(--lv-text-secondary)]" role="status" aria-live="polite">
        {saving
          ? ("縮小したVaultを保存しています…")
          : ("現在は読み取り専用です。")}
      </p>
      {error && !saving ? (
        <p id={errorId} className="mt-2 break-words text-xs font-semibold text-[var(--lv-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="lv-button-neutral mt-3 inline-flex min-h-10 max-w-full items-center px-4 font-medium"
        disabled={saving}
        aria-describedby={describedBy}
        onClick={onOpenVault}
      >
        {"Vaultを開いて縮小"}
      </button>
    </section>
  );
}