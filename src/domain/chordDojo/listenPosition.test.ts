import {describe,expect,it} from 'vitest';
import {heardContextTime,listenBeat,listenCardIndex,listenProgress} from './listenPosition';

const cards=[0,4,8].map(startBeat=>({startBeat,durationBeats:4}));
describe('where the listening is, from the clock of the sound',()=>{
 it('beats come from the audio time of beat 0 and the tempo, never before the start',()=>{
  expect(listenBeat(10,10,72)).toBe(0);
  expect(listenBeat(9,10,72)).toBe(0);
  expect(listenBeat(10+60/72*4,10,72)).toBeCloseTo(4,10);
  expect(listenBeat(10+10,10,72)).toBeCloseTo(12,10);
 });
 it('progress is the share of the whole, kept within 0…1',()=>{
  expect(listenProgress(0,12)).toBe(0);expect(listenProgress(6,12)).toBe(0.5);expect(listenProgress(13,12)).toBe(1);expect(listenProgress(-1,12)).toBe(0);expect(listenProgress(3,0)).toBe(0);
 });
 it('the card that is sounding changes at the card lines, and there is none before the start or after the end',()=>{
  expect(listenCardIndex(0,cards)).toBe(0);expect(listenCardIndex(3.999,cards)).toBe(0);expect(listenCardIndex(4,cards)).toBe(1);expect(listenCardIndex(11.99,cards)).toBe(2);
  expect(listenCardIndex(12,cards)).toBeUndefined();expect(listenCardIndex(-0.1,cards)).toBeUndefined();
 });
 it('the time that is heard is the output timestamp, and without a usable one the current time less the output latency',()=>{
  expect(heardContextTime({currentTime:5,outputLatency:0.05,getOutputTimestamp:()=>({contextTime:4.9})})).toBe(4.9);
  expect(heardContextTime({currentTime:5,outputLatency:0.05,getOutputTimestamp:()=>({contextTime:0})})).toBeCloseTo(4.95,10);
  expect(heardContextTime({currentTime:5,outputLatency:0.05,getOutputTimestamp:()=>({})})).toBeCloseTo(4.95,10);
  expect(heardContextTime({currentTime:5})).toBe(5);
 });
});
