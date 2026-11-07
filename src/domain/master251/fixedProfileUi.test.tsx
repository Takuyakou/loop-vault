// @vitest-environment jsdom
import { expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as sequence from '../progressionFingering';
import * as adapter from '../../voicingPractice/rankPracticeFingerings';
import * as canonical from './canonicalFingerings';
import { TARGETS, cellKey, emptyMaster } from './model';
import { targetForMasterRange } from './register';
import { LEARNING_KEYS } from './scheduler';
import { dojoStore } from '../chordDojo/runtime';
import { emptyStore } from '../chordDojo/store';
import data from './canonical-fingering.json' with { type: 'json' };

// Only hardware/provider hooks are replaced. The real View, engine, target layer,
// fixed-profile reader, score snapshot and keyboard rendering all execute.
vi.mock('../../components/MetronomeProvider', () => ({
  useMetronome: () => ({ enabled: false }),
}));
vi.mock('../../components/PreviewSoundProvider', () => ({
  usePreviewSound: () => ({ sound: 'piano' }),
}));
vi.mock('../../views/chord-dojo/useDojoMidi', () => ({
  useDojoMidi: () => ({
    view: { kind: 'connected', label: 'synthetic', connected: true, busy: false },
    connected: true, inputState: 'connected', connectionKey: 'synthetic',
    audioState: 'ready', prepareAudio: () => {}, resetAudio: () => {}, retryAudio: () => {},
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  dojoStore.setState({ file: emptyStore(), ready: false });
});

it('real Master View consumes all48 Form fixed profiles in both registers without adapter/solver calls', async () => {
  // SSR reads getInitialState rather than the changed client state. Seed that
  // storage snapshot only; the production hook and View remain real.
  vi.spyOn(dojoStore, 'getInitialState').mockImplementation(() => dojoStore.getState());
  const solveSpy = vi.spyOn(sequence, 'rankCyclicFingerings');
  const adapterSpy = vi.spyOn(adapter, 'rankPracticeHandFingerings');
  const fixedSpy = vi.spyOn(canonical, 'master251CanonicalFingerings');
  const { Master251View } = await import('../../views/chord-dojo/Master251View');
  // Separate the module's all144 fixed display-envelope construction from View calls.
  fixedSpy.mockClear();
  let rendered = 0;
  for (const target of TARGETS) {
    const cell = cellKey(target.form, target.key);
    for (const range of ['original', 'octave-down'] as const) {
      const progress = emptyMaster();
      for (const key of LEARNING_KEYS.slice(0, LEARNING_KEYS.indexOf(target.key))) {
        progress.cells[cellKey(target.form, key)].recent = [{
          at: '2026-10-01T00:00:00.000Z', ok: true, usedHint: false, recallSec: 1,
        }];
      }
      progress.practice = {
        version: 1, kind: 'learning', form: target.form,
        learningPositions: { A: 0, B: 0, C: 0, D: 0, [target.form]: LEARNING_KEYS.indexOf(target.key) },
      };
      progress.session = { cell, seed: 1, paused: false, mode: 'learn' };
      const master = range === 'original'
        ? { ...progress, selectedRange: range }
        : { ...emptyMaster(), selectedRange: range, octaveDown: progress };
      dojoStore.setState({ file: { ...emptyStore(), master251: master }, ready: true });
      const before = fixedSpy.mock.calls.length;
      const html = renderToStaticMarkup(<Master251View onExit={() => {}} />);
      expect(fixedSpy.mock.calls.length).toBe(before + 1);
      expect(fixedSpy.mock.calls[before][0]).toBe(targetForMasterRange(cell, range));
      const result = fixedSpy.mock.results[before];
      expect(result.type).toBe('return');
      const offset = range === 'original' ? 0 : -12;
      const row = data.cells.find(c => c.cell === cell)!;
      for (let i = 0; i < 3; i++) {
        for (const [hand, prefix] of [['lh', 'L'], ['rh', 'R']] as const) {
          row.chords[i].referenceHands[hand].forEach((note, index) => {
            expect(result.value[i].labels.get(note + offset)).toBe(prefix + row.chords[i].fingers[hand][index]);
          });
        }
      }
      expect(html).toContain('2-5-1 Master');
      expect(html).toContain('data-finger-label');
      const renderedView = document.createElement('div');
      renderedView.innerHTML = html;
      expect(renderedView.querySelector('[data-testid="master251"]')?.getAttribute('data-cell')).toBe(cell);
      expect(renderedView.querySelector('[data-testid="master251"]')?.getAttribute('data-range')).toBe(range);
      for (const [hand, prefix] of [['lh', '左'], ['rh', '右']] as const) {
        row.chords[0].referenceHands[hand].forEach((note, index) => {
          const label = renderedView.querySelector('[data-midi-note="' + (note + offset) + '"] [data-finger-label]');
          expect(label?.getAttribute('data-finger-label')).toBe(prefix + row.chords[0].fingers[hand][index]);
        });
      }
      rendered++;
    }
  }
  expect(rendered).toBe(96);
  expect(adapterSpy).not.toHaveBeenCalled();
  expect(solveSpy).not.toHaveBeenCalled();
});
