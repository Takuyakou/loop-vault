import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { buildDifferenceReviewCases, type StoredProgressionMismatchRecord } from "../src/domain/midi/realEvaluation/differenceReview";
import { midiDifferenceReviewSchema } from "../src/domain/midi/realEvaluation/schema";
import type { MidiDifferenceReview } from "../src/domain/midi/realEvaluation/types";

const args = process.argv.slice(2);
const inputPath = resolve(optionValue("--input") ?? "artifacts/stored-progressions/mismatches.jsonl");
const outputDir = resolve(optionValue("--output") ?? "artifacts/midi-difference-review");
const mismatches = parseJsonLines<StoredProgressionMismatchRecord>(await readFile(inputPath, "utf8"));
const cases = buildDifferenceReviewCases(mismatches);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "cases.json"), `${JSON.stringify(cases, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "index.html"), reviewHtml(cases), "utf8"),
]);

const reviewsPath = optionValue("--import-reviews");
if (reviewsPath) {
  const reviews = parseJsonLines<unknown>(await readFile(resolve(reviewsPath), "utf8"))
    .map((review) => midiDifferenceReviewSchema.parse(review));
  await saveReviews(reviews);
  console.log(`Imported reviews: ${reviews.length}`);
}

console.log(`Review cases: ${cases.length}`);
console.log(`Report: ${resolve(outputDir, "index.html")}`);

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseJsonLines<T>(raw: string): T[] {
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function saveReviews(incoming: readonly MidiDifferenceReview[]): Promise<void> {
  const appData = process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming");
  const evaluationDir = resolve(appData, "com.takuyakou.loopvault/loopvault/evaluation");
  const target = resolve(evaluationDir, "difference-reviews.jsonl");
  let existing: MidiDifferenceReview[] = [];
  try {
    existing = parseJsonLines<unknown>(await readFile(target, "utf8"))
      .map((review) => midiDifferenceReviewSchema.parse(review));
  } catch {
    // A missing local review file is the expected first-run state.
  }
  const byId = new Map(existing.map((review) => [review.id, review]));
  incoming.forEach((review) => byId.set(review.id, review));
  const merged = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  await mkdir(evaluationDir, { recursive: true });
  await writeFile(target, merged.length ? `${merged.map((review) => JSON.stringify(review)).join("\n")}\n` : "", "utf8");
}

function reviewHtml(cases: unknown): string {
  const encodedCases = encodeURIComponent(JSON.stringify(cases));
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Loop Vault MIDI Difference Review</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,"Noto Sans JP",sans-serif;background:#0c0d0d;color:#f4f5f2}
    *{box-sizing:border-box}body{margin:0}.shell{max-width:980px;margin:auto;padding:28px 22px 72px}
    header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #343735;padding-bottom:18px;margin-bottom:28px}
    h1{font-size:24px;margin:0}p{color:#aeb4af}.counter{font-variant-numeric:tabular-nums;color:#35d5be}
    .review{border:1px solid #343735;background:#151716;padding:22px}.meta{display:flex;gap:18px;color:#aeb4af;font-size:13px}
    .compare{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.option{border-top:3px solid #555;padding:14px;background:#1d201e}
    .option strong{display:block;color:#aeb4af;font-size:12px;margin-bottom:8px}.chord{font-size:28px}.play{border:0;background:transparent;color:#35d5be;font-size:18px;cursor:pointer}
    .actions{display:flex;flex-wrap:wrap;gap:8px}.actions button,.export{border:1px solid #4b504d;background:#222624;color:#fff;padding:10px 13px;cursor:pointer}
    .actions button:hover,.export:hover{border-color:#35d5be}.actions button.selected{background:#35d5be;color:#07110f;border-color:#35d5be}
    .corrected{display:none;margin-top:14px}.corrected.visible{display:flex;gap:8px}.corrected input{min-width:240px;background:#0c0d0d;border:1px solid #4b504d;color:#fff;padding:10px}
    footer{display:flex;justify-content:space-between;align-items:center;margin-top:18px}.empty{padding:48px 0;color:#aeb4af}
    @media(max-width:700px){.compare{grid-template-columns:1fr}header{align-items:flex-start;gap:12px;flex-direction:column}}
  </style>
</head>
<body><main class="shell">
  <header><div><h1>MIDI Difference Review</h1><p>LegacyとRerankerの判断が分かれた区間だけを確認します。</p></div><div class="counter" id="counter"></div></header>
  <section id="root"></section>
  <footer><button class="export" id="previous">前へ</button><button class="export" id="export">レビューをJSONLで書き出す</button><button class="export" id="next">次へ</button></footer>
</main>
<script>
const cases=JSON.parse(decodeURIComponent('${encodedCases}'));
const storageKey='loopvault.midiDifferenceReviews.v1';
const reviews=JSON.parse(localStorage.getItem(storageKey)||'{}');
let index=0;let active=[];
const root=document.getElementById('root');
function render(){
 const item=cases[index];document.getElementById('counter').textContent=cases.length?String(index+1)+' / '+cases.length:'0 / 0';
 if(!item){root.innerHTML='<div class="empty">現在レビューが必要な差分はありません。</div>';return}
 const prior=reviews[item.id];
 root.innerHTML='<article class="review"><div class="meta"><span>'+escapeText(item.id)+'</span><span>Beat '+item.range.startBeat+' - '+item.range.endBeat+'</span><span>Priority '+item.priority.score+'</span></div><div class="compare">'+option('Saved',item.saved.primary)+option('Legacy',item.legacy.primary)+option('Reranker',item.reranker.primary)+'</div><div class="actions">'+button('legacy','Legacyが良い')+button('reranker','Rerankerが良い')+button('both-acceptable','両方許容')+button('neither','どちらも違う')+button('skip','Skip')+'</div><div class="corrected '+(prior?.judgment==='neither'?'visible':'')+'" id="corrected"><input id="correctedInput" placeholder="正しいコード名" value="'+escapeText(prior?.correctedChord||'')+'"><span id="error"></span></div></article>';
 document.querySelectorAll('[data-judgment]').forEach((node)=>{if(node.dataset.judgment===prior?.judgment)node.classList.add('selected');node.onclick=()=>judge(node.dataset.judgment)});
 document.querySelectorAll('[data-play]').forEach((node)=>node.onclick=()=>play(node.dataset.play));
}
function option(name,label){return '<div class="option"><strong>'+name+'</strong><span class="chord">'+escapeText(label)+'</span><button class="play" title="試聴" data-play="'+escapeText(label)+'">▶</button></div>'}
function button(value,label){return '<button data-judgment="'+value+'">'+label+'</button>'}
function judge(judgment){
 const item=cases[index];const corrected=document.getElementById('correctedInput')?.value.trim();
 if(judgment==='neither'&&!corrected){document.getElementById('corrected').classList.add('visible');document.getElementById('error').textContent='コード名を入力してください';return}
 if(corrected&&!/^[A-G](?:#|b)?[^\\s]*$/.test(corrected)){document.getElementById('error').textContent='コード名を確認してください';return}
 reviews[item.id]={schemaVersion:1,id:item.id,sourceFingerprint:item.sourceFingerprint,range:item.range,legacy:item.legacy,reranker:item.reranker,alternatives:[],judgment,...(judgment==='neither'?{correctedChord:corrected}:{}),reviewedAt:new Date().toISOString()};
 localStorage.setItem(storageKey,JSON.stringify(reviews));render();
}
function play(label){stop();const match=/^([A-G](?:#|b)?)([^/]*)/.exec(label);if(!match)return;const pcs={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};const minor=/^m(?!aj)/.test(match[2]);const intervals=minor?[0,3,7]:[0,4,7];const ctx=new AudioContext();const gain=ctx.createGain();gain.gain.setValueAtTime(.16,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+1.2);gain.connect(ctx.destination);active=[ctx];intervals.forEach((interval)=>{const osc=ctx.createOscillator();osc.type='triangle';osc.frequency.value=130.81*Math.pow(2,(pcs[match[1]]+interval)/12);osc.connect(gain);osc.start();osc.stop(ctx.currentTime+1.2);active.push(osc)});}
function stop(){active.forEach((item)=>{try{item.stop?.()}catch{}try{item.close?.()}catch{}});active=[]}
function escapeText(value){return String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
document.getElementById('previous').onclick=()=>{index=Math.max(0,index-1);render()};document.getElementById('next').onclick=()=>{index=Math.min(cases.length-1,index+1);render()};
document.getElementById('export').onclick=()=>{const text=Object.values(reviews).sort((a,b)=>a.id.localeCompare(b.id)).map((item)=>JSON.stringify(item)).join('\\n')+'\\n';const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'application/x-ndjson'}));link.download='difference-reviews.jsonl';link.click();URL.revokeObjectURL(link.href)};render();
</script></body></html>`;
}
