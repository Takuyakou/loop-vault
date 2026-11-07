import {describe,it,expect} from 'vitest';
import {masterKeyLabel,masterWrongFeedback} from './master251Feedback';
import {targetForCell} from '../../domain/master251/model';
import {Master251Engine} from '../../domain/master251/engine';

describe('Master display-only feedback',()=>{
 it('spells flat key labels without changing sharp labels',()=>{expect(['Db','Eb','Ab','Bb','F#'].map(masterKeyLabel)).toEqual(['D♭','E♭','A♭','B♭','F#']);});
 it('limits each sorted canonical G13 difference to three notes',()=>{const notes=targetForCell('A:0').chords[1].notes;expect(masterWrongFeedback(notes,notes.map(n=>n+1).reverse(),'余分な音があります（5音）')).toBe('✗ 余分：A♭4 · G♭5 · B♭5 ほか2音 ／ 足りない：G4 · F5 · A5 ほか2音');});
 it('omits empty sides and keeps scientific octaves',()=>{expect(masterWrongFeedback([60,64,67],[60,64,67,70],'')).toBe('✗ 余分：B♭4');expect(masterWrongFeedback([60,64,67],[60,67],'')).toBe('✗ 足りない：E4');});
 it('preserves register and timing messages',()=>{expect(masterWrongFeedback([60],[72],'音域（鍵盤の位置）が違います')).toBe('✗ 音域（鍵盤の位置）が違います');expect(masterWrongFeedback([60],undefined,'2拍の中で和音がそろいませんでした')).toBe('✗ 2拍の中で和音がそろいませんでした');});
 it('freezes the exact judged set when input releases after tick and clears on a new target',()=>{const e=new Master251Engine('A:0','recall',undefined);e.start(0,[]);const notes=e.target.chords[0].notes.map(n=>n+1);e.input(notes,100,true);e.input([],160);expect(e.ok).toBe(false);expect(e.lastJudgedNotes).toEqual(notes);expect(Object.isFrozen(e.lastJudgedNotes)).toBe(true);e.input([1],170);expect(e.lastJudgedNotes).toEqual(notes);const fresh=new Master251Engine('A:0','recall',undefined);fresh.start(0,[]);fresh.input(fresh.target.chords[0].notes,100,true);fresh.tick(160);expect(fresh.chordIndex).toBe(1);expect(fresh.lastJudgedNotes).toBeUndefined();});
 it('has no mismatch snapshot for timeout or late first-on failures',()=>{const e=new Master251Engine('A:0','tempo',80);e.start(0,[]);e.input(e.target.chords[0].notes,100,true);e.tick(160);e.tick(1600);e.tick(3100);expect(e.ok).toBe(false);expect(e.lastJudgedNotes).toBeUndefined();const cleanup=new Master251Engine('A:0','recall',undefined);cleanup.start(0,[]);cleanup.input([...cleanup.target.chords[0].notes,36],100,true);cleanup.input(cleanup.target.chords[0].notes,130);cleanup.tick(190);expect(cleanup.ok).toBe(false);expect(cleanup.lastJudgedNotes).toBeUndefined();});
});
