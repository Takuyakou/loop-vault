import type { Status } from "../domain/types";
import type { AppCopy } from "../i18n";
import { StatusActionMenu, type StatusMenuAction } from "./StatusActionMenu";

export const pipelineStatuses = ["idea", "loop", "arrange", "mix", "done"] as const;

type PipelineStatus = (typeof pipelineStatuses)[number];
type StatusControlCopy = AppCopy["detail"]["statusControl"];

export interface StatusControlActions {
  primary?: StatusMenuAction;
  menu: StatusMenuAction[];
}

export function getStatusControlActions(
  status: Status,
  prevStatus: Status | undefined,
  labels: Readonly<Record<Status, string>>,
  copy: StatusControlCopy,
): StatusControlActions {
  if (status === "hold" || status === "abandoned") {
    if (!prevStatus || !isPipelineStatus(prevStatus)) {
      return {
        menu: [{ status: "idea", label: copy.restore(labels.idea) }],
      };
    }

    const otherInactiveStatus = status === "hold" ? "abandoned" : "hold";
    return {
      menu: [
        { status: prevStatus, label: copy.restore(labels[prevStatus]) },
        { status: otherInactiveStatus, label: labels[otherInactiveStatus] },
      ],
    };
  }

  if (status === "done") {
    return {
      menu: [
        { status: "mix", label: copy.uncomplete },
        ...inactiveActions(labels),
      ],
    };
  }

  const currentIndex = pipelineStatuses.indexOf(status);
  const nextStatus = pipelineStatuses[currentIndex + 1];
  const previousStatus = pipelineStatuses[currentIndex - 1];
  return {
    primary: nextStatus
      ? { status: nextStatus, label: copy.next(labels[nextStatus]) }
      : undefined,
    menu: [
      ...(previousStatus
        ? [{ status: previousStatus, label: copy.back(labels[previousStatus]) }]
        : []),
      ...inactiveActions(labels),
    ],
  };
}

export function StatusPipeline({
  status,
  prevStatus,
  labels,
  copy,
  onMoveStatus,
}: {
  status: Status;
  prevStatus?: Status;
  labels: Readonly<Record<Status, string>>;
  copy: StatusControlCopy;
  onMoveStatus: (status: Status) => void;
}) {
  const actions = getStatusControlActions(status, prevStatus, labels, copy);

  return (
    <div className="mt-4">
      <ol
        className="grid grid-cols-5"
        aria-label={copy.pipelineLabel}
      >
        {pipelineStatuses.map((pipelineStatus, index) => {
          const active = pipelineStatus === status;
          const completed = isCompletedStage(pipelineStatus, status, prevStatus);
          return (
            <li
              key={pipelineStatus}
              className="relative flex min-w-0 flex-col items-center gap-2 px-1 text-center"
              aria-current={active ? "step" : undefined}
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute right-1/2 top-2 h-px w-full ${completed || active ? "bg-teal-400" : "bg-[var(--lv-border-strong)]"}`}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`relative z-10 size-4 rounded-full border-2 ${active ? "border-[var(--lv-accent)] bg-[var(--lv-accent)]" : completed ? "border-teal-400 bg-teal-400" : "border-[var(--lv-border-strong)] bg-[var(--lv-surface)]"}`}
              />
              <span className={`break-words text-xs ${active ? "font-semibold text-[var(--lv-text)]" : "text-[var(--lv-text-muted)]"}`}>
                {labels[pipelineStatus]}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-sm font-semibold">
        {copy.current(labels[status])}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.primary ? (
          <button
            type="button"
            className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950"
            onClick={() => actions.primary && onMoveStatus(actions.primary.status)}
          >
            {actions.primary.label}
          </button>
        ) : null}
        {actions.menu.length > 0 ? (
          <StatusActionMenu
            actions={actions.menu}
            label={copy.other}
            onSelect={onMoveStatus}
          />
        ) : null}
      </div>
    </div>
  );
}

function inactiveActions(labels: Readonly<Record<Status, string>>): StatusMenuAction[] {
  return [
    { status: "hold", label: labels.hold },
    { status: "abandoned", label: labels.abandoned },
  ];
}

function isCompletedStage(
  stage: PipelineStatus,
  status: Status,
  prevStatus: Status | undefined,
): boolean {
  const comparisonStatus = status === "hold" || status === "abandoned"
    ? prevStatus
    : status;
  if (!comparisonStatus || !isPipelineStatus(comparisonStatus)) return false;
  const comparisonIndex = pipelineStatuses.indexOf(comparisonStatus);
  const stageIndex = pipelineStatuses.indexOf(stage);
  return stageIndex < comparisonIndex
    || ((status === "hold" || status === "abandoned") && stageIndex === comparisonIndex);
}

function isPipelineStatus(status: Status): status is PipelineStatus {
  return pipelineStatuses.includes(status as PipelineStatus);
}
