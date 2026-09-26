// Validates the frozen synthetic research artifacts without touching private witnesses.
const fs=require('fs');const crypto=require('crypto');const {execFileSync}=require('child_process');
const base='docs/phase8.8.3-r';const read=p=>fs.readFileSync(`${base}/${p}`);const json=p=>JSON.parse(read(p));
const canonical=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
const sha=b=>crypto.createHash('sha256').update(canonical(b)).digest('hex');const failures=[];
const requireCheck=(value,message)=>{if(!value)failures.push(message)};
const plan=json('matrix-plan.json');
const manifestSha=sha(read('current-site-vocabulary.json'));
requireCheck(manifestSha===plan.vocabularyManifestSha256,'site manifest hash differs');
requireCheck(read('current-site-vocabulary.sha256').toString().startsWith(manifestSha),'manifest digest file differs');
for(const part of plan.partitions)requireCheck(sha(read(part.siteOnlyEvidenceFile))===part.sha256,`partition hash differs: ${part.kind}`);
requireCheck(plan.partitions.reduce((n,p)=>n+p.count,0)===plan.plannedRowCount,'partition count differs');
const rows=read('compatibility-matrix.jsonl').toString().trimEnd().split('\n').map(JSON.parse);
requireCheck(rows.length===plan.plannedRowCount,'matrix row count differs');
requireCheck(sha(read('compatibility-matrix.jsonl'))==='5255ebb8525735ada1918ad99d2a056d225300a85b6b0d9f82acd44d8b9966b0','matrix canonical digest differs');
requireCheck(new Set(rows.map(r=>r.rowId)).size===rows.length,'duplicate row ID');
requireCheck(rows.every(r=>r.siteAccepted),'unmeasured/rejected site row in frozen accepted matrix');
requireCheck(rows.every(r=>r.mismatchClasses.length>0),'unclassified accepted row');
requireCheck(rows.every(r=>r.mismatchClasses.every(c=>'ABCDEF'.includes(c))),'unknown mismatch class');
requireCheck(rows.every(r=>r.provenance?.siteVocabularyManifestSha256===manifestSha),'row manifest provenance incomplete');
requireCheck(rows.every(r=>r.provenance?.loopVaultCommit==='c618479b88ccc44f1d749ec30416058fa27d1e23'),'row Product commit provenance incomplete');
requireCheck(rows.every(r=>r.provenance?.semanticPolicyId==='p8.8.3-r-literal-degree-v1'),'row theory policy provenance incomplete');
requireCheck(rows.every(r=>r.requiredImplementationAction&&r.siteEvidenceType?.length&&r.siteConcreteNotes),'row evidence/action incomplete');
requireCheck(rows.slice(-6).every(r=>r.rowPartition==='DIRECT_RISK'&&!r.mismatchClasses.includes('F')),'high-risk direct witness missing or unknown');
const aggregate=json('matrix-aggregate.json');
requireCheck(aggregate.emitted===rows.length&&aggregate.families===new Set(rows.map(r=>r.vocabularyFamilyId)).size,'aggregate differs');
for(const c of 'ABCDEF')requireCheck(aggregate.classes[c]===rows.filter(r=>r.mismatchClasses.includes(c)).length,`aggregate class ${c} differs`);
const branchChanges=execFileSync('git',['diff','--name-only','master...HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
requireCheck(branchChanges.every(p=>p.startsWith(`${base}/`)),'production/out-of-scope file changed');
requireCheck(branchChanges.every(p=>!/\.(?:mid|mp4|mp3|wav|png|jpg|jpeg)$/i.test(p)),'media added to research branch');
const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'}).split(/\r?\n/);
requireCheck(!tracked.some(p=>p.startsWith('.local-evaluation/')),'ignored local evaluation tracked');
const textPaths=branchChanges.filter(p=>!p.endsWith('.jsonl'));
for(const p of textPaths){const text=fs.readFileSync(p,'utf8');requireCheck(!/[A-Za-z]:\\Users\\/i.test(text),`personal path in ${p}`)}
const structuralPass=failures.length===0;
// R07 is deliberately unproven under the privacy rule; factorized lexical parity
// is not established for every accepted alias/operator cross-product.
const localWitnessGate=false,fullGrammarFactorProof=false;
console.log(JSON.stringify({structuralPass,failures,planned:plan.plannedRowCount,measured:rows.length,siteAccepted:rows.filter(r=>r.siteAccepted).length,familyRows:new Set(rows.map(r=>r.vocabularyFamilyId)).size,unknownRows:aggregate.classes.F,localWitnessGate,fullGrammarFactorProof,coverageProven:structuralPass&&localWitnessGate&&fullGrammarFactorProof}));
if(!structuralPass)process.exitCode=1;
