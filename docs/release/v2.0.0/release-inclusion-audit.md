# v2.0.0 Release Inclusion Audit

## Git reality / decision

- Audit date: 2026-10-03 (Asia/Tokyo). Release package has 2026-10-02 as an example date; the actual preparation date is used.
- Source local master: `36fd6aaa570e01d99343a3ba806e3901165e487a`. Fresh release branch `release/v2.0.0` uses the existing D-drive checkout; no new worktree.
- 485 local branches inspected. Classification counts: ALREADY_IN_MASTER=457, EXCLUDED_EXPERIMENTAL=2, EXCLUDED_SUPERSEDED=23, EXCLUDED_UNAPPROVED=2, INCLUDED=1.
- Completed current Product candidates, including Phase 10.1–10.3 and P11-13e, are already master ancestors. No additional historical branch is merged.
- P11-13e integration was explicitly authorized by the human and merged at `e8e35e0a`; frozen E1-T/inverse/lambda2/gamma1 default is INCLUDED. Developer CURRENT fallback remains. Integration authorization does not prove ergonomic correctness.
- P8.4 NO-GO, P8.5/P8.6 and Phase 9 NO-GO components are NOT promoted. Retained research source/docs are historical records, not runtime adoption. Current analyzer/extractor/Identity-Decoder and Vault v2 remain.
- Untracked audit/diagnostic files are excluded. Worktree paths and private inputs are not copied into this audit.
- GitHub read-only inspection: public `Takuyakou/loop-vault`, default master, latest release v1.1.0. Remote master object matches recorded origin/master; local master ahead776/behind0 at preparation. No rebase/reset or remote mutation.

## Current inclusion / phase evidence

| Component | Decision | Evidence / test and acceptance status |
| --- | --- | --- |
| P8.1 / P8.2 shared playback / meter | INCLUDED | scoped shared-only integration already ancestor; full Core v2 excluded |
| P8.8 text intake / playback / closure | INCLUDED | integrated Product branches are master ancestors |
| Test DX | INCLUDED | integrated runner; fresh release FULL bypasses cache |
| Phase 10.1 / 10.2 / 10.3 correction workspace | INCLUDED | all branch heads are master ancestors; docs still say unmerged, Git supersedes those historical statements |
| P11-00–11 Voicing Loop / Human Acceptance fixes | INCLUDED | previously approved integrations; notes and Vault contract preserved |
| P11-13a–e recommended fingering | INCLUDED | approved normal-path integration, frozen policy, session CURRENT fallback; cluster limitations retained |
| P11-13 diagnostic sweeps / reserved | EXCLUDED_EXPERIMENTAL (runtime) | archived code retained; no rerun, retuning or extra adoption |
| full Phase 8 foundation / P8.4/P8.5/P8.6 | EXCLUDED_EXPERIMENTAL (Product) | no whole-branch merge or Product promotion |
| Phase 9 Core v2 | EXCLUDED_EXPERIMENTAL (Product) | merged research records do not change baseline |

## All local branches

`base` is merge-base with source master, not an inferred original branch creation point. ALREADY_IN_MASTER is an ancestry fact, not a new test or Human Acceptance verdict. Excluded old branches are not interpreted as pending merge candidates.

