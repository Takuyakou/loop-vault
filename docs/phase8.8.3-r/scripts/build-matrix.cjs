// Research-only. Synthetic current-site rows and Product probe outputs are generated locally on D:.
const fs = require('fs');
const crypto = require('crypto');
const base = 'docs/phase8.8.3-r';
const local = '.local-evaluation/p8.8.3-r';
const site = fs.readFileSync(`${local}/site-measured.jsonl`, 'utf8').trimEnd().split('\n').map(JSON.parse);
const product = fs.readFileSync(`${local}/product-measured.jsonl`, 'utf8').trimEnd().split('\n').map(JSON.parse);
const plan = JSON.parse(fs.readFileSync(`${base}/matrix-plan.json`, 'utf8'));
if (site.length !== plan.plannedRowCount || product.length !== site.length) throw new Error('planned/emitted row count differs');
const normalize = label => label.normalize('NFKC').replaceAll('♯', '#').replaceAll('♭', 'b').replaceAll('／', '/');
const mod = n => ((n % 12) + 12) % 12;
const roots = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tone = token => { const m = /^([A-G])([#b]*)$/.exec(token); return m ? mod(roots[m[1]] + [...m[2]].reduce((n, x) => n + (x === '#' ? 1 : -1), 0)) : null; };
const specs = [
  ['diminished11', /^11o$/i, [0,3,6,10,5], [2]],
  ['dominant11sus2', /^11sus2$/i, [0,2,10,5], [7]],
  ['dominant11sus4', /^11sus4$/i, [0,5,10], [7,2]],
  ['six-sus2', /^6sus2$/i, [0,2,9], [7]],
  ['six-sus4', /^6sus4$/i, [0,5,9], [7]],
  ['six-dim', /^6o$/i, [0,3,6,9], []],
  ['add2', /^add2$/i, [0,4,7,2], []],
  ['add4', /^add4$/i, [0,4,7,5], []],
  ['add6', /^add6$/i, [0,4,7,9], []],
  ['minMaj7', /^(?:mMaj7|minMaj7)$/i, [0,3,11], [7]],
  ['min11', /^(?:m11|min11)$/i, [0,3,10,5], [7,2]],
  ['min9', /^(?:m9|min9)$/i, [0,3,10,2], [7]],
  ['min7b5', /^(?:m7b5|ø)$/i, [0,3,6,10], []],
  ['min7', /^(?:m7|min7)$/i, [0,3,10], [7]],
  ['min6', /^(?:m6|min6)$/i, [0,3,9], [7]],
  ['minor', /^(?:m|min)$/i, [0,3,7], []],
  ['major13', /^(?:maj13|M13|△13|Δ13)$/, [0,4,11,9], [7,2,5]],
  ['major9', /^(?:maj9|M9|△9|Δ9)$/, [0,4,11,2], [7]],
  ['major7', /^(?:maj7|M7|△7|Δ7)$/, [0,4,11], [7]],
  ['dominant13', /^(?:13|dom13)$/i, [0,4,10,9], [7,2,5]],
  ['dominant11', /^(?:11|dom11)$/i, [0,4,10,5], [7,2]],
  ['dominant9', /^(?:9|dom9)$/i, [0,4,10,2], [7]],
  ['dominant7sus4', /^(?:7sus4|7sus)$/i, [0,5,10], [7]],
  ['dominant7', /^(?:7|dom7)$/i, [0,4,10], [7]],
  ['dim7', /^(?:dim7|o7)$/i, [0,3,6,9], []],
  ['dim', /^(?:dim|o)$/i, [0,3,6], []],
  ['aug', /^(?:aug|\+)$/i, [0,4,8], []],
  ['sus2', /^sus2$/i, [0,2,7], []],
  ['sus4', /^sus4?$/i, [0,5,7], []],
  ['power', /^5$/, [0,7], []],
  ['six', /^6$/, [0,4,9], [7]],
  ['add9', /^add9$/i, [0,4,2], [7]],
  ['add13', /^add13$/i, [0,4,9], [7]],
  ['major', /^$/, [0,4,7], []],
];
const explicit = { '#5': [5,8], b5:[5,6], M7:[7,11], '7':[7,10], '#9':[9,3], b9:[9,1], '9':[9,2], '#11':[11,6], b11:[11,4], '11':[11,5], '#13':[13,10], b13:[13,8], '13':[13,9] };
const natural = {5:7,7:10,9:2,11:5,13:9};
function theory(label) {
  const normalized = normalize(label);
  const rootMatch = /^([A-G](?:[#b]{0,2}))(.*)$/.exec(normalized);
  if (!rootMatch) return {status:'UNKNOWN_ROOT'};
  const root = tone(rootMatch[1]);
  let rest = rootMatch[2], bass = null;
  const bassMatch = /(?:\/|on)([A-G][#b]{0,2})$/.exec(rest);
  if (bassMatch) { bass = tone(bassMatch[1]); rest = rest.slice(0, bassMatch.index); }
  const factorMatch = /\(([^()]*)\)/.exec(rest);
  let factors = factorMatch ? factorMatch[1].split(/[,\s]+/).filter(Boolean) : [];
  if (factorMatch) rest = rest.slice(0,factorMatch.index)+rest.slice(factorMatch.index+factorMatch[0].length);
  const omitMatch = /(?:omit|no)(1|3|5|7|9|11|13)$/i.exec(rest);
  if (omitMatch) { factors.push(`omit${omitMatch[1]}`); rest = rest.slice(0,omitMatch.index); }
  const resolveSpec = text => {
    const direct = specs.find(([,pattern]) => pattern.test(text));
    if(direct) return direct;
    const add = /add(2|4|6|9|11|13)$/i.exec(text);
    if(!add) return null;
    const parent = resolveSpec(text.slice(0,add.index));
    if(!parent) return null;
    const interval = {2:2,4:5,6:9,9:2,11:5,13:9}[add[1]];
    return [`${parent[0]}+add${add[1]}`,/^$/, [...new Set([...parent[2],interval])],parent[3].filter(pc=>pc!==interval)];
  };
  const spec = resolveSpec(rest);
  if (!spec) return {status:'THEORY_REJECTS_UNSUPPORTED_COMPOSITION',base:rest,root,bass};
  const required = new Set(spec[2]), optional = new Set(spec[3]), prohibited = new Set();
  const explicitlyWritten = [];
  const factorByDegree = new Map();
  for (const raw of factors) {
    const factor = raw === 'no3' ? 'omit3' : raw === 'no5' ? 'omit5' : raw;
    if (/^omit(?:1|3|5|7|9|11|13)$/i.test(factor)) {
      const degree=Number(factor.replace(/\D/g,''));
      const pcs=degree===1?[0]:degree===3?[3,4]:degree===5?[6,7,8]:degree===7?[9,10,11]:degree===9?[1,2,3]:degree===11?[4,5,6]:[8,9,10];
      for(const pc of pcs){required.delete(pc);optional.delete(pc);prohibited.add(pc)}
      continue;
    }
    const item = explicit[factor];
    if (!item) return {status:'UNADJUDICATED_FACTOR',base:spec[0],factor,root,bass};
    const [degree, pc] = item;
    const existing = factorByDegree.get(degree) ?? [];
    existing.push(pc);factorByDegree.set(degree,existing);
    explicitlyWritten.push({token:factor,degree,pitchClass:mod(root+pc)});
  }
  if(factorByDegree.get(13)?.includes(9)&&['dominant7','min7','major7'].includes(spec[0])){
    optional.add(2);optional.add(5);
  }
  for(const [degree, pcs] of factorByDegree){
    const naturalPc=natural[degree];
    // A written sixth in a 6-chord remains a sixth even when b13 is added.
    const separatelyWrittenSixth=degree===13&&['six','min6'].includes(spec[0]);
    if(!separatelyWrittenSixth){required.delete(naturalPc);optional.delete(naturalPc)}
    if(!pcs.includes(naturalPc)&&!separatelyWrittenSixth)prohibited.add(naturalPc);
    for(const pc of pcs){required.add(pc);prohibited.delete(pc)}
  }
  // An explicit altered factor does not prohibit an enharmonically identical defining tone.
  for(const pc of required)prohibited.delete(pc);
  const transpose=x=>[...x].map(pc=>mod(pc+root)).sort((a,b)=>a-b);
  return {status:'ADJUDICATED',base:spec[0],root,bass,required:transpose(required),optional:transpose(optional),prohibited:transpose(prohibited),explicitlyWritten};
}
function pcs(notes){return [...new Set((notes??[]).filter(Number.isInteger).map(n=>mod(n)))].sort((a,b)=>a-b)}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
const now=JSON.parse(fs.readFileSync(base+'/current-site-vocabulary.json','utf8')).checkedAt;
const commit='c618479b88ccc44f1d749ec30416058fa27d1e23';
const source=JSON.parse(fs.readFileSync(`${base}/current-site-vocabulary.json`,'utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(`${base}/current-site-vocabulary.json`)).digest('hex');
const rows=[],families=new Map();
for(let i=0;i<site.length;i++){
  const s=site[i],p=product[i];if(s.rowId!==p.rowId||s.label!==p.label)throw new Error(`join mismatch ${i}`);
  const t=theory(s.label),flags=new Set(),reasons=[];
  const productSupport=p.textCanConvert?'SUPPORTED':'EXPLICIT_REJECTION';
  const sitePcs=s.sitePitchClasses??[],identityPcs=[...(p.identityPitchClasses??[])].sort((a,b)=>a-b);
  const previewPcs=pcs(p.textPreviewNotes),vaultPcs=pcs(p.vaultAuditionNotes),vlPcs=pcs(p.voicingLoopNotes);
  if(t.status==='THEORY_REJECTS_UNSUPPORTED_COMPOSITION'){flags.add('E');reasons.push(t.status);if(p.textCanConvert){flags.add('A');reasons.push('PRODUCT_SILENTLY_ACCEPTS_THEORY_REJECTED_COMPOSITION')}}
  else if(t.status!=='ADJUDICATED'){flags.add('F');reasons.push(t.status)}
  else{
    const need=t.required,ban=t.prohibited,allow=new Set([...t.required,...t.optional]);
    if(need.some(x=>!sitePcs.includes(x))||ban.some(x=>sitePcs.includes(x))) {flags.add('E');reasons.push('SITE_LITERAL_SEMANTIC_DIFFERENCE')}
    if(!p.textCanConvert){flags.add('E');reasons.push('SITE_ACCEPTED_PRODUCT_EXPLICIT_REJECTION')}
    else{
      if(need.some(x=>!identityPcs.includes(x))||ban.some(x=>identityPcs.includes(x))||identityPcs.some(x=>!allow.has(x))) {flags.add('A');reasons.push('PRODUCT_IDENTITY_VIOLATES_THEORY')}
      for(const [surface,actual] of [['PREVIEW',previewPcs],['VAULT',vaultPcs],['VOICING_LOOP',p.voicingLoopStatus==='SUPPORTED'?vlPcs:null]])
        if(actual&&need.some(x=>!actual.includes(x))){flags.add('B');reasons.push(`${surface}_DEFINING_TONE_MISSING`)}
      if(p.voicingLoopStatus!=='SUPPORTED')reasons.push('VOICING_LOOP_EXPLICITLY_UNSUPPORTED');
      if(!flags.has('A')&&!flags.has('B')&&t.optional.some(x=>!previewPcs.includes(x)||!vlPcs.includes(x))) {flags.add('C');reasons.push('OPTIONAL_TONE_OMISSION')}
      if(s.siteConcreteNotes&&!same(s.siteConcreteNotes,p.textPreviewNotes)&&sitePcs.every(x=>previewPcs.includes(x))&&previewPcs.every(x=>sitePcs.includes(x))){flags.add('D');reasons.push('CONCRETE_VOICING_DIFFERS')}
    }
  }
  if(!flags.size&&p.textCanConvert&&s.siteConcreteNotes&&!same(s.siteConcreteNotes,p.textPreviewNotes)) {flags.add('D');reasons.push('CONCRETE_NOTES_DIFFER')}
  const family=t.status==='ADJUDICATED'?`${s.group}:${t.base}`:`${s.group}:UNADJUDICATED:${s.vector?s.vector.map(x=>x===null?'0':'1').join(''):s.kind??'unknown'}`;
  const action=flags.has('F')?'ADJUDICATE_THEORY_BEFORE_COMPATIBILITY_CLAIM':!p.textCanConvert?'EXPLICIT_REJECTION_OR_IMPLEMENT_SITE_FAMILY':flags.has('A')?'FIX_PRODUCT_IDENTITY':flags.has('B')?'PRESERVE_DEFINING_TONE_IN_AUDITION':flags.has('E')?'DOCUMENT_OR_SELECT_SEMANTIC_POLICY':flags.has('C')?'ACCEPT_OPTIONAL_OMISSION':flags.has('D')?'ACCEPT_OR_SPECIFY_VOICING_POLICY':'NO_CHANGE';
  const row={rowId:s.rowId,vocabularyFamilyId:family,rowPartition:s.group,writtenLabel:s.label,normalizedSiteLabel:normalize(s.label),rootSpellingClass:s.rootClass??'natural',siteAccepted:s.siteAccepted,siteEvidenceType:s.group==='ROOT_BASS'||s.group==='DIRECT_RISK'?['live-ui-score-plan']:['live-deployed-translator','deployed-scoreMaker'],siteEvidenceConfidence:'HIGH',sitePitchClasses:sitePcs,siteConcreteNotes:s.siteConcreteNotes,siteNullNoteCount:(s.siteConcreteNotes??[]).filter(x=>x===null).length,theoryStatus:t.status,theoryRequiredPitchClasses:t.required??[],theoryOptionalPitchClasses:t.optional??[],theoryProhibitedPitchClasses:t.prohibited??[],theoryWrittenFactors:t.explicitlyWritten??[],theoryBassPitchClass:t.bass??null,productSupport,loopVaultIdentity:p.identity??null,loopVaultPitchClasses:identityPcs,textPreviewNotes:p.textPreviewNotes??[],vaultAuditionNotes:p.vaultAuditionNotes??[],voicingLoopStatus:p.voicingLoopStatus??'NOT_REACHED',voicingLoopNotes:p.voicingLoopNotes??[],voicingContextId:'isolated-basic-full',mismatchClasses:[...flags].sort(),mismatchReasons:reasons,requiredImplementationAction:action,provenance:{checkedAt:now,siteVocabularyManifestSha256:hash,siteAssetRevision:'rechord-708aa5fa50c316046d70.js',siteSourceRevision:'deployed-source-map-pinned',loopVaultCommit:commit,semanticPolicyId:'p8.8.3-r-literal-degree-v1',generatedVoicingPolicyId:'basic-full-v1',matrixSchemaVersion:'1'}};
  rows.push(row);const f=families.get(family)??[];f.push(row);families.set(family,f);
}
fs.writeFileSync(`${base}/compatibility-matrix.jsonl`,rows.map(JSON.stringify).join('\n')+'\n');
const csv=(records,keys)=>keys.join(',')+'\n'+records.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(',')).join('\n')+'\n';
const coverage=[...families].map(([family,x])=>({family,grammarProductions:family.split(':')[0],acceptedAliases:'factorized-stratum',rowsExpected:x.length,rowsMeasured:x.length,coveragePercent:100,unknownRows:x.filter(r=>r.mismatchClasses.includes('F')).length,status:x.some(r=>r.mismatchClasses.includes('F'))?'THEORY_UNRESOLVED':'MEASURED'}));
fs.writeFileSync(`${base}/vocabulary-family-coverage.csv`,csv(coverage,['family','grammarProductions','acceptedAliases','rowsExpected','rowsMeasured','coveragePercent','unknownRows','status']));
const mismatch=[...families].map(([family,x])=>({family,A:x.filter(r=>r.mismatchClasses.includes('A')).length,B:x.filter(r=>r.mismatchClasses.includes('B')).length,C:x.filter(r=>r.mismatchClasses.includes('C')).length,D:x.filter(r=>r.mismatchClasses.includes('D')).length,E:x.filter(r=>r.mismatchClasses.includes('E')).length,F:x.filter(r=>r.mismatchClasses.includes('F')).length,requiredAction:[...new Set(x.map(r=>r.requiredImplementationAction))].join('|')}));
fs.writeFileSync(`${base}/mismatch-summary.csv`,csv(mismatch,['family','A','B','C','D','E','F','requiredAction']));
const consistency=[...families].map(([family,x])=>({family,previewVaultEqual:x.filter(r=>same(r.textPreviewNotes,r.vaultAuditionNotes)).length,previewSemanticCorrect:x.filter(r=>r.theoryStatus==='ADJUDICATED'&&r.theoryRequiredPitchClasses.every(pc=>pcs(r.textPreviewNotes).includes(pc))).length,vaultSemanticCorrect:x.filter(r=>r.theoryStatus==='ADJUDICATED'&&r.theoryRequiredPitchClasses.every(pc=>pcs(r.vaultAuditionNotes).includes(pc))).length,voicingLoopSemanticCorrect:x.filter(r=>r.voicingLoopStatus==='SUPPORTED'&&r.theoryStatus==='ADJUDICATED'&&r.theoryRequiredPitchClasses.every(pc=>pcs(r.voicingLoopNotes).includes(pc))).length,contextDependent:'see-R05-context-audit',notes:'isolated-basic-full'}));
fs.writeFileSync(`${base}/surface-consistency.csv`,csv(consistency,['family','previewVaultEqual','previewSemanticCorrect','vaultSemanticCorrect','voicingLoopSemanticCorrect','contextDependent','notes']));
const summary={planned:plan.plannedRowCount,emitted:rows.length,siteAccepted:rows.filter(r=>r.siteAccepted).length,productAccepted:rows.filter(r=>r.productSupport==='SUPPORTED').length,theoryAdjudicated:rows.filter(r=>r.theoryStatus==='ADJUDICATED').length,classes:Object.fromEntries('ABCDEF'.split('').map(c=>[c,rows.filter(r=>r.mismatchClasses.includes(c)).length])),highRiskDirectRows:rows.slice(-6).map(r=>({label:r.writtenLabel,classes:r.mismatchClasses,action:r.requiredImplementationAction})),families:families.size};
fs.writeFileSync(`${base}/matrix-aggregate.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
