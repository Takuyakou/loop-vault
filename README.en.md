<div align="center">

# Loop Vault

**A music-production helper desktop app that analyzes chord progressions from MIDI, then lets you edit, preview, and practice them — all in one place.**

Built with Tauri v2 + React + TypeScript + Rust (developed and tested primarily on Windows).

[日本語](README.md) | **English**

![Loop Vault](docs/images/hero.png)

</div>

> **About this public repository**
> This repository does **not** include any MIDI files (for licensing reasons).
> You do not need any MIDI data to read the source, build the app, or run the unit tests.
> For reproducing the accuracy evaluation locally, see [`docs/local-data.md`](docs/local-data.md).

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [How Detection Accuracy Is Improved](#how-detection-accuracy-is-improved)
- [AI-Assisted Development Flow](#ai-assisted-development-flow)
- [Setup](#setup)
- [Direction](#direction)
- [License](#license)

---

## Overview

Loop Vault supports a full workflow around "understanding chord progressions from MIDI, then
organizing and practicing them as material" during DTM / songwriting.

- Import a MIDI file and it automatically analyzes the chord progression and shows it as a timeline.
- Rather than taking the analysis at face value, you can do **pre-analysis prep** (e.g. choosing which
  voices to analyze) and **post-analysis touch-ups** (range selection, chord correction, preview).
- Save loops and ideas you like into the "Vault" and manage them along with their production status.
- It also includes practice modes for chord progressions (degrees, rhythm, bass, …) and a feature to
  consult an LLM for development ideas.

The app's core (its default analysis mode) uses a stable version fixed through the evaluation process
described below.

## Features

Every item below corresponds to functionality that actually exists in the repository.

### MIDI import and chord-progression analysis (Capture)
- Automatically analyzes the chord progression from MIDI files (multiple files can be imported).
- Before analysis you can assign the role of each target voice (part) and adjust the analysis target
  on a Canvas-based piano roll, then run the analysis.
- Results are presented as **candidate blocks** such as 4 / 8 / 16 bars.

### Manual candidate creation and editing (Candidate Catalog / manual candidates)
- Beyond picking from the list (catalog) of automatically detected candidates, you can **select any
  range on the timeline to create a candidate**.
- You can edit candidate ranges and chord events (add / delete / replace / split / merge / move),
  with Undo / Redo support.

### Progression detail, preview, and export (Progression Detail)
- Review the chord progression on a timeline and edit each chord.
- **Voicing Memory** retains the original MIDI voicing and reflects it in preview and practice.
- Preview via [Tone.js](https://tonejs.github.io/).
- Export the analyzed / edited progression as MIDI and hand it off to a DAW via **native
  drag-and-drop** (implemented by the `midi_export` / `native_drag` commands on the Rust side).

### Idea / loop management (Vault)
- Save imported loops and ideas and manage them in a list alongside their production status
  (Idea / Loop / Arrange / Mix / Done).
- Supports organizing your work with things like Next Action and Focus to keep production moving.

### Practice modes (Practice / Bass Practice)
- Practice modes that use chord progressions as material (transposition, mixing, etc.).
- **Bass Practice** (added in P5.16) provides independent bass exercises such as Degree, Rhythm,
  and Bassline Echo. It uses FreePats sounds for the bass timbre.

### Progression Advisor (LLM)
- A feature to consult OpenAI's API for chord-progression development ideas.
- **The API key is never stored on the frontend.** The key entered in the app's settings is stored via
  Tauri (Rust) in the **OS keychain** (Windows Credential Manager, etc.)
  (implementation: [`src-tauri/src/llm/keychain.rs`](src-tauri/src/llm/keychain.rs)).

### Data storage, backup, and recovery
- In addition to saving / loading practice data, backup listing, restore, and quarantine are handled on
  the Rust side (`practice_storage`).

### Localization
- Supports switching between Japanese and English (`src/i18n.ts`).

## Screenshots

All of the following were captured with **synthetic dummy MIDI / dummy data** (how they were captured:
[`docs/images/README.md`](docs/images/README.md)).

| Capture (MIDI analysis) | Vault (management) |
| --- | --- |
| ![Capture](docs/images/capture.png) | ![Vault](docs/images/vault.png) |

| Progression Detail (detail / preview / export) | Bass Practice (Degree Echo) |
| --- | --- |
| ![Progression Detail](docs/images/progression-detail.png) | ![Bass Practice](docs/images/bass-practice.png) |

## Tech Stack

| Area | Technology |
| --- | --- |
| Desktop foundation | Tauri v2 (Rust backend + WebView frontend) |
| Frontend | React 18 / TypeScript |
| Build | Vite 7 |
| State management | Zustand 5 |
| Schema / validation | Zod 3 |
| Audio / MIDI playback | Tone.js 15 |
| Native features (Rust) | OS keychain integration (LLM key), practice-data persistence, MIDI export, native drag to DAW |
| Testing | Vitest |
| Lint | ESLint |

## Architecture

The frontend (React) and the Tauri (Rust) native commands are separated at a boundary. The core logic —
music theory, MIDI analysis, and so on — lives in `src/domain/` as pure functions independent of the UI,
and is verified with unit tests.

```
src/
├─ domain/           Music theory / MIDI analysis / chord-progression logic (UI-independent, tested)
│  ├─ midi/          MIDI analysis pipeline, candidate-block generation, manual candidate (Draft), etc.
│  ├─ harmony/       Harmony-related logic
│  ├─ practice*/     Practice / transposition / mixing
│  └─ progressionAdvisor/  Domain logic for the LLM advisor
├─ views/            Screens (Capture / Vault / Home / Practice / ProgressionDetail / History / Detail)
├─ features/
│  └─ bass-practice/ Bass practice feature (application / domain / infra / ui / assets)
├─ llm/              Bridge for LLM calls (via Tauri invoke)
└─ i18n.ts           Japanese / English

src-tauri/           Tauri (Rust) side
└─ src/
   ├─ llm/keychain.rs      Manages the OpenAI API key in the OS keychain
   ├─ practice_storage     Practice-data storage / backup / recovery
   └─ midi_export / native_drag  MIDI export and native drag to a DAW
```

The detailed MIDI-analysis spec is in
[`docs/current-midi-detection-spec.md`](docs/current-midi-detection-spec.md), and a technical handoff
covering the whole app is in
[`docs/current-app-technical-handoff.md`](docs/current-app-technical-handoff.md).

## How Detection Accuracy Is Improved

The policy is to never judge chord-detection accuracy by "it feels a bit better." In this repository,
changes to the detection logic are evaluated and recorded with the following process.

- **Fixing a baseline with a Gold corpus**
  A set of MIDI whose correct labels have been human-verified (the Gold corpus) is fixed as the
  evaluation baseline, and before/after are compared with the same metrics. The corpus itself is not
  published for licensing reasons ([`docs/local-data.md`](docs/local-data.md)).

- **Ablation**
  Each element of the detection is individually enabled / disabled to isolate and measure how much each
  contributes to accuracy (e.g. [`docs/phase3.6.1-ablation-report.md`](docs/phase3.6.1-ablation-report.md),
  script `scripts/ablate-midi-analysis.ts`).

- **Failure taxonomy**
  Missed cases are classified by "why they were missed" and used to prioritize countermeasures
  (script `scripts/analyze-midi-failures.ts`, and others).

- **Decision Lock and shadow evaluation**
  A new detection idea is first computed as a "shadow" that is not connected to the product, and
  evaluated against the Gold corpus with pre-registered thresholds. If the effect does not clear the
  bar, it is **not promoted to the product**, and that decision and its reasoning are kept as a record.
  The Stage F research followed this policy to evaluate several detectors and documented the results —
  **including the ones that were not promoted**
  ([`docs/stage-f/09-detector-research-report.md`](docs/stage-f/09-detector-research-report.md),
  [`docs/stage-f/08-stage-f-final-closeout.md`](docs/stage-f/08-stage-f-final-closeout.md),
  [`docs/stage-f/03-stage-f-decisions.md`](docs/stage-f/03-stage-f-decisions.md)).

By keeping a record of **not only adopted changes but also changes that were declined, with reasons**,
the same verification does not have to be repeated.

## AI-Assisted Development Flow

This project is developed in a ticket-driven way, with AI coding tools divided by role.

- **Spec / design**: Claude Code is used to fix each phase's (ticket's) goals, evaluation contract, and
  acceptance criteria up front, deciding the verification method before implementation.
- **Implementation**: Codex (a separate AI) implements against the fixed spec.
- **Ticket-driven**: Work is split into units of "phase number + stage" (e.g. P4.1.2-H4, P5.16), and
  each stage's plan, prompts, and handoff content are kept as documentation
  ([`docs/loop-vault-codex-plan.md`](docs/loop-vault-codex-plan.md),
  [`docs/loop-vault-codex-prompts.md`](docs/loop-vault-codex-prompts.md),
  [`docs/current-app-technical-handoff.md`](docs/current-app-technical-handoff.md)).

Under `docs/`, work reports, evaluation results, and decision records for each phase accumulate, so that
"on what grounds this implementation / this default was chosen" can be traced later.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (required to build Tauri)
- Tauri v2 runtime prerequisites (on Windows, WebView2 and Microsoft C++ Build Tools, etc.). See the
  [official Tauri prerequisites](https://tauri.app/start/prerequisites/) for details.

### Install dependencies

```bash
npm install
```

### Development

To start only the frontend in a browser:

```bash
npm run dev
```

To start as a desktop app (Tauri):

```bash
npm run tauri dev
```

### Build

Build the frontend:

```bash
npm run build
```

Build the distributable desktop app:

```bash
npm run tauri build
```

### Test / Lint

```bash
npm run test
```

```bash
npm run lint
```

> The unit tests do not depend on the MIDI evaluation corpus and can run on a clean clone. Only when
> running the accuracy-evaluation scripts (under `scripts/`) do you need to place MIDI following
> [`docs/local-data.md`](docs/local-data.md).

## Direction

Development continues on a per-phase basis. The direction centers on improving chord-detection accuracy
(the iteration based on the Gold corpus, ablation, and failure taxonomy described above) and expanding
the practice features. Concrete changes are recorded in the per-phase reports under `docs/`.

## License

**This repository is not open source.** The source code is published for **viewing and evaluation
only** (see [LICENSE](LICENSE)).

- Without the copyright holder's prior written permission, **commercial use, modification (derivative
  works), and redistribution are prohibited**.
- Beyond the above, essentially all use is not permitted (All Rights Reserved).
- Viewing and forking on GitHub (within GitHub's Terms of Service) does not grant any of the withheld rights.
- The FreePats ([electric-bass-YR](https://github.com/freepats/electric-bass-YR)) samples used for the
  bass timbre are provided under their CC0-1.0 (public-domain equivalent) license, and are bundled under
  `src/features/bass-practice/assets/freepats-bass-yr/` together with their license (`LICENSE.txt`).
- Data such as the MIDI evaluation corpus is not included in the repository.
