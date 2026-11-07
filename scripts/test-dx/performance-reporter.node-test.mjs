import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import test from 'node:test';
import PerformanceReporter from './performance-reporter.mjs';

test('timing report keeps every discovered case, failures and failure artifacts without changing outcomes', () => {
  const outputFile=resolve('.local-evaluation/test-performance/reporter-contract.json');
  const reporter=new PerformanceReporter({outputFile});
  const caseOf=(id,title)=>({id,title,expectedStatus:'passed',location:{file:resolve('e2e/public.spec.ts'),line:4},parent:{project:()=>({name:'chromium-desktop'})}});
  const a=caseOf('a','success'),b=caseOf('b','failure'),c=caseOf('c','existing optional');
  reporter.onBegin({workers:4},{allTests:()=>[a,b,c]});
  const result={duration:25,startTime:new Date('2026-01-01T00:00:00Z'),retry:0,workerIndex:0,errors:[],attachments:[]};
  reporter.onTestEnd(a,{...result,status:'passed'});
  reporter.onTestEnd(b,{...result,status:'failed',errors:[{message:'synthetic failure'}],attachments:[{name:'trace',path:resolve('test-results/public/trace.zip')}]});
  reporter.onTestEnd(c,{...result,status:'skipped'});
  reporter.onEnd({status:'failed',duration:100});
  const report=JSON.parse(readFileSync(outputFile,'utf8'));
  assert.equal(report.status,'failed');assert.equal(report.workers,4);
  assert.deepEqual(report.discovered.map(t=>t.id),['a','b','c']);
  assert.deepEqual(report.tests.map(t=>t.status),['passed','failed','skipped']);
  assert.equal(report.tests[1].errors,1);assert.equal(report.tests[1].retry,0);
  assert.equal(report.tests[1].attachments[0].path,'test-results/public/trace.zip');
  assert.equal(report.tests[0].file,'e2e/public.spec.ts');
  assert.equal(report.tests[0].durationMs,25);
});

test('timing output refuses a tracked or external path',()=>{
  assert.throws(()=>new PerformanceReporter({outputFile:join('docs','timing.json')}),/local/);
});