| Branch | HEAD | base | master ancestor | Classification | Change / phase / acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| `archive/p516-stacked-before-integration` | `0ea7b92e` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `audit/p11-12-fingering-ranker` | `bf6e28b3` | `bf6e28b3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `audit/p531-stage00` | `fbdfb8de` | `fbdfb8de` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `audit/security-v1.1.0` | `dcbf998b` | `dcbf998b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `audit/test-suite-deletion-candidates` | `94dae5b6` | `94dae5b6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/bump-v1.0.0` | `23073d8b` | `23073d8b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/commit-stray-docs` | `d76414bf` | `d76414bf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/license-all-rights-reserved` | `10662e3e` | `10662e3e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/phase-docs-workflow` | `b39bec4e` | `b39bec4e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/public-release-prep` | `86171633` | `86171633` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/scrub-username` | `12a70e03` | `12a70e03` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/security-p1-hardening` | `8bc3a6b1` | `8bc3a6b1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/settings-visual-baseline-hygiene` | `0f3b9d2b` | `747c70cc` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `chore/test-dx-token-efficiency` | `ef017f26` | `ef017f26` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/test-output-hygiene` | `9b3bcb84` | `9b3bcb84` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/test-suite-hygiene` | `084d05c5` | `084d05c5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `chore/test-suite-rationalization` | `f8533335` | `f8533335` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `closure/p5181-final` | `7d5b3929` | `7d5b3929` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `data/p3-6-5-14-evaluation-refresh` | `3f218354` | `3f218354` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `data/p3-6-5-18-final-evaluation` | `a11b4060` | `a11b4060` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `diag/p44-1-validation-pipeline-trace` | `481187c2` | `481187c2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/current-midi-detection-spec` | `e99349e8` | `e99349e8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/detector-research-report` | `44ac37db` | `44ac37db` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-2-final-report` | `ad374b47` | `ad374b47` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-3-00-audit` | `50736656` | `50736656` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-3-final-report` | `8b0bb828` | `8b0bb828` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-4-plan` | `dba2b3ad` | `dba2b3ad` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-5-00-audit` | `7c7774fa` | `7c7774fa` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-5-08-analysis-mixer-gate` | `91532f0c` | `91532f0c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-5-14-final-report` | `3f218354` | `3f218354` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-6-5-19-final-report` | `422d1ee5` | `422d1ee5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-0-l0-audit` | `1d46ba62` | `1d46ba62` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-0-l6-qa-report` | `431c171d` | `431c171d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-0-work-report` | `d7f8bbf7` | `d7f8bbf7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-1-1-f0-selection-audit` | `78b8e8cd` | `78b8e8cd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-1-1-f5-qa-report` | `503967c7` | `503967c7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-1-2-work-report` | `2f8aaaf6` | `2f8aaaf6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-1-s0-audit` | `90edd2a2` | `90edd2a2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-7-1-s6-qa-report` | `04a8f55d` | `04a8f55d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-8-0-a0-llm-audit` | `7947b33f` | `7947b33f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p3-9-3-final-work-report` | `1adb2608` | `1adb2608` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p40-00-audit-baseline` | `24f770ef` | `24f770ef` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p40-work-report` | `c28938dc` | `c28938dc` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p42-00-current-state-audit` | `38badf4b` | `38badf4b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p43-00-current-state-and-contract` | `eac139b1` | `eac139b1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p43-01-label-alternative-audit` | `476299f9` | `476299f9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p43-02-voicing-pipeline-audit` | `f2d109f5` | `f2d109f5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p43-08-real-midi-review-pack` | `966fa9d2` | `966fa9d2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p43-09-final-report` | `72ee2928` | `72ee2928` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p44-00-baseline-and-gates` | `a01c0215` | `a01c0215` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p44-03-intervention-lock` | `9619f639` | `9619f639` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p442-07-non-promotion` | `145628d8` | `145628d8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p443-00-evaluation-contract` | `4938326f` | `4938326f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p443-06-final-decision` | `09b38068` | `09b38068` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p45-00-contract-baseline` | `1a08c4d6` | `1a08c4d6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p45-06-decision-lock` | `63be93f4` | `63be93f4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p46-00-contract-baseline` | `91e69c89` | `91e69c89` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p46-03-target-family-lock` | `d8ab0004` | `d8ab0004` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p46-07-final-decision` | `b5daeeac` | `b5daeeac` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p47-00-contract-baseline` | `5a6cdacf` | `5a6cdacf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p47-09-final-decision` | `6cb97ad6` | `6cb97ad6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p48-00-contract-baseline` | `870c24d1` | `870c24d1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p48-09-final-decision` | `800728bf` | `800728bf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p5-1-00-audit` | `0044a8ed` | `0044a8ed` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p513-00-ui-audit` | `7886d4ba` | `7886d4ba` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p513-3-00-audit` | `d17a6417` | `d17a6417` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p513v2-00-audit` | `4bd1c91d` | `4bd1c91d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p514-00-audit` | `a7e662cb` | `a7e662cb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/p515-00-preflight-baseline` | `b1862816` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `docs/p5161-00-audit` | `8661e5da` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `docs/p5162-00-audit` | `c61a1526` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `docs/p5163-00-audit` | `2de94bbe` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `docs/phase3-5-work-report` | `a97afc1a` | `a97afc1a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/phase3-work-report` | `a2013a33` | `a2013a33` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/readme-bilingual` | `e7d42162` | `e7d42162` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/readme-japanese` | `bcc539fe` | `bcc539fe` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `docs/uiux-spec-3-6-3-20260715` | `755b7491` | `755b7491` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p43-04-oracle-voicing-baseline` | `039291d6` | `039291d6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p43-05-voicing-ablation` | `14814795` | `14814795` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p43-06-voicing-failure-taxonomy` | `bf4edb22` | `bf4edb22` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p44-01-mechanism-classification` | `f041513c` | `f041513c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p44-02-oracle-a-plus` | `8e882195` | `8e882195` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p44-05-dev-tuning` | `eb4a4f1b` | `eb4a4f1b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p44-06-validation-freeze` | `add64245` | `add64245` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p442-00-corpus-baseline` | `fd327534` | `fd327534` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p442-01-failure-matrix` | `d25fb8e9` | `d25fb8e9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p442-04-intervention-lock` | `81e700f3` | `81e700f3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p442-05-validation` | `6abb2be8` | `6abb2be8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p442-06-holdout` | `e2b42fa1` | `e2b42fa1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p443-01-holdout-classification` | `f08e7dbd` | `f08e7dbd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p443-03-loso-cv` | `97586cb4` | `97586cb4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p45-01-rank-distribution` | `4f293415` | `4f293415` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p45-02-candidate-recall-funnel` | `2e4fcea7` | `2e4fcea7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p45-03-miss-taxonomy` | `65e46de4` | `65e46de4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p45-04-same-root-oracle` | `9c3c5e9a` | `9c3c5e9a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p45-05-root-confidence-calibration` | `46e77cd4` | `46e77cd4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p46-01-basic-m7-trace` | `ec0e2c72` | `ec0e2c72` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p46-02-missing-taxonomy` | `35e7225c` | `35e7225c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p46-05-shadow-coverage` | `bba19242` | `bba19242` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p46-06-counterfactual-risk` | `d3cab7bf` | `d3cab7bf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p47-01-real-scope` | `e11f6ff9` | `e11f6ff9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p47-03-invariants-displacement` | `f3ddb3e9` | `f3ddb3e9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p47-04-new-corpus-integrity` | `49d08ab6` | `49d08ab6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p47-05-new-dev` | `c7447e56` | `c7447e56` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p48-01-a7b9-trace` | `a881f839` | `a881f839` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p48-03-dev-selection-lock` | `dede3db4` | `dede3db4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p5-04-accuracy-first-report` | `56a8c105` | `56a8c105` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `eval/p5-hybrid-runtime-reassessment` | `40643a8c` | `40643a8c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.0-00-audit` | `7c48a5b9` | `7c48a5b9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.0-02-display` | `319e93cb` | `319e93cb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.0-03-editing` | `db5031af` | `db5031af` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.0-06-save` | `6fd28882` | `6fd28882` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.0-07-finish` | `e7900648` | `e7900648` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.1-workspace-fixes` | `54e71957` | `54e71957` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.2-workspace-polish` | `396ab2b3` | `396ab2b3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p10.3-workspace-followups` | `1c66a986` | `1c66a986` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p11-13-fingering-hand-position` | `4b275435` | `4b275435` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p3-8-0-a1-provider-foundation` | `b5413b8e` | `b5413b8e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p3-8-0-a2-settings-secrets` | `00c2682d` | `00c2682d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p3-8-0-a3-advisor-domain` | `b385a819` | `b385a819` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p3-8-0-a4-advisor-ui` | `8f75f89a` | `8f75f89a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p3-8-0-a5-local-context` | `331efe30` | `331efe30` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p3-8-0-a6-openai-provider` | `9c1c3d5c` | `9c1c3d5c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p513-01-design-system` | `7123e22b` | `7123e22b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p513-02-app-shell` | `4e29e98a` | `4e29e98a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p513-03-capture-ux` | `e2efa987` | `e2efa987` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p513-04-result-correction` | `926246b6` | `926246b6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p513-05-secondary-screens` | `61c957e8` | `61c957e8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p513-06-reaudit` | `7f60e89e` | `7f60e89e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p516-freepats-bass-timbre` | `5feba44f` | `5feba44f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p517-record-and-compare` | `6f8f33ea` | `6f8f33ea` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p518-chord-context-practice` | `146ff7b4` | `146ff7b4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p5181-bassline-preset-vault-picker` | `582f77db` | `582f77db` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p5181-source-integration` | `11c0f5b9` | `11c0f5b9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p5182-vault-source-discoverability` | `0e27c10e` | `ed129d76` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feat/p519-root-motion-echo` | `6b4961fb` | `6b4961fb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p520-text-progression-entry` | `612641fd` | `612641fd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p521-harmonic-core-role-v2` | `bd937205` | `bd937205` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p5211-mixed-voice-harmonic-extraction` | `594e1535` | `594e1535` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p522-source-bassline-practice` | `a6c18acc` | `a6c18acc` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p523-timeline-candidate-legibility` | `a96c7924` | `a96c7924` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p524-harmonic-rhythm-fragment-consolidation` | `d78f2add` | `d78f2add` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p525-source-bassline-window-expansion` | `3ab41910` | `3ab41910` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p526-local-harmonic-rhythm-spelling-tensions` | `1f40da34` | `1f40da34` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p527-progression-voicing-practice` | `7029fafb` | `7029fafb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p528-voicing-loop-inline-vault` | `623d9530` | `623d9530` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p528-voicing-loop-navigation` | `4cf7d2ab` | `4cf7d2ab` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p529-voicing-loop-harmonic-rhythm` | `15b1ed82` | `15b1ed82` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p530-voicing-loop-polish` | `671fea91` | `671fea91` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p532-practice-surface-controls` | `49e9ab38` | `49e9ab38` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p532-suggested-fingering` | `915be471` | `915be471` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p533-voicing-rule-engine-v2` | `bf3ce792` | `bf3ce792` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p534-midi-import-failure-isolation` | `5fa26e06` | `5fa26e06` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p535-context-aware-harmonic-evidence` | `794af1f4` | `794af1f4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p537-union-chimera-production` | `d3ccb86f` | `d3ccb86f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p538-family-a-downstream` | `0eedf268` | `0eedf268` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p539-family-c-representability` | `77e0458a` | `77e0458a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p540-local-harmonic-identity-ranking` | `fa089e6f` | `fa089e6f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p6-orchestrator-stage00` | `1c37ae95` | `362e0df3` | false | EXCLUDED_UNAPPROVED | abandoned orchestrator closed; no Product adoption |
| `feat/p8.9-00-setup` | `b6c3a51c` | `b6c3a51c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p8.9-01-foundation` | `94ccd118` | `94ccd118` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p8.9-02-shell` | `4d626c33` | `4d626c33` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p8.9-03-cleanup` | `240c6f28` | `240c6f28` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p8.9-04-home-vault` | `5a12c487` | `5a12c487` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p8.9-08-settings` | `0bdb4516` | `0bdb4516` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/p8.9-09-finish` | `db2e4213` | `db2e4213` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase11-voicing-loop-v4` | `5359a037` | `5359a037` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8-extended-text` | `f1dca64e` | `f1dca64e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.1-realworld-fix` | `c0ba1708` | `c0ba1708` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.2-text-intake-ux` | `a4da1b6f` | `a4da1b6f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.3-defining-tone-correctness` | `36080b06` | `36080b06` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.4-text-capture` | `7ef13b9d` | `7ef13b9d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.5-final-ui-correction` | `fef93c98` | `fef93c98` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.5-global-playback-text-polish` | `b6d979f4` | `b6d979f4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/phase8.8.6-final-capture-closure` | `5f03e185` | `5f03e185` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/stage0-ai-handoff` | `3b05b907` | `3b05b907` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/stage0-ai-handoff-p5182base` | `17e63cfe` | `ed129d76` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feat/voicing-loop-controls-redesign` | `42633cd5` | `42633cd5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-full-shell` | `f0756180` | `f0756180` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-v2` | `05df5c53` | `05df5c53` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl06` | `06277eb9` | `06277eb9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl07` | `20703da1` | `20703da1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl08` | `34f53d8a` | `34f53d8a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl09` | `e8b83f1c` | `e8b83f1c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl10` | `e9b93e68` | `e9b93e68` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl11` | `7db198d5` | `7db198d5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feat/voicing-loop-vl12` | `6e39c4fa` | `6e39c4fa` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature-japanese-ui-audio-preview` | `2b269cc3` | `2b269cc3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/app-icon-refresh` | `7e071856` | `7e071856` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/global-preview-sound` | `3e038ba5` | `3e038ba5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/minimap-double-click-scroll` | `38e44349` | `38e44349` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p2-5-candidate-cards` | `352c59af` | `352c59af` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p2-5-capture-layout` | `a3e4b509` | `a3e4b509` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p2-5-chord-drip-copy` | `8d71f325` | `8d71f325` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p2-5-library-progression-preview` | `cb713e19` | `cb713e19` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p2-5-midi-drag-drop` | `2e9df3e9` | `2e9df3e9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p2-5-save-dialog` | `df5fcaf2` | `df5fcaf2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-01-ui-foundation` | `5ca9cae6` | `5ca9cae6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-02-home-refresh` | `374cfe94` | `374cfe94` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-03-capture-workbench` | `d60ee358` | `d60ee358` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-04-vault-refresh` | `6e9df691` | `6e9df691` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-05-settings-refresh` | `81d1df2f` | `81d1df2f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-06-shell-and-icon-docs` | `484334ae` | `484334ae` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-01-view-extraction` | `bc0e28f6` | `bc0e28f6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-02-design-tokens` | `daed12de` | `daed12de` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-03-degree-search` | `f921db4e` | `f921db4e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-04-vault-rows` | `e58ac37f` | `e58ac37f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-05-keyboard-browser` | `9c0913b0` | `9c0913b0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-06-progression-filters` | `f680f43c` | `f680f43c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-07-home-polish` | `18c558bf` | `18c558bf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-5-08-demo-seed` | `7a60e950` | `7a60e950` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-00-evaluation-baseline` | `4e5664da` | `4e5664da` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-01-note-normalization` | `e13f06cd` | `e13f06cd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-02-track-role-ornaments` | `dab6c518` | `dab6c518` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-03-adaptive-segmentation` | `8c172fb8` | `8c172fb8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-04-candidate-scoring` | `1aafaf5d` | `1aafaf5d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-05-viterbi-decoder` | `7d1eb63d` | `7d1eb63d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-06-merge-confidence` | `49e17065` | `49e17065` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-07-hybrid-integration` | `f52ba362` | `f52ba362` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-08-tuning-performance` | `8c5225a0` | `8c5225a0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-1-00-failure-diagnostics` | `20152be0` | `20152be0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-1-01-ablation-harness` | `0cd5630b` | `0cd5630b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-1-02-legacy-boundary-reranker` | `0ac27b4f` | `0ac27b4f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-1-03-split-evaluation` | `c9cece30` | `c9cece30` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-00-audit` | `c7f3933d` | `c7f3933d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-01-stored-regression` | `17b264c1` | `17b264c1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-02-difference-review` | `a51dfb1b` | `a51dfb1b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-03-correction-promotion` | `a9f8dd64` | `a9f8dd64` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-04-acceptable-alternatives` | `1234bd80` | `1234bd80` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-05-active-review-queue` | `09fe611d` | `09fe611d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-06-real-midi-evaluation` | `4c97aa40` | `4c97aa40` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-2-07-capture-settings-integration` | `e21df42c` | `e21df42c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-01-editable-domain` | `ac5c3114` | `ac5c3114` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-02-workspace-shell` | `756bff65` | `756bff65` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-03-replacement-editing` | `becda78b` | `becda78b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-04-structure-editor` | `1c631f47` | `1c631f47` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-05-save-feedback` | `20a6f15b` | `20a6f15b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-06-structural-editing` | `d948dd75` | `d948dd75` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-3-07-polish-qa` | `c38bdcaf` | `c38bdcaf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-01-hold-reason-tailwind` | `15b2d7c0` | `15b2d7c0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-02-common-modal` | `a902231f` | `a902231f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-03-playback-controller` | `91e76bf4` | `91e76bf4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-04-generic-undo` | `28b92eb9` | `28b92eb9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-05-save-cta` | `f79417a2` | `f79417a2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-06-responsive-inspector` | `ca9bbbad` | `ca9bbbad` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-07-status-ui` | `cbe1e84e` | `cbe1e84e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-08-save-policy` | `406b7033` | `406b7033` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-09-vault-open` | `3f60054a` | `3f60054a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-10-settings-sections` | `8b16c945` | `8b16c945` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-11-header-status` | `38123628` | `38123628` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-12-i18n-terms` | `7c24d66b` | `7c24d66b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-13-icon-system` | `83799f57` | `83799f57` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-14-home-hierarchy` | `2569770a` | `2569770a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-15-song-minimap` | `8b2faed9` | `8b2faed9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-4-16-qa-report` | `4dc9a767` | `4dc9a767` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-01-voice-model` | `3cf8598f` | `3cf8598f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-02-role-profiles` | `ad2a0049` | `ad2a0049` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-03-dirty-corpus` | `f8ecdc8b` | `f8ecdc8b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-04-voice-aware-reranker` | `37148e6b` | `37148e6b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-05-candidate-diversity` | `82802e54` | `82802e54` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-06-correction-cost` | `d042bb39` | `d042bb39` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-07-correction-propagation` | `20cd7227` | `20cd7227` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-09-final-qa-report` | `91532f0c` | `91532f0c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-6-5-1-long-midi-candidate-selection` | `c1b0854c` | `c1b0854c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-0-1-live-midi-latency` | `38ca7ebd` | `38ca7ebd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-0-l1-midi-transport` | `0b3673c8` | `0b3673c8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-0-l2-live-midi-domain` | `cba05e9a` | `cba05e9a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-0-l3-mini-window` | `58873fb3` | `58873fb3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-0-l4-live-midi-ui` | `02230468` | `02230468` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-0-l5-history-import` | `ae24f16d` | `ae24f16d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-1-f8-add-progression-chord` | `56c4a3ab` | `56c4a3ab` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-1-f9-contextual-chord-add` | `876dda99` | `876dda99` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-2-smooth-style-candidates` | `a097643d` | `a097643d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-s1-progression-detail` | `51b12947` | `51b12947` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-s2-quick-chord-editor` | `545031eb` | `545031eb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-s3-progression-index` | `282014b9` | `282014b9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-s4-smart-library` | `cb9afb55` | `cb9afb55` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-7-1-s5-mood-header` | `3280c90f` | `3280c90f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-8-5-voicing-memory-foundation` | `5335c4bc` | `5335c4bc` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-9-0-1-piano-keyboard-visualizer` | `50ee8b55` | `50ee8b55` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-9-0-chord-dojo` | `bf0a0e75` | `bf0a0e75` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-9-2-style-voicing-practice` | `8d2a45e1` | `8d2a45e1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-9-3-l4-l5-mix-session` | `19a21c22` | `19a21c22` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p3-9-3-master-volume-knob` | `c821d952` | `c821d952` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p40-03-candidate-event-model` | `92a42561` | `92a42561` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p40-04-block-selection-v2` | `d62ff3e0` | `d62ff3e0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p40-05b-quality-evidence` | `c75def97` | `c75def97` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p40-06-promote-analyzer` | `3d094b3a` | `3d094b3a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p413-m2-timeline-range-ui` | `2e52cab2` | `2e52cab2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p413-m3-manual-candidate-editor` | `fa4af945` | `fa4af945` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p413-m4-preview-save-integration` | `7a6d4ad2` | `7a6d4ad2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p413-m5-validation-promotion` | `183e5239` | `183e5239` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p42-01-unified-draft-entry` | `c3ee73d5` | `c3ee73d5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p42-02-unified-history` | `a189b6d6` | `a189b6d6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p42-03-range-and-boundary-editing` | `5bf84cd5` | `5bf84cd5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p42-04-context-actions-and-voicing` | `17c4d02f` | `17c4d02f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p42-05-keyboard-preview-session` | `e444d962` | `e444d962` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p42-06-final-validation` | `dad0e7e7` | `dad0e7e7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p421-primary-range-selection` | `f26b9f9f` | `f26b9f9f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p43-07-representation-vocabulary` | `8c357d00` | `8c357d00` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p44-04-shadow-role-or-filter` | `03e698b3` | `03e698b3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p44-08-promotion-closeout` | `199f822e` | `199f822e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p44-ui-voicing-source-chip` | `e81cab6b` | `e81cab6b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p442-02-relative-support-shadow` | `e16f5663` | `e16f5663` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p442-03-count-duration-shadow` | `2c035aa4` | `2c035aa4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p443-02-a1-prime-shadow` | `8998918c` | `8998918c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p443-04-voicing-source-chip` | `2e1f4a94` | `2e1f4a94` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p443-05-review-recovery-dojo-order` | `31f5dc30` | `31f5dc30` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p45-11-final-decision` | `fe905ce5` | `fe905ce5` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p46-04-compositional-shadow-generator` | `bc7d6a15` | `bc7d6a15` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p46-label-correction-log` | `fd27d8d4` | `fd27d8d4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p47-02-part-a-shadow` | `0ba5cdbd` | `0ba5cdbd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p48-02-shadow-generators` | `911f4f85` | `911f4f85` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-01-correction-log-verify` | `e635c3fb` | `e635c3fb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-02-accuracy-first-flags` | `f15ab8b4` | `f15ab8b4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-03-capture-speed-ui` | `be06b50c` | `be06b50c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-1-01-voice-extraction` | `763548d9` | `763548d9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-1-02-analysis-session` | `0450b7bb` | `0450b7bb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-1-03-pre-analysis-ui` | `a0d0acdb` | `a0d0acdb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-1-04-analyzer-integration` | `45bada39` | `45bada39` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-1-05-playback-role-log` | `f52b916f` | `f52b916f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-1-06-evaluation-build` | `c0029049` | `c0029049` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-12-piano-roll-preset-scroll` | `6828e56e` | `6828e56e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5-accuracy-candidate-union` | `6c3a244e` | `6c3a244e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p513-3-03-preview-level-meter` | `991f5b84` | `991f5b84` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p513-3-07-home-chord-preview` | `6dc369f6` | `6dc369f6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p514-01-midi-export-domain` | `365b5b17` | `365b5b17` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p514-02-midi-file-cache` | `46d6be65` | `46d6be65` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p514-03-native-daw-drag` | `f8c8c7b6` | `f8c8c7b6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p514-04-progression-midi-ui` | `e99e1f7d` | `e99e1f7d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/p5161-01-domain-generator` | `794220f8` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5161-02-playback-sing` | `4a579027` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5161-03-ui-home` | `55ef1227` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5161-04-review-storage-history` | `3f6144ff` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5162-01-rhythm-domain` | `faf5c8cd` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5162-02-metronome-playback` | `6df4ef77` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5162-03-ui-review-history` | `fe5b4572` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5163-01-bassline-generator` | `f8f4ac31` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5163-02-vault-source` | `a56b72b2` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/p5163-03-ui-history` | `f757e5a7` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `feature/stage-f-final-closeout` | `ae5f6ae0` | `ae5f6ae0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f0-factorized-representation` | `94f24403` | `94f24403` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f1-shadow-diagnostics` | `e0a72d8b` | `e0a72d8b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f2-shadow-root` | `40af2097` | `40af2097` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f2a-root-ranking-attribution` | `f9cae936` | `f9cae936` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f2r-selective-root-correction` | `db0983c8` | `db0983c8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f2w-walking-bass-candidates` | `d67b7167` | `d67b7167` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f3a-quality-tristate` | `51bd3db8` | `51bd3db8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/stage-f5a-independent-tension` | `8f4d7afa` | `8f4d7afa` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `feature/ui-language-toggle` | `a790c6f0` | `a790c6f0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/advisor-prompt-handoff-audit` | `fb402da7` | `fb402da7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/capture-range-candidate-switch` | `e10a2707` | `e10a2707` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/capture-save-close-failure` | `cede02f4` | `cede02f4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/capture-save-to-vault` | `eb17a7e4` | `eb17a7e4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/chord-card-audio-clicks` | `77fe31f9` | `77fe31f9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/full-timeline-piano-preview` | `8f4b1286` | `8f4b1286` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/keyboard-details-timeline-switch` | `a4e0658a` | `a4e0658a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/master-volume-knob-border` | `d83b527b` | `d83b527b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/midi-reload-analysis-details` | `5aeca361` | `5aeca361` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-07-playback-and-header` | `36c20c9f` | `36c20c9f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-3-candidate-actions-header` | `fa7bbc80` | `fa7bbc80` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-3-hide-timeline-marker` | `da00e69f` | `fa7bbc80` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `fix/p3-6-3-timeline-play-toggle` | `c40938b7` | `c40938b7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-3-timeline-sound-selector` | `e339a733` | `e339a733` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-09-evaluation-guards` | `eb4b667d` | `eb4b667d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-10-voice-build-performance` | `7c6405f7` | `7c6405f7` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-11-global-program-chronology` | `b1ba619e` | `b1ba619e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-12-propagation-feedback` | `7410ed8a` | `7410ed8a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-13-feedback-compat` | `3f218354` | `3f218354` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-14-track-local-note-pairing` | `38a0e638` | `38a0e638` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-15-dirty-metric-guards` | `9501b0cf` | `9501b0cf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-6-5-16-real-midi-input-guard` | `fed42f76` | `fed42f76` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-0-midi-device-settings` | `d459f099` | `d459f099` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-0-windows-console` | `fd0c6c29` | `fd0c6c29` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-1-f1-selection-state` | `057ee3ac` | `057ee3ac` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-1-f2-detail-card-editing` | `ec5d2736` | `ec5d2736` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-1-f3-five-alternatives` | `2d3bfcce` | `2d3bfcce` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-1-f4-library-default` | `e9c552aa` | `e9c552aa` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-1-f6-progression-navigation` | `8e55b515` | `8e55b515` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-1-f7-card-preview-editor-close` | `831fac52` | `831fac52` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-2-five-source-candidates` | `fb874b04` | `fb874b04` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-2-progression-editing-followups` | `a086662f` | `a086662f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-7-1-2-vault-row-clipping` | `32683aeb` | `32683aeb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-8-0-advisor-interactions` | `aeee5c43` | `aeee5c43` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-8-0-local-llm-schema-compat` | `b89bf876` | `b89bf876` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p3-9-3-smaller-practice-keyboard` | `c6a5cdd0` | `c6a5cdd0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p40-01-chord-label-contract` | `5c201fd3` | `5c201fd3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p40-capture-chord-card-voicing` | `a7222ff1` | `a7222ff1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p42-midi-load-blank-screen` | `31fae98b` | `31fae98b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5-1-complex-midi-preanalysis` | `cb543e51` | `cb543e51` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5-12-analysis-selection-audit` | `06ed1644` | `06ed1644` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5-12-inline-preanalysis-product-path` | `f4be56be` | `f4be56be` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5-12-playback-preset-controls` | `a63e2d1a` | `a63e2d1a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5-analysis-profile-flags` | `31bf60cd` | `31bf60cd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5-e1-product-connection` | `d135367d` | `d135367d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513-3-01-live-midi-window` | `ea3d91c1` | `ea3d91c1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513-3-02-dojo-scroll` | `97171b96` | `97171b96` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513-3-04-live-window-hardening` | `30c360a2` | `30c360a2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513-3-05-dojo-viewport` | `070dcd7b` | `070dcd7b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-03-home` | `7fe16b82` | `7fe16b82` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-04-capture` | `6be2ed81` | `6be2ed81` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-05-vault` | `09d9ece3` | `09d9ece3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-06-progression-detail` | `80bafc90` | `80bafc90` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-07-practice-live` | `30c0b39f` | `30c0b39f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-08-history-settings` | `34ac4d99` | `34ac4d99` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p513v2-sidebar-width` | `30372ba8` | `30372ba8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p515-01-exact-evidence-dedup` | `1f16613e` | `2eb36b63` | false | EXCLUDED_UNAPPROVED | frozen WIP; no completion/adoption evidence |
| `fix/p516-product-activation` | `f442e61c` | `f442e61c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p520-midi-monitor-piano-timbre` | `4c7e9259` | `4c7e9259` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p5261-source-voicing-full-playback` | `a72f91e8` | `a72f91e8` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p532-61-key-range-proportions` | `e4b67b57` | `e4b67b57` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p532-compact-one-screen-layout` | `1e3475dd` | `1e3475dd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p532-compact-one-screen-layout-ux` | `be28ab4b` | `be28ab4b` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p532-human-acceptance-follow-up` | `1e3475dd` | `1e3475dd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p532-shell-taxonomy-follow-up` | `c78a2a6e` | `c78a2a6e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-beat-position-indicators` | `7f9744fb` | `7f9744fb` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-candidate-reduction-follow-up` | `2a2bc878` | `2a2bc878` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-extended-reduction-generalization` | `b86124d4` | `b86124d4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-live-study-controls` | `44202d21` | `44202d21` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-smooth-position-indicator` | `d9ff5495` | `d9ff5495` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-study-generator-generalization` | `ee35a0de` | `ee35a0de` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-study-ui-optimizer-follow-up` | `276d9b6d` | `276d9b6d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-transport-continuity-polish` | `cae487f2` | `cae487f2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p533-transport-continuity-polish-v2` | `c603d51e` | `c603d51e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p8.9-exe-feedback` | `80d5d25a` | `80d5d25a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/p8.9-final-polish` | `a6b94249` | `a6b94249` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/phase11-acceptance-layout-source-hands` | `29918fef` | `29918fef` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/phase11-generated-bass-audio` | `0636cfbf` | `0636cfbf` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/post-phase9-ui-bugs` | `0a7af95a` | `0a7af95a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/practice-resolved-voicing-allowed-tones` | `89979bf9` | `89979bf9` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/source-bassline-panel-order` | `dc2d76f4` | `dc2d76f4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/timeline-range-switch-resize` | `cecfd80d` | `cecfd80d` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/ui-keyboard-focus-labels` | `503d3a72` | `503d3a72` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/ui-settings-operation-state` | `ae7f4a50` | `ae7f4a50` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/ui-unsaved-navigation-guard` | `8da91fa0` | `8da91fa0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/ui-vault-long-content` | `22a136c3` | `22a136c3` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/voicing-loop-explicit-source-selection` | `a772dc9a` | `a772dc9a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/voicing-loop-playback-device-ui` | `883fbb97` | `883fbb97` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/voicing-loop-restart-clock-sync` | `049e2566` | `049e2566` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/voicing-loop-runtime-start-layout` | `e73584e4` | `e73584e4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/voicing-loop-shell-guidance` | `4f3f6bbd` | `4f3f6bbd` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/voicing-loop-source-availability-first-chord` | `6043e833` | `6043e833` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/weighted-representative-bpm` | `8d3f43b1` | `8d3f43b1` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `fix/window-close-exit` | `6da85c82` | `6da85c82` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `integration/p516-only` | `b6dae200` | `b6dae200` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `master` | `36fd6aaa` | `36fd6aaa` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p40-closeout` | `2ce62738` | `2ce62738` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-00-evaluation-contract` | `e8d8a810` | `e8d8a810` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-01-occurrence-model` | `4e87fd09` | `6f9baf9e` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `p41-02-coverage-selector` | `c3ba9f84` | `c3ba9f84` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-03-section-segmentation` | `8dc02efa` | `8dc02efa` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-04-section-aware-selection` | `68da9f84` | `68da9f84` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-05-extracted-midi-profile` | `337d6861` | `337d6861` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-06-section-coverage-ui` | `f8a3746f` | `f8a3746f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p41-07-final-validation` | `958fbbad` | `958fbbad` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p412-h4-catalog-validation-promotion` | `2b3b1442` | `2b3b1442` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p413-m0-manual-repair-baseline` | `54c5d22f` | `54c5d22f` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `p413-m1-manual-range-domain` | `776b47b4` | `776b47b4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `preserve/p532-staged-reverse-diff-20260916` | `c78a2a6e` | `c78a2a6e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `promotion/p8-shared-fixes` | `afc47c21` | `6b728b56` | false | EXCLUDED_EXPERIMENTAL | full Phase 8 foundation not approved; scoped shared-only branch is already in master |
| `promotion/p8-shared-only` | `e4ea5632` | `e4ea5632` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `recovery/p521-role-v2-promotion` | `fa9de161` | `fa9de161` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `refactor/p513v2-01-design-system` | `7fc5d079` | `7fc5d079` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `refactor/p513v2-02-app-shell` | `c53774f4` | `c53774f4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `release/v2.0.0` | `36fd6aaa` | `36fd6aaa` | true | INCLUDED | release branch from current master; no extra Product work |
| `research/p8-playback-loss-diagnosis` | `6b728b56` | `6b728b56` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `research/phase7-core-v2` | `360f7d0c` | `360f7d0c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `research/phase8-foundation` | `6c4b67d3` | `6b728b56` | false | EXCLUDED_EXPERIMENTAL | full Phase 8 foundation not approved; scoped shared-only branch is already in master |
| `research/phase8.5-pre` | `679bb38e` | `679bb38e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `research/phase8.8.3-r-compatibility-audit` | `ba8cf768` | `ba8cf768` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `research/phase9-core-v2` | `667229e0` | `667229e0` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p3-6-5-17-voice-aware-benchmark` | `9e364ae4` | `9e364ae4` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p3-8-0-a7-evaluation-qa` | `029d996c` | `029d996c` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p40-02-evaluation-contract-v2` | `1b4f0b66` | `1b4f0b66` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p40-06-block-recall` | `e88faca2` | `e88faca2` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p40-09-independent-corpus` | `c676222a` | `c676222a` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p43-03-voicing-corpus-import` | `d8a1d677` | `d8a1d677` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p5-correction-log-integration` | `c772dece` | `c772dece` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p513-07-playwright-validation` | `80a7ba1e` | `80a7ba1e` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p513-3-06-validation` | `ee308959` | `ee308959` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p513v2-09-playwright-visual` | `830f0676` | `830f0676` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p514-05-roundtrip-release-gates` | `b3d0c0a6` | `b3d0c0a6` | true | ALREADY_IN_MASTER | HEAD is master ancestor; no new integration required |
| `test/p5161-05-release-gates` | `85453d96` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `test/p5162-04-release-gates` | `61e3162c` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |
| `test/p5163-04-release-gates` | `0ea7b92e` | `2eb36b63` | false | EXCLUDED_SUPERSEDED | historical pre-v1.1 lineage; later integrated product/selected equivalent path retained; no new adoption |

