import {describe,expect,it} from 'vitest';
import {HeldCardJudge} from './heldCardJudge';

const on=(j:HeldCardJudge,...ns:number[])=>ns.forEach(n=>j.event(0x90,0,n,80));
const off=(j:HeldCardJudge,...ns:number[])=>ns.forEach(n=>j.event(0x80,0,n,0));

describe('HeldCardJudge',()=>{
 it('passes when every expected note is held and every struck note was pressed in this card',()=>{
  const j=new HeldCardJudge();on(j,40,50,60);
  expect(j.judge([40,50,60],[40,50,60]).ok).toBe(true);
 });
 it('ignores notes outside the expected set',()=>{
  const j=new HeldCardJudge();on(j,20,40,50,60,72,90);
  expect(j.judge([40,50,60],[40,50,60]).ok).toBe(true);
 });
 it('does not pass while one expected note is missing',()=>{
  const j=new HeldCardJudge();on(j,40,50);
  expect(j.judge([40,50,60],[40,50,60])).toMatchObject({ok:false,missing:[60]});
 });
 it('does not count a note carried over from the previous card as newly pressed, but a held note may stay held when it is only carried',()=>{
  const j=new HeldCardJudge();on(j,46,53);j.startCard();on(j,56,60);
  expect(j.judge([46,53,56,60],[56,60]).ok).toBe(true);
  expect(j.judge([46,53,56,60],[46,53,56,60])).toMatchObject({ok:false,notStruck:[46,53]});
 });
 it('a passed chord that is still held does not pass the next card by itself',()=>{
  const j=new HeldCardJudge();on(j,39,46,55);expect(j.judge([39,46,55],[39,46,55]).ok).toBe(true);
  j.startCard();
  expect(j.judge([39,46,55],[39,46,55]).ok).toBe(false);
  on(j,39);expect(j.judge([39,46,55],[39,46,55]).ok).toBe(false); // one re-pressed note is not all five
  on(j,46,55);expect(j.judge([39,46,55],[39,46,55]).ok).toBe(true);
 });
 it('a repeated note-on without a note-off keeps the key held, and one note-off releases it',()=>{
  const j=new HeldCardJudge();on(j,60,60);
  expect(j.heldNotes()).toEqual([60]);
  off(j,60);expect(j.heldNotes()).toEqual([]);
 });
 it('treats a note-on with velocity 0 as a note-off, and ignores the sustain pedal',()=>{
  const j=new HeldCardJudge();on(j,60);
  j.event(0xb0,0,64,127);
  j.event(0x90,0,60,0);
  expect(j.heldNotes()).toEqual([]);
  expect(j.judge([60],[]).ok).toBe(false);
 });
 it('reset empties the held keys and what was pressed',()=>{
  const j=new HeldCardJudge();on(j,60,64);j.reset();
  expect(j.heldNotes()).toEqual([]);expect(j.judge([60],[60])).toMatchObject({ok:false,missing:[60],notStruck:[60]});
 });
});
