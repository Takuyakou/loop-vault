import {describe,it,expect,vi} from 'vitest';
import {Master251Engine} from '../../domain/master251/engine';
import {TARGETS,cellKey,emptyMaster} from '../../domain/master251/model';
import {recordAttempt} from '../../domain/master251/policy';
import {createPlaybackController,type PlaybackAudioDriver} from '../../audio/playbackController';
import {beginMaster251Audition,beginMaster251ProgressionAudition,restartMaster251AfterAudition} from './master251Audition';
describe('Master card audition uses the existing preview without judging input',()=>{
 it('sends every canonical voicing unchanged, including octaves and existing sound choice',async()=>{
  const before=JSON.stringify(TARGETS),driver:PlaybackAudioDriver={playChord:vi.fn(async()=>{}),playTimeline:vi.fn(),stop:vi.fn()},controller=createPlaybackController(driver);
  for(const target of TARGETS)for(let index=0;index<3;index++){
   const e=new Master251Engine(cellKey(target.form,target.key),'learn',undefined);e.start(0,[]);
   const sound=index%2?'electric-piano':'piano',request=beginMaster251Audition(e,index,sound)!;
   await controller.play({kind:'practice',id:'master:test'},request);
   expect(driver.playChord).toHaveBeenLastCalledWith(expect.objectContaining({label:target.chords[index].symbol}),sound,expect.any(Object),target.chords[index].notes);
   expect(e.chordIndex).toBe(0);expect(e.usedHint).toBe(false);
  }
  controller.stop();expect(JSON.stringify(TARGETS)).toBe(before);
 });
 it.each(['recall','tempo'] as const)('freezes %s and restarts at a new physical-release gate with assisted grading',mode=>{
  const e=new Master251Engine('A:0',mode,mode==='tempo'?80:undefined);e.start(0,[]);e.input(e.target.chords[0].notes,100,true);e.tick(160);
  expect(e.clockAt).toBe(mode==='tempo'?100:undefined);
  beginMaster251Audition(e,2,'piano');e.input(e.target.chords[2].notes,10000,true);e.tick(20000);expect(e.phase).toBe('paused');expect(e.usedHint).toBe(true);expect(e.ok).toBeUndefined();
  const fresh=restartMaster251AfterAudition(e);expect(fresh.clockAt).toBeUndefined();expect(fresh.recallSec).toBeUndefined();expect(fresh.start(21000,e.target.chords[2].notes)).toBe(false);expect(fresh.start(22000,[])).toBe(true);
  expect(fresh.usedHint).toBe(true);expect(fresh.hintLevel).toBe(0);
  const cell=emptyMaster().cells['A:0'];cell.status='passed';cell.currentBpm=80;
  const result=recordAttempt(cell,{at:'2026-10-06T00:00:00.000Z',ok:true,recallSec:1,bpm:80,usedHint:fresh.usedHint},mode);
  expect(result.status).toBe('passed');expect(result.bestRecallSec).toBeUndefined();expect(result.qualifiedAt).toBeUndefined();expect(result.recent[0].usedHint).toBe(true);
 });
 it('does not disclose or play an invalid target or Ready cell',()=>{const e=new Master251Engine('A:0','recall',undefined);expect(beginMaster251Audition(e,0,'piano')).toBeUndefined();e.start(0,[]);expect(beginMaster251Audition(e,3,'piano')).toBeUndefined();expect(e.phase).toBe('active');expect(e.usedHint).toBe(false);});
 it('plays all 48 cells as their own canonical ii-V-I timeline with exact notes and global sound choice',async()=>{
  const original=JSON.stringify(TARGETS),driver:PlaybackAudioDriver={playChord:vi.fn(),playTimeline:vi.fn(async()=>{}),stop:vi.fn()},controller=createPlaybackController(driver);
  for(const target of TARGETS){const id=cellKey(target.form,target.key),e=new Master251Engine(id,'learn',undefined);e.start(0,[]);const sound=target.key%2?'electric-piano':'piano',request=beginMaster251ProgressionAudition(e,sound)!;expect(request.type).toBe('timeline');if(request.type!=='timeline')throw Error('timeline required');
   expect(request.timeline.map(c=>c.chord.label)).toEqual(target.chords.map(c=>c.symbol));expect(request.timeline.map(c=>[c.bar,c.beat,c.durationBeats])).toEqual([[1,1,2],[1,3,2],[2,1,2]]);
   expect(request.timeline.map(c=>request.explicitMidiNotesByEventId![c.eventId!])).toEqual(target.chords.map(c=>c.notes));
   await controller.play({kind:'practice',id:'master:progression'},request);expect(driver.playTimeline).toHaveBeenLastCalledWith(request.timeline,80,sound,expect.any(Object),4,request.explicitMidiNotesByEventId);expect(e.cell).toBe(id);expect(e.chordIndex).toBe(0);expect(e.phase).toBe('paused');expect(e.usedHint).toBe(false);
  }controller.stop();expect(JSON.stringify(TARGETS)).toBe(original);
 });
 it.each(['recall','tempo'] as const)('marks %s progression audition assisted and clears its old timing at restart',mode=>{const e=new Master251Engine('A:0',mode,mode==='tempo'?80:undefined);expect(beginMaster251ProgressionAudition(e,'piano')).toBeUndefined();e.start(0,[]);e.input(e.target.chords[0].notes,100,true);e.tick(160);beginMaster251ProgressionAudition(e,'piano');expect(e.usedHint).toBe(true);expect(e.hintLevel).toBe(4);e.tick(20000);expect(e.ok).toBeUndefined();const fresh=restartMaster251AfterAudition(e);expect(fresh.usedHint).toBe(true);expect(fresh.clockAt).toBeUndefined();expect(fresh.chordIndex).toBe(0);expect(fresh.start(22000,e.target.chords[0].notes)).toBe(false);});

});
