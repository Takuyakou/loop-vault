import type { SongIdea, Status, StatusHistoryEntry } from "./types";

const pipelineStatuses = ["idea", "loop", "arrange", "mix", "done"] as const;
const inactiveStatuses = ["hold", "abandoned"] as const;

type PipelineStatus = (typeof pipelineStatuses)[number];
type InactiveStatus = (typeof inactiveStatuses)[number];

export type TransitionErrorCode =
  | "already-in-status"
  | "invalid-jump"
  | "missing-restore-target"
  | "invalid-restore-target"
  | "reason-too-long";

export interface TransitionOptions {
  reason?: string;
}

export type TransitionResult =
  | { ok: true; idea: SongIdea }
  | {
      ok: false;
      error: {
        code: TransitionErrorCode;
        message: string;
      };
    };

export function transition(
  idea: SongIdea,
  to: Status,
  now: Date,
  options: TransitionOptions = {},
): TransitionResult {
  if (idea.status === to) {
    return transitionError(
      "already-in-status",
      `"${idea.title}" is already ${to}.`,
    );
  }

  if (!canTransition(idea, to)) {
    if (isInactiveStatus(idea.status) && !idea.prevStatus) {
      return transitionError(
        "missing-restore-target",
        `"${idea.title}" cannot restore without prevStatus.`,
      );
    }

    if (isInactiveStatus(idea.status) && idea.prevStatus !== to) {
      return transitionError(
        "invalid-restore-target",
        `${idea.status} ideas can only restore to prevStatus.`,
      );
    }

    return transitionError(
      "invalid-jump",
      `Invalid status transition: ${idea.status} -> ${to}.`,
    );
  }

  const at = now.toISOString();
  const reason = isInactiveStatus(to) ? options.reason?.trim() : undefined;
  if (reason && reason.length > 500) {
    return transitionError(
      "reason-too-long",
      "Status reason must be 500 characters or fewer.",
    );
  }

  const completedAt =
    to === "done" ? (idea.completedAt ?? at) : idea.completedAt;
  const historyEntry: StatusHistoryEntry = {
    status: to,
    at,
    ...(reason ? { reason } : {}),
  };

  return {
    ok: true,
    idea: stripUndefined({
      ...idea,
      status: to,
      prevStatus: nextPrevStatus(idea, to),
      completedAt,
      updatedAt: at,
      statusHistory: [...idea.statusHistory, historyEntry],
    }),
  };
}

function canTransition(idea: SongIdea, to: Status): boolean {
  if (isInactiveStatus(to)) {
    return true;
  }

  if (isInactiveStatus(idea.status)) {
    return idea.prevStatus === to;
  }

  return isAdjacentPipelineMove(idea.status, to);
}

function isAdjacentPipelineMove(from: Status, to: Status): boolean {
  if (!isPipelineStatus(from) || !isPipelineStatus(to)) {
    return false;
  }

  return Math.abs(pipelineStatuses.indexOf(from) - pipelineStatuses.indexOf(to)) === 1;
}

function nextPrevStatus(idea: SongIdea, to: Status): Status | undefined {
  if (!isInactiveStatus(to)) {
    return undefined;
  }

  if (isInactiveStatus(idea.status)) {
    return idea.prevStatus;
  }

  return idea.status;
}

function isPipelineStatus(status: Status): status is PipelineStatus {
  return pipelineStatuses.includes(status as PipelineStatus);
}

function isInactiveStatus(status: Status): status is InactiveStatus {
  return inactiveStatuses.includes(status as InactiveStatus);
}

function transitionError(
  code: TransitionErrorCode,
  message: string,
): TransitionResult {
  return { ok: false, error: { code, message } };
}

function stripUndefined(idea: SongIdea): SongIdea {
  return Object.fromEntries(
    Object.entries(idea).filter(([, value]) => value !== undefined),
  ) as unknown as SongIdea;
}
