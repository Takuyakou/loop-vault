import { useEffect } from "react";
import { useStore } from "zustand";
import {
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
} from "./store/closeGuard";
import { defaultVaultStore } from "./store/defaultVaultStore";

function App() {
  const loadStatus = useStore(defaultVaultStore, (state) => state.loadStatus);
  const ideas = useStore(defaultVaultStore, (state) => state.ideas);
  const settings = useStore(defaultVaultStore, (state) => state.settings);
  const quarantine = useStore(defaultVaultStore, (state) => state.quarantine);
  const recovery = useStore(defaultVaultStore, (state) => state.recovery);
  const readonly = useStore(defaultVaultStore, (state) => state.readonly);
  const unsaved = useStore(defaultVaultStore, (state) => state.unsaved);
  const saving = useStore(defaultVaultStore, (state) => state.saving);
  const error = useStore(defaultVaultStore, (state) => state.error);
  const initialize = useStore(defaultVaultStore, (state) => state.initialize);
  const restoreBackup = useStore(
    defaultVaultStore,
    (state) => state.restoreBackup,
  );

  useEffect(() => {
    void initialize();
    const unlistenBrowser = registerBrowserCloseGuard(defaultVaultStore);
    let unlistenTauri: (() => void) | undefined;

    void registerTauriCloseGuard(defaultVaultStore).then((unlisten) => {
      unlistenTauri = unlisten;
    });

    return () => {
      unlistenBrowser();
      unlistenTauri?.();
    };
  }, [initialize]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-teal-300">
              Loop Vault
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Focus your next loop.
            </h1>
          </div>
          <nav className="flex gap-2 text-sm text-neutral-300">
            <button className="rounded bg-neutral-800 px-3 py-2 text-neutral-50">
              Home
            </button>
            <button className="rounded px-3 py-2 hover:bg-neutral-900">
              Library
            </button>
          </nav>
        </header>

        <div className="grid flex-1 place-items-center">
          <div className="w-full max-w-2xl border border-neutral-800 bg-neutral-900 p-6">
            <p className="text-sm uppercase tracking-[0.16em] text-teal-300">
              Phase 2
            </p>
            {loadStatus === "loading" || loadStatus === "idle" ? (
              <StatusPanel
                title="Loading vault"
                body="Loop Vault is checking the local data file."
              />
            ) : null}

            {loadStatus === "ready" ? (
              <div>
                <h2 className="mt-3 text-2xl font-semibold">
                  Data store ready
                </h2>
                <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <Metric label="Ideas" value={ideas.length.toString()} />
                  <Metric
                    label="Monthly goal"
                    value={settings.monthlyGoal.toString()}
                  />
                  <Metric
                    label="Autosave"
                    value={saving ? "Saving" : unsaved ? "Pending" : "Clean"}
                  />
                </dl>
                {quarantine.length > 0 ? (
                  <div className="mt-5 border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                    {quarantine.length} invalid record
                    {quarantine.length === 1 ? "" : "s"} were quarantined.
                    Valid ideas are still available.
                  </div>
                ) : null}
              </div>
            ) : null}

            {loadStatus === "recovery" && recovery ? (
              <div>
                <h2 className="mt-3 text-2xl font-semibold">
                  Data file needs recovery
                </h2>
                <p className="mt-3 text-neutral-300">
                  The damaged file was moved aside, and Loop Vault did not
                  overwrite it with empty data.
                </p>
                {recovery.corruptPath ? (
                  <p className="mt-3 break-all text-sm text-neutral-400">
                    {recovery.corruptPath}
                  </p>
                ) : null}
                <div className="mt-5 space-y-2">
                  {recovery.backups.length > 0 ? (
                    recovery.backups.map((backup) => (
                      <button
                        key={backup.name}
                        className="block w-full rounded border border-neutral-700 px-3 py-2 text-left text-sm hover:bg-neutral-800"
                        onClick={() => void restoreBackup(backup.name)}
                      >
                        Restore {backup.name}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-400">
                      No backups are available yet.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {loadStatus === "readonly" && readonly ? (
              <StatusPanel
                title="Update Loop Vault"
                body={
                  readonly.fileVersion
                    ? `This data file uses fileVersion ${readonly.fileVersion}, which is newer than this app supports.`
                    : readonly.message
                }
              />
            ) : null}

            {loadStatus === "error" ? (
              <StatusPanel
                title="Could not load vault"
                body={error ?? "Unknown startup error."}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusPanel({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="mt-3 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-neutral-300">{body}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-800 bg-neutral-950 p-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </dt>
      <dd className="mt-2 text-lg font-semibold text-neutral-100">{value}</dd>
    </div>
  );
}

export default App;
