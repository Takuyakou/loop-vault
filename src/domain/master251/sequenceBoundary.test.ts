import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyGenericMasterFingerings } from '../../../scripts/master251/verifyFingerings';
import { regenerateMasterFingerings } from '../../../scripts/master251/regenerateFingerings';
import { TARGETS, cellKey, type MasterTarget } from './model';
import data from './canonical-fingering.json' with { type: 'json' };
import * as adapter from '../../voicingPractice/rankPracticeFingerings';
import * as sequence from '../progressionFingering';
import { handPositionProxy } from '../handPositionFingering';
import { E_RANKER_POLICY } from '../eRankerFingering';
import type {
  ProgressionFingeringEvent, SupportedCandidates, FingeringRankingOptions,
} from '../progressionFingering';

const ac = TARGETS.filter(target => target.form === 'A' || target.form === 'C');
const evidence: unknown[] = [];
const inputHash = createHash('sha256').update(JSON.stringify(TARGETS)).digest('hex');

interface EventTrace {
  id: string;
  pitches: readonly number[];
  candidateFingers: readonly (readonly number[])[];
  generationLocalCosts: readonly number[];
  handPositions: readonly number[];
  visitedIndexes: Set<number>;
  solverLocalCosts: Map<number, number>;
}
interface SolveTrace {
  events: readonly ProgressionFingeringEvent[];
  loopDurationSeconds?: number;
  cyclic?: boolean;
  anchors: number;
  groups: Map<SupportedCandidates, EventTrace>;
  transitions: Map<string, {
    from: string; to: string; seconds: number; fromPositions: readonly number[];
    toPositions: readonly number[];
  }>;
  output: ReturnType<typeof sequence.rankCyclicFingerings>;
}

function observeSequence(forceL5 = false) {
  const calls: SolveTrace[] = [];
  const solve = sequence.rankCyclicFingerings;
  vi.spyOn(sequence, 'rankCyclicFingerings').mockImplementation((events, options = {}) => {
    if (!options.costModel) throw new Error('Missing production E1-T cost model');
    const model = options.costModel;
    if (forceL5 && events[0]?.hand === 'left') options = {
      ...options, anchors: new Map(events.map(event => [
        event.id, { signature: sequence.physicalVoicingSignature('left', event.midiPitches)!, fingers: [5] as const },
      ])),
    };
    const trace: SolveTrace = {
      events, loopDurationSeconds: options.loopDurationSeconds,
      cyclic: options.cyclic, anchors: options.anchors?.size ?? 0,
      groups: new Map(), transitions: new Map(), output: [],
    };
    const monitored: FingeringRankingOptions = {
      ...options,
      costModel: {
        local: (event, group, index) => {
          let row = trace.groups.get(group);
          if (!row) {
            row = {
              id: event.id, pitches: group.pitches,
              candidateFingers: group.candidates.map(candidate => candidate.fingers),
              generationLocalCosts: group.candidates.map(candidate => candidate.localCost),
              handPositions: group.candidates.map(candidate =>
                handPositionProxy(event.hand, group.pitches, candidate.fingers)),
              visitedIndexes: new Set(), solverLocalCosts: new Map(),
            };
            trace.groups.set(group, row);
          }
          row.visitedIndexes.add(index);
          const cost = model.local(event, group, index);
          row.solverLocalCosts.set(index, cost);
          return cost;
        },
        transition: (previous, i, current, j, seconds) => {
          const from = trace.groups.get(previous), to = trace.groups.get(current);
          if (!from || !to) throw new Error('Transition lost its candidate group');
          const key = from.id + '>' + to.id + '@' + seconds;
          trace.transitions.set(key, {
            from: from.id, to: to.id, seconds,
            fromPositions: from.handPositions, toPositions: to.handPositions,
          });
          return model.transition(previous, i, current, j, seconds);
        },
      },
    };
    // Real solver and both real cost-model callbacks execute without substituting results.
    trace.output = solve(events, monitored);
    calls.push(trace);
    return trace.output;
  });
  return calls;
}

function assertWholeProgression(calls: readonly SolveTrace[]) {
  if (calls.length !== 2 || calls.some(call => call.events.length !== 3))
    throw new Error('sequence boundary must receive one three-event solve per hand');
  expect(calls.map(call => call.events[0].hand)).toEqual(['left', 'right']);
}

