import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trialMetrics,summary,percentile,pcs} from './measurement-core.mjs';
test('note-on spread and recall stop at last attack, not manual confirmation',()=>{const result=trialMetrics([{note:60,at:2000},{note:64,at:2030},{note:67,at:2080}],1000);assert.equal(result.spreadMs,80);assert.equal(result.recallSec,1.08);assert.deepEqual(result.noteOns.map(n=>n.offsetMs),[1000,1030,1080]);assert.equal(trialMetrics([],0),null);});
test('percentiles and exclusion of errors / shown answers',()=>{assert.equal(percentile([1,2,3,4],.5),2.5);assert.equal(percentile([1,2,3,4],.9),3.7);assert.equal(percentile([],.9),null);const s=summary([{ok:true,spreadMs:80,recallSec:1},{ok:false,spreadMs:999,recallSec:9},{ok:true,answerSeen:true,spreadMs:888,recallSec:8}]);assert.equal(s.valid,1);assert.equal(s.spreadMs.max,80);assert.deepEqual(pcs([60,72,64,67]),[0,4,7]);});

import {ChordTrial} from './measurement-core.mjs';
test('Separated arpeggio and retry are excluded, held chord accepted',()=>{
 const a=new ChordTrial([0,4,7]);a.event(0,60,90,true,0);a.event(0,60,0,false,10);a.event(0,64,90,true,20);a.event(0,67,90,true,30);assert.equal(a.ok,false);
 const b=new ChordTrial([0,4,7]);for(const [i,n]of [60,64,67].entries())b.event(0,n,90,true,i*30);assert.equal(b.ok,true);for(const n of [60,64,67])b.event(0,n,0,false,100);assert.equal(b.ok,true);b.event(0,60,90,true,120);assert.equal(b.ok,false);
});
