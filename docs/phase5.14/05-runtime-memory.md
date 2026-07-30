# Phase 5.14 Runtime and Memory

Measurements were taken on 2026-07-30 with the deterministic synthetic
round-trip harness. They are engineering measurements, not a cross-machine
benchmark.

## Export time

| Clip | Iterations | p50 | p90 | max |
|---|---:|---:|---:|---:|
| 8 chords | 100 | 0.096 ms | 0.171 ms | 0.392 ms |
| 100 chords | 50 | 1.465 ms | 1.723 ms | 5.265 ms |

The synchronous domain conversion remains below the UI-blocking gate for a
100-chord progression.

## Repeated export

Five hundred 100-chord exports produced an observed Node heap delta of
16,853,224 bytes. This number is conservative because the harness does not
force garbage collection. There are no retained React listeners, native drag
listeners, or module-level byte caches in the export path.

## Cache behavior

- The first drag performs atomic generation into the app cache.
- An identical byte payload reuses the content-addressed file.
- Every native drag receives a fresh token, preventing stale gesture state.
- Startup cleanup is linear in the direct cache entry count and best-effort.

## Bundle

The standalone final Vite build produced:

- CSS: 51.24 kB (10.94 kB gzip)
- JavaScript: 1,350.97 kB (395.84 kB gzip)

The Tauri production build produced:

- CSS: 51.11 kB (10.91 kB gzip)
- JavaScript: 1,326.74 kB (387.29 kB gzip)

Both emit the pre-existing `>500 kB` chunk warning. Phase 5.14 uses the
already-installed Lucide and Tauri packages; no frontend dependency or UI
framework was added.
