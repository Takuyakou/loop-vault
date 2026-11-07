import {describe,expect,it,vi,beforeEach,afterEach} from 'vitest';
import {readRepeatSetting,writeRepeatSetting} from './practiceRepeat';

// @vitest-environment jsdom
/** P18-01 Stage 2: the switch of 「この段階をくり返す」 is remembered per screen kind, without touching the records' file shapes. */
describe('practiceRepeat',()=>{
 beforeEach(()=>{window.localStorage.clear();});
 afterEach(()=>{window.localStorage.clear();});
 it('the first value is off for A (the standard progressions) and on for C and D',()=>{
  expect(readRepeatSetting('a')).toBe(false);
  expect(readRepeatSetting('c')).toBe(true);
  expect(readRepeatSetting('d')).toBe(true);
 });
 it('a written value is read back, and each screen kind keeps its own',()=>{
  writeRepeatSetting('a',true);
  writeRepeatSetting('c',false);
  expect(readRepeatSetting('a')).toBe(true);
  expect(readRepeatSetting('c')).toBe(false);
  expect(readRepeatSetting('d')).toBe(true);
 });
 it('an unknown stored value falls back to the first value',()=>{
  window.localStorage.setItem('loop-vault:practice-repeat:a','yes');
  expect(readRepeatSetting('a')).toBe(false);
 });
 it('without a usable storage the first value comes back and writing does not throw',()=>{
  vi.spyOn(window.localStorage,'getItem').mockImplementation(()=>{throw new Error('denied');});
  vi.spyOn(window.localStorage,'setItem').mockImplementation(()=>{throw new Error('denied');});
  expect(readRepeatSetting('c')).toBe(true);
  expect(()=>writeRepeatSetting('c',false)).not.toThrow();
 });
});
