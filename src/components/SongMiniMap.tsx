import type { ProgressionBlockCandidate } from "../domain/types";

export interface SongMiniMapCopy {
  title: string;
  description: string;
  empty: string;
  candidateLabel: (index: number, startBar: number, endBar: number) => string;
}

export interface SongMiniMapProps {
  totalBars: number;
  candidates: readonly ProgressionBlockCandidate[];
  activeCandidateId?: string;
  copy: SongMiniMapCopy;
  onCandidateSelect: (candidateId: string) => void;
}

interface PositionedCandidate {
  candidate: ProgressionBlockCandidate;
  candidateIndex: number;
  lane: number;
  left: number;
  width: number;
}

export function layoutSongMiniMapCandidates(
  candidates: readonly ProgressionBlockCandidate[],
  totalBars: number,
): PositionedCandidate[] {
  if (totalBars <= 0) return [];

  const laneEnds: number[] = [];
  return candidates
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .sort((left, right) => (
      left.candidate.startBar - right.candidate.startBar
      || left.candidate.endBar - right.candidate.endBar
      || left.candidateIndex - right.candidateIndex
    ))
    .map(({ candidate, candidateIndex }) => {
      const startBar = Math.min(totalBars, Math.max(1, candidate.startBar));
      const endBar = Math.min(totalBars, Math.max(startBar, candidate.endBar));
      let lane = laneEnds.findIndex((lastEnd) => startBar > lastEnd);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = endBar;

      return {
        candidate,
        candidateIndex,
        lane,
        left: ((startBar - 1) / totalBars) * 100,
        width: ((endBar - startBar + 1) / totalBars) * 100,
      };
    });
}

export function SongMiniMap({
  totalBars,
  candidates,
  activeCandidateId,
  copy,
  onCandidateSelect,
}: SongMiniMapProps) {
  const positionedCandidates = layoutSongMiniMapCandidates(candidates, totalBars);
  const laneCount = positionedCandidates.length > 0
    ? Math.max(...positionedCandidates.map(({ lane }) => lane)) + 1
    : 1;

  return (
    <section
      data-song-minimap
      className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5"
      aria-labelledby="song-minimap-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="song-minimap-title" className="text-lg font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{copy.description}</p>
        </div>
        <span className="text-xs text-[var(--lv-text-muted)]">1-{Math.max(0, totalBars)}</span>
      </div>

      {positionedCandidates.length > 0 ? (
        <div
          className="relative mt-4 overflow-hidden border border-[var(--lv-border)] bg-[var(--lv-surface)]"
          style={{ height: `${laneCount * 2 + 0.5}rem` }}
          data-song-minimap-track
        >
          <div aria-hidden="true" className="absolute inset-0 grid grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className={index === 0 ? "" : "border-l border-[var(--lv-border)]/70"} />
            ))}
          </div>
          {positionedCandidates.map(({ candidate, candidateIndex, lane, left, width }) => {
            const label = copy.candidateLabel(candidateIndex + 1, candidate.startBar, candidate.endBar);
            const isActive = candidate.id === activeCandidateId;
            return (
              <button
                key={candidate.id}
                type="button"
                data-song-minimap-candidate={candidate.id}
                data-song-minimap-lane={lane}
                aria-label={label}
                aria-pressed={isActive}
                title={label}
                className={`absolute grid h-7 min-w-7 place-items-center overflow-hidden border px-1 text-xs font-semibold transition focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-accent)] ${
                  isActive
                    ? "z-10 border-teal-100 bg-teal-200 text-stone-950 shadow-[0_0_0_2px_rgba(94,234,212,0.3)]"
                    : "border-teal-300/80 bg-teal-400/35 text-teal-50 hover:bg-teal-300/55"
                }`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  top: `${lane * 2 + 0.25}rem`,
                }}
                onClick={() => onCandidateSelect(candidate.id)}
              >
                {candidateIndex + 1}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--lv-text-muted)]">{copy.empty}</p>
      )}
    </section>
  );
}
