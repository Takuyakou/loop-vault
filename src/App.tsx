function App() {
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
              Phase 0
            </p>
            <h2 className="mt-3 text-2xl font-semibold">App shell ready</h2>
            <p className="mt-3 text-neutral-300">
              The domain model, repository, and autosave workflow will grow from
              this Tauri foundation.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
