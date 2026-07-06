import type { SongIdea, Status } from "./types";

const activeStatuses = ["idea", "loop", "arrange", "mix"] as const;
type ActiveStatus = (typeof activeStatuses)[number];
type ActiveSongIdea = SongIdea & { status: ActiveStatus };

const statusWeights: Record<ActiveStatus, number> = {
  idea: 1,
  loop: 2,
  arrange: 3,
  mix: 4,
};

const dayMs = 24 * 60 * 60 * 1000;
const staleWarningMs = 7 * dayMs;
const holdSuggestionMs = 14 * dayMs;

export interface FocusCandidate {
  idea: SongIdea;
  statusWeight: number;
  idleMs: number;
  idleDays: number;
}

export interface StaleIdea {
  idea: SongIdea;
  idleDays: number;
  suggestHold: boolean;
}

export interface PickFocusResult {
  focus?: SongIdea;
  candidates: FocusCandidate[];
  needsNextAction: SongIdea[];
  stale: StaleIdea[];
}

export function pickFocus(ideas: SongIdea[], now: Date): PickFocusResult {
  const activeIdeas = ideas.filter(isActiveIdea);
  const needsNextAction = activeIdeas.filter((idea) =>
    isNextActionEmpty(idea.nextAction.text),
  );
  const candidates = activeIdeas
    .filter((idea) => !isNextActionEmpty(idea.nextAction.text))
    .map((idea) => toFocusCandidate(idea, now))
    .sort(compareFocusCandidates);

  return {
    focus: candidates[0]?.idea,
    candidates,
    needsNextAction,
    stale: activeIdeas
      .filter((idea) => idleMs(idea, now) > staleWarningMs)
      .map((idea) => ({
        idea,
        idleDays: Math.floor(idleMs(idea, now) / dayMs),
        suggestHold: idleMs(idea, now) > holdSuggestionMs,
      }))
      .sort((a, b) => b.idleDays - a.idleDays),
  };
}

function toFocusCandidate(idea: ActiveSongIdea, now: Date): FocusCandidate {
  const elapsed = idleMs(idea, now);

  return {
    idea,
    statusWeight: statusWeights[idea.status],
    idleMs: elapsed,
    idleDays: Math.floor(elapsed / dayMs),
  };
}

function compareFocusCandidates(a: FocusCandidate, b: FocusCandidate): number {
  if (a.statusWeight !== b.statusWeight) {
    return b.statusWeight - a.statusWeight;
  }

  if (a.idleMs !== b.idleMs) {
    return b.idleMs - a.idleMs;
  }

  return a.idea.title.localeCompare(b.idea.title);
}

function isActiveIdea(idea: SongIdea): idea is ActiveSongIdea {
  return isActiveStatus(idea.status);
}

function isActiveStatus(status: Status): status is ActiveStatus {
  return (activeStatuses as readonly Status[]).includes(status);
}

function isNextActionEmpty(text: string): boolean {
  return text.trim().length === 0;
}

function idleMs(idea: SongIdea, now: Date): number {
  return Math.max(0, now.getTime() - new Date(idea.updatedAt).getTime());
}
