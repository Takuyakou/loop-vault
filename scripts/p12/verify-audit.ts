import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {claimPass} from './generate-audit';
const data=JSON.parse(readFileSync(fileURLToPath(new URL('../../p12-generated/P12.0-01/audit-data.json',import.meta.url)),'utf8'));
assert.equal(data.rows.length,224);assert.equal(new Set(data.rows.map((r:{root:number;quality:string;preset:string;bass:string})=>[r.root,r.quality,r.preset,r.bass].join('|'))).size,224);
assert.equal(data.points.length,96);
const cs=[{root:2,quality:'min7' as const,tensions:[],label:'Dm7'},{root:7,quality:'dom7' as const,tensions:[],label:'G7'}];
const h={kind:'half-step' as const,from:{chord:0,tone:10},to:{chord:1,tone:4},dir:'down' as const};
assert.equal(claimPass(h,cs,[[60],[59]]),true);assert.equal(claimPass(h,cs,[[60],[71]]),false);assert.equal(claimPass(h,cs,[[62],[59]]),false);
assert.equal(claimPass({kind:'common-tones',tones:[0]},[{...cs[0],root:0},{...cs[1],root:5}],[[60],[72]]),false);
assert.equal(claimPass({kind:'max-upper-motion',semitones:4},cs,[[48,60,64],[43,60,69]]),false);
assert.equal(claimPass({kind:'diatonic-descent'},cs,[[48,60,64],[43,59,62]]),true);
assert.equal(claimPass({kind:'diatonic-descent'},cs,[[48,60,64],[43,60,62]]),false);
for(const p of data.points){assert.equal(p.passed,p.claims.every((c:Parameters<typeof claimPass>[0])=>claimPass(c,p.chords,p.notes)));if(p.corrected)assert.equal(p.correctedPass,p.claims.every((c:Parameters<typeof claimPass>[0])=>claimPass(c,p.chords,p.corrected)));}
console.log('Audit assertions PASS: 224 unique recipe rows, 96 point results, exact-height positive/negative counterexamples and corrected proposals');