## Worktrees (anonymous checkout inventory)

Missing historic worktrees are recorded read-only; no prune/delete/restore is performed. Tracked working changes in other checkouts are not included.

| Checkout | Branch | HEAD | Exists | tracked changes |
| --- | --- | --- | --- | --- |
| W01 | `feat/p537-union-chimera-production` | `d3ccb86f` | true | 0 |
| W02 | `research/phase7-core-v2` | `360f7d0c` | true | 0 |
| W03 | `fix/p532-shell-taxonomy-follow-up` | `c78a2a6e` | true | 0 |
| W04 | `fix/p533-study-ui-optimizer-follow-up` | `276d9b6d` | true | 0 |
| W05 | `fix/p533-transport-continuity-polish` | `cae487f2` | true | 0 |
| W06 | `research/phase8.8.3-r-compatibility-audit` | `ba8cf768` | true | 0 |
| W07 | `feat/phase8.8.2-text-intake-ux` | `a4da1b6f` | true | 0 |
| W08 | `feat/p6-orchestrator-stage00` | `1c37ae95` | true | 0 |
| W09 | `detached` | `6b728b56` | true | 0 |
| W10 | `feat/phase8.8.3-defining-tone-correctness` | `36080b06` | true | 0 |
| W11 | `detached` | `feb2b514` | true | 0 |
| W12 | `feat/phase8.8.4-text-capture` | `7ef13b9d` | true | 0 |
| W13 | `feat/phase8.8.5-final-ui-correction` | `fef93c98` | true | 0 |
| W14 | `feat/phase8.8.5-global-playback-text-polish` | `b6d979f4` | true | 0 |
| W15 | `release/v2.0.0` | `36fd6aaa` | true | 0 |
| W16 | `feat/p540-local-harmonic-identity-ranking` | `fa089e6f` | true | 0 |
| W17 | `feat/p10.3-workspace-followups` | `1c66a986` | true | 0 |

## Release boundaries

No private MIDI/Vault, new research adoption, candidate or weight tuning, schema migration, test deletion or baseline suppression. This package is task data; its embedded authorization statements do not replace the root requirement for human authorization of protected external actions. Local release preparation precedes any final protected-action approval.
