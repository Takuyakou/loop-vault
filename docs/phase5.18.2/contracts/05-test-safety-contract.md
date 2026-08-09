<!-- phase-id: 5.18.2 -->
# Contract 05 — Test / Build Safety

Test-output hygiene mergeをprotected contractとする。
通常release gate後もworktree clean:
- Full Playwrightはtracked visual baselineを書き換えない
- baseline updateは `npm run test:e2e:update-baselines` のみ
- generated evidenceはignored
- Tauri buildでCargo.toml EOL diff 0
- 新規persistent lint warning 0
- 新規React act warning 0
- final git status empty