function assertCandidateExploration(calls: readonly SolveTrace[]) {
  for (const call of calls.filter(row => row.events[0]?.hand === 'left')) {
    if (call.groups.size !== 3 || [...call.groups.values()].some(group => group.visitedIndexes.size !== 5))
      throw new Error('all five left single-note candidates must reach real cost evaluation');
  }
}

function assertContext(target: MasterTarget, calls: readonly SolveTrace[]) {
  assertWholeProgression(calls);
  assertCandidateExploration(calls);
  const cell = cellKey(target.form, target.key);
  for (const call of calls) {
    const hand = call.events[0].hand;
    expect(call.events.map(event => event.id)).toEqual([0, 1, 2].map(i => cell + ':' + i));
    expect(call.events.map(event => event.midiPitches)).toEqual(
      target.chords.map(chord => chord.referenceHands[hand === 'left' ? 'lh' : 'rh']),
    );
    expect(call.events.map(event => ({
      start: event.startSeconds, duration: event.durationSeconds,
      unresolved: event.unresolved, family: event.family,
    }))).toEqual([0, 1.5, 3].map(start => ({
      start, duration: 1.5, unresolved: false, family: 'custom',
    })));
    expect(call.events.map(event => event.chord?.root)).toEqual(
      [(target.key + 2) % 12, (target.key + 7) % 12, target.key],
    );
    expect(call.loopDurationSeconds).toBe(6);
    expect(call.cyclic).toBe(true);
    expect(call.anchors).toBe(0);
    expect([...call.transitions.values()].map(edge => [
      edge.from, edge.to, edge.seconds,
    ]).sort()).toEqual([
      [cell + ':0', cell + ':1', 1.5],
      [cell + ':1', cell + ':2', 1.5],
      [cell + ':2', cell + ':0', 3],
    ].sort());
    if (hand === 'left') {
      expect(call.groups.size).toBe(3);
      for (const group of call.groups.values()) {
        expect(group.pitches).toHaveLength(1);
        expect(group.candidateFingers.map(fingers => fingers[0]).sort()).toEqual([1, 2, 3, 4, 5]);
        expect(group.visitedIndexes.size).toBe(5);
        expect(new Set(group.handPositions).size).toBe(5);
        // [5] is the preferred local rule, not a candidate filter or a forced answer.
        expect(group.candidateFingers[0]).toEqual([5]);
        expect(group.generationLocalCosts).toEqual([0, 10, 20, 30, 40]);
        expect([...group.solverLocalCosts.values()].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8]);
      }
    }
  }
}

afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  const output = process.env.MASTER_SEQUENCE_EVIDENCE;
  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({
      policy: E_RANKER_POLICY, targetsHash: inputHash,
      auditedCells: ac.length, productionSequenceCallThrough: true,
      rows: evidence,
    }, null, 2) + '\n');
  }
});

it.each(ac.map(target => [cellKey(target.form, target.key), target] as const))(
  '%s passes the actual three-event Master progression through the shared adapter and solver',
  (cell, target) => {
    const calls = observeSequence();
    const adapterSpy = vi.spyOn(adapter, 'rankPracticeHandFingerings');
    const regenerated = regenerateMasterFingerings([target]);
    expect(adapterSpy).toHaveBeenCalledTimes(2);
    for (const invocation of adapterSpy.mock.calls) {
      const [snapshot, hands, selection, hand, preferences, , unresolved, bpm] = invocation;
      expect(snapshot?.events).toHaveLength(3);
      expect(snapshot?.lengthBeats).toBe(8);
      expect(snapshot?.events.map(event => [event.startBeat, event.durationBeats])).toEqual([[0, 2], [2, 2], [4, 2]]);
      expect(hands.map(h => h[hand])).toEqual(target.chords.map(c => c.referenceHands[hand === 'left' ? 'lh' : 'rh']));
      expect(selection).toBe('custom'); expect(preferences).toBeUndefined();
      expect(unresolved).toEqual([false, false, false]); expect(bpm).toBe(80);
    }
    assertContext(target, calls);
    const row = data.cells.find(row => row.cell === cell)!;
    expect(regenerated[0]).toEqual({ ...row, chords: row.chords.map(chord => ({
      ...chord, fingers: { ...chord.fingers, lh: [5] },
    })) });
    evidence.push({
      cell, adapterCalls: 2, sequenceLengths: calls.map(call => call.events.length),
      left: {
        events: calls[0].events,
        loopDurationSeconds: calls[0].loopDurationSeconds,
        cyclic: calls[0].cyclic, anchors: calls[0].anchors,
        candidates: [...calls[0].groups.values()].map(group => ({
          ...group, visitedIndexes: [...group.visitedIndexes],
          solverLocalCosts: [...group.solverLocalCosts],
        })),
        transitions: [...calls[0].transitions.values()],
        output: calls[0].output,
      },
    });
  },
);

