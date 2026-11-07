// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {jazzLapOutcome,recallAnswerVisible,RECALL_CARRIED,RECALL_FOCUS_OPENED,RECALL_MESSAGE} from './heldCardRecall';

/** P18-02: the decisions of the ② 覚えて弾く stage of Jazz Progressions (note: these are the plain-function part at
 * unit level; the rest — the run and the view — is covered by the e2e). */
describe('jazzLapOutcome (the end of a lap)',()=>{
 it('① is counted whatever the round looked at',()=>{
  expect(jazzLapOutcome('see',false,true)).toEqual({counted:true,stop:false});
  expect(jazzLapOutcome('see',true,false)).toEqual({counted:true,stop:true});
 });
 it('a clean ② counts and stops when くり返す is off',()=>{
  expect(jazzLapOutcome('recall',false,true)).toEqual({counted:true,stop:false});
  expect(jazzLapOutcome('recall',false,false)).toEqual({counted:true,stop:true});
 });
 it('a ② round with a hint is not counted and never stops: the same key goes round again',()=>{
  expect(jazzLapOutcome('recall',true,true)).toEqual({counted:false,stop:false});
  expect(jazzLapOutcome('recall',true,false)).toEqual({counted:false,stop:false});
 });
});
describe('recallAnswerVisible (what the cards of ② show)',()=>{
 it('the played-through cards show their notes; the current one is ? until the answer was shown',()=>{
  expect(recallAnswerVisible(0,2,undefined)).toBe(true);
  expect(recallAnswerVisible(1,2,undefined)).toBe(true);
  expect(recallAnswerVisible(2,2,undefined)).toBe(false);
  expect(recallAnswerVisible(3,2,undefined)).toBe(false);
 });
 it('the card whose answer was shown keeps it until the current card moves (also a later one)',()=>{
  expect(recallAnswerVisible(2,2,2)).toBe(true);
  expect(recallAnswerVisible(3,2,3)).toBe(true);
  expect(recallAnswerVisible(1,2,3)).toBe(true); // before the current one as well
  expect(recallAnswerVisible(3,3,undefined)).toBe(false); // the current card moved: it closes
 });
});
describe('the lines of ② (no note names where the answer is hidden)',()=>{
 it('the carried message speaks of the held keys without their names',()=>{
  expect(RECALL_CARRIED).not.toMatch(/[A-G](♯|♭)?\d/);
  expect(RECALL_MESSAGE).not.toMatch(/[A-G](♯|♭)?\d/);
 });
 it('the notice of opening the folded この進行で学ぶこと speaks no note names either',()=>{
  expect(RECALL_FOCUS_OPENED).not.toMatch(/[A-G](♯|♭)?\d/);
 });
});
