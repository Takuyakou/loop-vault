/* global console */
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {voiceChordForPreview,chordPitchClasses} from '../../src/domain/chordVoicing';
import {generateStyleVoicingPlan} from '../../src/domain/voicingPractice/optimizeProgression';
import {generateStudyCandidates} from '../../src/domain/voicingRules/studyGenerator';
import {chordToneDescriptors} from '../../src/domain/voicingPractice/tonePolicy';
import type {ChordQuality,ChordSymbol,ChordTimelineItem} from '../../src/domain/types';
const out=fileURLToPath(new URL('../../p12-generated/P12.0-01/',import.meta.url));mkdirSync(out,{recursive:true});
const pc=(n:number)=>((n%12)+12)%12;
const names=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const note=(n:number)=>names[pc(n)]+(Math.floor(n/12)-1);
const qs:[ChordQuality,string][]=[['maj',''],['min','m'],['maj7','maj7'],['maj9','maj9'],['sixNine','6/9'],['min7','m7'],['min9','m9'],['min6','m6'],['dom7','7'],['dom9','9'],['dom13','13'],['dom7sus4','7sus4'],['min7b5','m7♭5'],['dim7','dim7']];
function chord(root:number,quality:ChordQuality):ChordSymbol{return {root:pc(root),quality,tensions:[],label:names[pc(root)]+qs.find(q=>q[0]===quality)![1]};}
function event(c:ChordSymbol):ChordTimelineItem{return {eventId:'audit',bar:1,beat:1,durationBeats:4,chord:c,confidence:1,alternatives:[],warnings:[]};}
const opts={maxLeftHandSpanSemitones:12,maxRightHandSpanSemitones:12,allowUnsupportedFallback:false};
const deg=(c:ChordSymbol,ns:number[])=>ns.map(n=>chordToneDescriptors(c).find(t=>t.pitchClass===pc(n))?.label??'?');
const css='body{font-family:system-ui;background:#111827;color:#e5e7eb;margin:24px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #475569;padding:10px;vertical-align:top}th{background:#1e293b;position:sticky;top:0}.keys{display:flex;width:588px;min-width:588px;height:65px;margin:8px 0}.keys span{width:16px;font-size:8px;background:#f8fafc;color:#334155;border:1px solid #64748b;writing-mode:vertical-rl;overflow:hidden}.keys .black{height:46px;background:#334155;color:white}.keys .on{background:#2dd4bf;color:#022c22}button,input{padding:8px;margin:5px;background:#334155;color:white;border:1px solid #94a3b8}td:nth-child(1){min-width:150px}td:nth-child(2){min-width:140px}td:nth-child(4){min-width:260px}summary{cursor:pointer}small{display:block;margin:6px 0}.pass{color:#86efac}.fail{color:#fca5a5}';
const keys=(ns:number[])=>'<div class="keys">'+Array.from({length:49},(_,i)=>i+36).map(n=>`<span class="${[1,3,6,8,10].includes(pc(n))?'black ':''}${ns.includes(n)?'on':''}" title="${note(n)} (${n})">${ns.includes(n)||pc(n)===0?note(n):''}</span>`).join('')+`</div><small>${ns.map(note).join(' · ')} / MIDI ${ns.join(', ')}</small>`;
const play=(ns:number[])=>`<button data-notes='${JSON.stringify(ns)}'>音を聴く</button>`;
const audio=`<script>document.addEventListener('click',async e=>{const b=e.target.closest('[data-notes]');if(!b)return;const ctx=new AudioContext();for(const n of JSON.parse(b.dataset.notes)){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=440*2**((n-69)/12);g.gain.setValueAtTime(.055,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.9);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+1)}setTimeout(()=>ctx.close(),1200)});document.querySelector('#filter').addEventListener('input',e=>{for(const r of document.querySelectorAll('tbody>tr'))r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase())});</script>`;
const page=(title:string,body:string)=>`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style><h1>${title}</h1><p>承認前の調査。音を聴き「型にする／直す／入れない」は人間が決めてください。C4=MIDI60。</p><input id="filter" placeholder="コード・キー・結果で絞り込み">${body}${audio}</html>`;
const rows=[];
for(const root of [0,6])for(const [quality]of qs)for(const preset of ['基本','骨組み','上に三和音','広げる'])for(const bass of ['自分で弾く','別のパート']){
 const c=chord(root,quality),style=preset==='基本'?'generated-close':preset==='骨組み'?'shell-17':'open-17';
 const generated=preset==='上に三和音'?undefined:generateStyleVoicingPlan([event(c)],style,opts).events[0];
 let ns=[...(generated?.allNotes??[])];if(bass==='別のパート')ns=ns.filter(n=>pc(n)!==root);
 const tones=chordPitchClasses(c).filter(n=>n!==root),triads:number[][]=[];
 for(const r of tones)for(const ints of [[0,4,7],[0,3,7]]){const t=ints.map(i=>pc(r+i));if(t.every(n=>tones.includes(n)))triads.push(t);}
 const proposal=preset==='上に三和音'&&triads[0]?[...(bass==='自分で弾く'?[48+root]:[]),...triads[0].map(n=>60+n).sort((a,b)=>a-b)]:[];
 const study=generateStudyCandidates(c,preset==='骨組み'?'core':'teacher',{bass:bass==='自分で弾く'?'self-played':'external-bass',top:'normal-voicing-top'},{...opts,modifiers:{open:preset==='広げる'}})[0];
 const rootless=generateStyleVoicingPlan([event(c)],'rootless-ab',opts).events[0];
 rows.push({root,quality,label:c.label,preset,bass,source:preset==='上に三和音'?'専用レシピなし':style+(bass==='別のパート'?' + 調査内で全ルートを除去':''),status:generated&&ns.length?'生成できた':'作れない',notes:ns,degrees:deg(c,ns),bassMatches:ns.length>0&&(bass==='自分で弾く'?pc(ns[0])===root:pc(ns[0])!==root),axes:{構成:preset==='広げる'?'骨組み由来':preset,実構成:deg(c,ns).join(" "),実幅:ns.length?String(ns.at(-1)!-ns[0])+"半音":"なし",配置:preset==='広げる'?'広げる':'まとめる',ベース:bass,トップ:'指定なし（実トップ '+(deg(c,ns).at(-1)??'なし')+'）'},proposal,omittedPC:chordPitchClasses(c).filter(n=>!proposal.some(v=>pc(v)===n)),studyNotes:study?.candidate.allNotes??[],rootlessNotes:rootless?.allNotes??[],warnings:generated?.warnings??[]});
}
writeFileSync(out+'recipe-table.html',page('P12.0-01 型の音一覧 — 224組',`<p>14種類 × 4プリセット × ベース2 × C/F#。主表はZIPの候補対応 Default close / Shell 1-7 / Open 1-7。Phase11 Teacher/CoreとRootlessも比較欄に表示。上に三和音の案は構成音内のメジャー/マイナー三和音のみ。専用レシピと省略許可は未承認。</p><table><thead><tr><th>コード・型</th><th>結果・生成元</th><th>実際の音・度数</th><th>比較・案</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}<br>${r.preset}<br>${r.bass}<small>${JSON.stringify(r.axes)}</small></td><td>${r.status}<br>${r.source}<small>${r.warnings.join(', ')}</small></td><td>${keys(r.notes)}<small>最低音条件 ${r.bassMatches?'一致':'不一致・要修正'}</small><small>下から ${r.degrees.join(' ')} / 最低音 ${r.notes.length?note(r.notes[0]):'なし'}</small>${r.notes.length?play(r.notes):''}</td><td>${r.proposal.length?`未承認の案${keys(r.proposal)}${play(r.proposal)}<small>省略PC ${r.omittedPC.map(n=>names[n]).join(', ')}</small>`:r.preset==='上に三和音'?'構成音内のメジャー/マイナー三和音なし':''}<details><summary>Phase11 Teacher/Core比較</summary>${keys(r.studyNotes)}${play(r.studyNotes)}</details><details><summary>Rootless A/B比較</summary>${r.rootlessNotes.length?keys(r.rootlessNotes)+play(r.rootlessNotes):'対応なし'}</details></td></tr>`).join('')}</tbody></table>`));
type Claim={kind:'half-step';from:{chord:number;tone:number};to:{chord:number;tone:number};dir:'up'|'down'}|{kind:'max-upper-motion';semitones:number}|{kind:'diatonic-descent'}|{kind:'common-tones';tones:number[]};
const h=(a:number,t:number,b:number,u:number,dir:'up'|'down'):Claim=>({kind:'half-step',from:{chord:a,tone:t},to:{chord:b,tone:u},dir});
const defs:{id:string;formula:[number,ChordQuality][];text:string;claims:Claim[]}[]=[
{id:'ii-v-i-major',formula:[[2,'min7'],[7,'dom7'],[0,'maj7']],text:'7度が次のコードの3度へ半音で下りる',claims:[h(0,10,1,4,'down'),h(1,10,2,4,'down')]},
{id:'ii-v-i-minor',formula:[[2,'min7b5'],[7,'dom7'],[0,'min7']],text:'iiøの♭5がVの根音へ半音で下りる',claims:[h(0,6,1,0,'down')]},
{id:'i-vi7-ii-v',formula:[[0,'maj7'],[9,'dom7'],[2,'min7'],[7,'dom7']],text:'VI7の3度がiiの根音へ半音で上がる',claims:[h(1,4,2,0,'up')]},
{id:'i-v-vi-iv',formula:[[0,'maj'],[7,'maj'],[9,'min7'],[5,'maj7']],text:'ベースが大きく動いても上の音は近くに留める',claims:[{kind:'max-upper-motion',semitones:4}]},
{id:'iv-iii-ii-i',formula:[[5,'maj7'],[4,'min7'],[2,'min7'],[0,'maj7']],text:'形を保ったまま1段ずつ下りる',claims:[{kind:'diatonic-descent'}]},
{id:'iv-iii7-vi',formula:[[5,'maj7'],[4,'dom7'],[9,'min7']],text:'III7の3度がviの根音へ半音で上がる',claims:[h(1,4,2,0,'up')]},
{id:'backdoor',formula:[[5,'min7'],[10,'dom7'],[0,'maj7']],text:'A♭がGへ半音で下りて落ち着く',claims:[h(1,10,2,7,'down')]},
{id:'imaj9-ivmaj9',formula:[[0,'maj9'],[5,'maj9']],text:'共通の音（C・E・G）を残したまま動く',claims:[{kind:'common-tones',tones:[0,4,7]}]}
];
export function claimPass(c:Claim,cs:ChordSymbol[],ns:number[][]):boolean{
 if(ns.some(n=>!n.length))return false;
 if(c.kind==='half-step'){const a=ns[c.from.chord].filter(n=>pc(n)===pc(cs[c.from.chord].root+c.from.tone));const b=ns[c.to.chord].filter(n=>pc(n)===pc(cs[c.to.chord].root+c.to.tone));return a.some(n=>b.includes(n+(c.dir==='up'?1:-1)));}
 if(c.kind==='common-tones')return c.tones.every(t=>ns[0].some(n=>pc(n)===pc(cs[0].root+t)&&ns[1].includes(n)));
 for(let i=1;i<ns.length;i++){const a=ns[i-1].slice(1),b=ns[i].slice(1);if(c.kind==='max-upper-motion'){if(a.some(n=>Math.min(...b.map(v=>Math.abs(v-n)))>c.semitones)||b.some(n=>Math.min(...a.map(v=>Math.abs(v-n)))>c.semitones))return false;}else if(a.length!==b.length||a.some((n,j)=>n-b[j]<1||n-b[j]>2))return false;}return true;
}
function candidates(c:ChordSymbol){const base=voiceChordForPreview(c).notes;const variants:number[][]=[];for(let start=55;start<=72;start++){const ns=[base[0],...base.slice(1).map(n=>start+pc(pc(n)-pc(start))).sort((a,b)=>a-b)];if(Math.max(...ns)<=84&&!variants.some(v=>v.join(',')===ns.join(',')))variants.push(ns);}return variants;}
function motion(a:number[],b:number[]){return a.slice(1).reduce((s,n)=>s+Math.min(...b.slice(1).map(v=>Math.abs(v-n))),0)+b.slice(1).reduce((s,n)=>s+Math.min(...a.slice(1).map(v=>Math.abs(v-n))),0);}
const points=defs.flatMap(d=>Array.from({length:12},(_,key)=>{
 const cs=d.formula.map(([r,q])=>chord(r+key,q)),groups=cs.map(candidates),ns:number[][]=[];
 groups.forEach(g=>{const prev=ns.at(-1);ns.push([...g].sort((a,b)=>(prev?motion(prev,a)-motion(prev,b):Math.abs(a.at(-1)!-67)-Math.abs(b.at(-1)!-67))||a.join(',').localeCompare(b.join(',')))[0]);});
 const passed=d.claims.every(c=>claimPass(c,cs,ns));let corrected:number[][]|undefined;
 function search(i:number,path:number[][]){if(corrected)return;if(i===groups.length){if(d.claims.every(c=>claimPass(c,cs,path)))corrected=path;return;}for(const n of groups[i])search(i+1,[...path,n]);}
 if(!passed)search(0,[]);let proposalKind=corrected?'(a) 同じ構成音の配置を制約付きで選ぶ':'(b) 理論の上では：…（高さ変更だけでは成立しない）';
 if(!passed&&!corrected&&d.claims.every(c=>c.kind==='half-step')){
  const proposal=ns.map(n=>[...n]);
  for(const c of d.claims){if(c.kind!=='half-step')continue;const source=proposal[c.from.chord].find(n=>pc(n)===pc(cs[c.from.chord].root+c.from.tone));if(source!==undefined){const target=source+(c.dir==='up'?1:-1);if(target>proposal[c.to.chord][0])proposal[c.to.chord]=[...new Set([...proposal[c.to.chord],target])].sort((a,b)=>a-b);}}
  if(d.claims.every(c=>claimPass(c,cs,proposal))){corrected=proposal;proposalKind='(a) 到達する根音を上声部にも追加する案（基本の重複/音数が変わるため人間判断）';}
 }
 if(!passed&&!corrected&&d.id==='imaj9-ivmaj9'){const common=[0,4,7].map(t=>60+pc(key+t));corrected=cs.map(c=>[...new Set([...voiceChordForPreview(c).notes,...common])].sort((a,b)=>a-b));proposalKind='(a) 共通音を同じ高さで追加する案（音数/重複が変わるため人間判断）';}
 return {id:d.id,key:names[key],text:d.text,claims:d.claims,chords:cs,notes:ns,passed,corrected,correctedPass:corrected?d.claims.every(c=>claimPass(c,cs,corrected!)):false,proposalKind};
}));
writeFileSync(out+'point-check.html',page('P12.0-01 今日のポイント — 8進行 × 12キー',`<p>基本=Default closeの構成音。現行generated-closeに進行最適化は無いため、調査内のみ上声部の回転（開始55〜72/上限84）を作り双方向最近距離の和が最小の形を選ぶ。半音は実MIDI±1を確認。下降は各上声部を順番のまま1〜2半音下降と解釈（同一音程構造の維持は別問題）。近接は双方向最近距離≤4。声部対応の承認は別途必要。</p><p>${points.filter(p=>p.passed).length}/96 成立。FAILは発見した不成立。案は未承認です。</p><table><thead><tr><th>進行・キー・主張</th><th>実際の音</th><th>結果・修正案</th></tr></thead><tbody>${points.map(p=>`<tr><td>${p.id} / ${p.key}<p>${p.text}（Cでの文。実音は選択キーへ移調）</p><small>${JSON.stringify(p.claims)}</small></td><td>${p.chords.map((c,i)=>`<strong>${c.label}</strong>${keys(p.notes[i])}${play(p.notes[i])}`).join('')}</td><td class="${p.passed?'pass':'fail'}">${p.passed?'PASS':'FAIL'}${!p.passed?`<p>${p.proposalKind}</p>${p.corrected?`<details><summary>修正案（再検証 ${p.correctedPass?'PASS':'FAIL'}）</summary>${p.corrected.map(n=>keys(n)+play(n)).join('')}</details>`:''}<p>別案：理論の上では、${p.text}</p>`:''}</td></tr>`).join('')}</tbody></table>`));
const summary={recipeRows:rows.length,generated:rows.filter(r=>r.status==='生成できた').length,bassMismatch:rows.filter(r=>r.status==='生成できた'&&!r.bassMatches).length,unsupported:rows.filter(r=>r.status==='作れない').length,upperTriadProposals:rows.filter(r=>r.proposal.length).length,points:points.length,pointPass:points.filter(p=>p.passed).length,byProgression:defs.map(d=>({id:d.id,pass:points.filter(p=>p.id===d.id&&p.passed).length,correctedPass:points.filter(p=>p.id===d.id&&!p.passed&&p.correctedPass).length})),rootRemoval:qs.map(([q])=>({quality:q,self:rows.find(r=>r.quality===q&&r.preset==='基本'&&r.root===0&&r.bass==='自分で弾く')!.notes,external:rows.find(r=>r.quality===q&&r.preset==='基本'&&r.root===0&&r.bass==='別のパート')!.notes}))};
writeFileSync(out+'audit-data.json',JSON.stringify({summary,rows,points},null,2));console.log(JSON.stringify({...summary,rootRemoval:undefined},null,2));