it('reproduces the historical all48 generic output while Master both hands follow separate pedagogy', () => {
  const calls = observeSequence();
  const generic = verifyGenericMasterFingerings();
  expect(generic.fingerprint).toBe('a1538e67764619d5b3f7d8244636ad328fc1b2f9c1c20950c73a6db4c0a81883');
  expect(calls).toHaveLength(96);
  expect(calls.every(call => call.events.length === 3)).toBe(true);
  expect(createHash('sha256').update(JSON.stringify(TARGETS)).digest('hex')).toBe(inputHash);
  expect(E_RANKER_POLICY).toEqual({ variant: 'E1-T', curve: 'inverse', lambda: 2, gamma: 1 });
});

it('the same boundary assertion rejects a test-only per-event adapter mutant even when final left fingers match', () => {
  const target = ac.find(row => row.form === 'A' && row.key === 0)!;
  const calls = observeSequence(), realAdapter = adapter.rankPracticeHandFingerings;
  vi.spyOn(adapter, 'rankPracticeHandFingerings').mockImplementation(
    (snapshot, hands, selection, hand, preferences, options, unresolved, bpm) => {
      if (!snapshot) return [];
      return snapshot.events.flatMap((event, index) => realAdapter(
        { ...snapshot, events: [event] }, [hands[index]], selection, hand,
        preferences, options, [unresolved?.[index] ?? false], bpm,
      ));
    },
  );
  const mutant = regenerateMasterFingerings([target]);
  expect(calls.map(call => call.events.length)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(mutant[0].chords.map(chord => chord.fingers.lh)).toEqual(
    [[5], [5], [5]],
  );
  expect(() => assertWholeProgression(calls)).toThrow(
    'sequence boundary must receive one three-event solve per hand',
  );
  evidence.push({ negativeControl: 'test-only split adapter', sequenceLengths: calls.map(call => call.events.length), sameFinalLeftFingers: true, detected: true });
});

it('detects test-only L5 pinning at real cost evaluation even when output remains unchanged', () => {
  const target = ac.find(row => row.form === 'A' && row.key === 0)!;
  const calls = observeSequence(true);
  const pinned = regenerateMasterFingerings([target]);
  assertWholeProgression(calls);
  expect(calls[0].groups.size).toBe(3);
  expect([...calls[0].groups.values()].every(group =>
    group.candidateFingers.length === 5 && group.visitedIndexes.size === 1)).toBe(true);
  expect(pinned[0].chords.map(chord => chord.fingers.lh)).toEqual([[5], [5], [5]]);
  expect(() => assertCandidateExploration(calls)).toThrow(
    'all five left single-note candidates must reach real cost evaluation',
  );
  evidence.push({ negativeControl: 'test-only L5 anchors', candidatesGenerated: 5, candidatesEvaluated: 1, detected: true });
});

it('detects a test-only adapter bypass that picks preferred local candidates without sequence solving', () => {
  const target = ac.find(row => row.form === 'A' && row.key === 0)!;
  const calls = observeSequence();
  vi.spyOn(adapter, 'rankPracticeHandFingerings').mockImplementation((snapshot, hands, selection, hand) =>
    snapshot?.events.map((event, index) => {
      const group = sequence.generateFingeringCandidates({ hand, family: selection, chord: event.chord, midiPitches: hands[index][hand] });
      if (group.status !== 'supported') return { id: event.id, status: 'unavailable' };
      return { id: event.id, status: 'supported', signature: group.signature, pitches: group.pitches, fingers: group.candidates[0].fingers };
    }) ?? [],
  );
  const bypassed = regenerateMasterFingerings([target]);
  expect(bypassed[0].chords.map(chord => chord.fingers.lh)).toEqual([[5], [5], [5]]);
  expect(calls).toHaveLength(0);
  expect(() => assertWholeProgression(calls)).toThrow(
    'sequence boundary must receive one three-event solve per hand',
  );
  evidence.push({ negativeControl: 'test-only adapter bypass', sequenceCalls: 0, detected: true });
});
