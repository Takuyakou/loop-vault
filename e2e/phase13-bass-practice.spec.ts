import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeMidi, type MidiEvent } from "midi-file";
import { openApp, assertNoHorizontalOverflow, openBassPractice } from "./helpers/app";
function publicBassFixture(){const notes:MidiEvent[]=[{deltaTime:0,type:"trackName",text:"Public bass fixture"},{deltaTime:0,type:"programChange",channel:0,programNumber:32}];for(const pitch of [28,33,38,28]){notes.push({deltaTime:0,type:"noteOn",channel:0,noteNumber:pitch,velocity:90},{deltaTime:240,type:"noteOff",channel:0,noteNumber:pitch,velocity:0},{deltaTime:240,type:"text",text:"beat"});}notes.push({deltaTime:0,type:"endOfTrack"});return Buffer.from(writeMidi({header:{format:1,numTracks:2,ticksPerBeat:480},tracks:[[{deltaTime:0,type:"setTempo",microsecondsPerBeat:500000},{deltaTime:0,type:"timeSignature",numerator:4,denominator:4,metronome:24,thirtyseconds:8},{deltaTime:0,type:"endOfTrack"}],notes]}));}
async function openBass(page:Page){await openApp(page);await page.locator('[data-nav="bass-practice"]').click();await expect(page.locator("[data-testid='bass-home-card'][data-mode='midi']")).toBeVisible();}
async function importBass(page:Page){await openBass(page);await openBassPractice(page, "MIDI のベースライン");await page.getByRole("button",{name:"＋ MIDI を読み込む"}).click();await page.getByLabel("MIDIファイル",{exact:true}).setInputFiles({name:"public-bass.mid",mimeType:"audio/midi",buffer:publicBassFixture()});await page.getByLabel("曲名",{exact:true}).fill("公開合成ベース");await page.getByRole("button",{name:"保存して練習する"}).click();await expect(page.getByTestId("midi-bass-practice")).toBeVisible();}
const readLibrary=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem("loop-vault:bass-midi-library-v1:data")??"null"));
/** P23-62/P23-63: 度数・リズム・ルートの動き・コード進行のベース draw the shared stage (1 聴く → 2 弾く → 3 結果). */
const STAGE_VIEWS:Readonly<Partial<Record<string,string>>>={度数:"degree-echo-view",リズム:"rhythm-echo-view","ルートの動き":"root-motion-echo-view","コード進行のベース":"bassline-echo-view"};
test("MIDI import, independent round trip, favorite/rename/search and confirmed delete",async({page})=>{
 await importBass(page);await expect(page.getByLabel("MIDI練習テンポ").getByRole("radio",{name:"100%",exact:true})).toBeChecked();await page.getByLabel("MIDI練習テンポ").getByRole("radio",{name:"80%",exact:true}).click();await expect.poll(async()=> (await readLibrary(page))?.settings.defaultTempoPercent).toBe(80);
 await page.getByRole("button",{name:"一覧へ",exact:true}).click();await page.getByRole("button",{name:"公開合成ベース お気に入り",exact:true}).click();await expect.poll(async()=> (await readLibrary(page))?.songs[0].favorite).toBe(true);
 await page.getByLabel("公開合成ベース 操作",{exact:true}).click();await page.getByLabel("新しい曲名").fill("名前を変更");await page.getByRole("button",{name:"変更",exact:true}).click();await expect.poll(async()=> (await readLibrary(page))?.songs[0].title).toBe("名前を変更");
 await page.reload();await page.locator('[data-nav="bass-practice"]').click();await openBassPractice(page, "MIDI のベースライン");await page.getByLabel("曲名で探す").fill("名前を変更");await expect(page.getByRole("button",{name:"名前を変更",exact:true})).toBeVisible();await page.getByLabel("名前を変更 操作",{exact:true}).click();page.once("dialog",dialog=>dialog.dismiss());await page.getByRole("button",{name:"削除…",exact:true}).click();expect((await readLibrary(page)).songs).toHaveLength(1);page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"削除…",exact:true}).click();await expect.poll(async()=> (await readLibrary(page))?.songs.length).toBe(0);
});
test("five practice views share a responsive frame and preserve legacy controls",async({page},info)=>{
 for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:960,height:1032},{width:768,height:640}]){
  await page.setViewportSize(size);await openBass(page);
  for(const mode of ["度数","リズム","コード進行のベース","ルートの動き"]){
   await openBassPractice(page, mode);await assertNoHorizontalOverflow(page);await expect(page.locator(".bass-echo-frame:visible")).toHaveCount(1);
   const stageView=STAGE_VIEWS[mode];
   if(stageView){
    // P23-62/P23-63: every Echo practice is one stage frame — the 3 steps, the お手本/自分 lane and the keys at the
    // foot, in a single column. The old 6-step flow and the right column (セッション / この 7 日) are gone.
    const stage=page.getByTestId(stageView);
    await expect(stage).toBeVisible();
    await expect(page.locator(".bass-echo-frame:visible")).toHaveAttribute("data-rail","false");
    await expect(stage.locator(".bp-frame-scroll")).toBeVisible();
    expect(await stage.locator(".bp-step").evaluateAll(steps=>steps.map(step=>(step.textContent??"").trim()))).toEqual(["1聴く","2弾く","3結果"]);
    await expect(stage.locator("[data-testid='bp-lane']")).toHaveCount(1);
    await expect(stage.locator(".bp-foot")).toBeVisible();
    await expect(page.locator(".bass-echo-rail:visible")).toHaveCount(0);
   }else{
    await expect(page.getByTestId("midi-bass-library")).toBeVisible();
   }
   await page.screenshot({path:info.outputPath(`${stageView??"bassline-echo-view"}-${size.width}.png`),fullPage:true});
  }
  await openBassPractice(page, "MIDI のベースライン");await expect(page.getByTestId("midi-bass-library")).toBeVisible();
 }
});
test("MIDI practice geometry, accessible import, shortcuts and four-resolution screenshots",async({page},info)=>{
 await importBass(page);await page.getByLabel("弦とフレットを出す").click();await expect(page.getByTestId("midi-bass-practice").getByTestId("bp-fretboard")).toBeVisible();
 // P23-62/P23-64: the hidden stages keep their own 「お手本の段」 lanes too, so name the MIDI practice's lane explicitly.
 for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:960,height:1032},{width:768,height:640}]){
  await page.setViewportSize(size);await assertNoHorizontalOverflow(page);
  const view=page.getByTestId("midi-bass-practice");
  await expect(view.getByLabel("お手本の段",{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath(`midi-practice-${size.width}.png`),fullPage:true});
  if(size.width>=1440){
   const g=await page.locator(".bass-echo-frame:visible").evaluate(el=>{const r=el.getBoundingClientRect();return {bottom:r.bottom,height:r.height};});
   expect(g.bottom).toBeLessThanOrEqual(size.height+1);expect(g.height).toBeGreaterThan(300);
   const actions=await view.locator(".bp-actions").boundingBox();
   expect(actions!.y+actions!.height).toBeLessThanOrEqual(size.height+1);
  }else{
   await view.locator(".bp-actions").scrollIntoViewIfNeeded();
   await expect(view.getByTestId("midi-listen")).toBeInViewport();
   await expect(view.getByTestId("midi-record")).toBeInViewport();
   await expect(page.getByTestId("midi-judge-conditions")).toBeVisible();
  }
 }
 const accessibility=await new AxeBuilder({page:page as never}).withTags(["wcag2a","wcag2aa"]).analyze();expect(accessibility.violations.filter(v=>v.impact==="serious"||v.impact==="critical")).toEqual([]);
 await page.setViewportSize({width:1440,height:900});await page.getByRole("button",{name:"一覧へ",exact:true}).click();await page.getByRole("button",{name:"＋ MIDI を読み込む"}).click();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByRole("button",{name:"＋ MIDI を読み込む"})).toBeFocused();
});
/** Synthetic microphone drives real WebAudio routing, MediaRecorder, decoding and worker analysis.
 * Resume the input clock before returning the stream so count-in warms the graph;
 * starting a suspended fixture clock at MediaRecorder.start can corrupt its first attack. */
test("record completion analyses locally, cancellation makes no attempt, Keep is explicit",async({page})=>{
 test.setTimeout(45000);
 await page.addInitScript(()=>{
  localStorage.setItem("loop-vault:bass-practice-record-channel:v1","left");
  const fixtureContexts:AudioContext[]=[];let fixtureStart=()=>{};
  Object.defineProperty(navigator.mediaDevices,"getUserMedia",{value:async()=>{const context=new AudioContext();fixtureContexts.push(context);const destination=context.createMediaStreamDestination();fixtureStart=()=>{const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*2.2),context.sampleRate);const pcm=buffer.getChannelData(0);for(let i=0;i<4;i++){const pitch=[28,33,38,28][i],start=Math.round((.1+i*.5)*context.sampleRate),len=Math.round(.25*context.sampleRate);for(let j=0;j<len;j++)pcm[start+j]=.25*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*j/context.sampleRate)*Math.min(1,j/100,(len-j)/100);}const source=context.createBufferSource();source.buffer=buffer;source.connect(destination);source.start();};await context.resume();return destination.stream;}});
  const Original=MediaRecorder;globalThis.MediaRecorder=class extends Original{override start(timeslice?:number){super.start(timeslice);fixtureStart();}};
 });
 await importBass(page);const view=page.getByTestId("midi-bass-practice");
 await view.getByRole("button",{name:"● 録って弾く",exact:true}).click();
 await expect(view).toHaveAttribute("data-stage-step","1");
 // P25 V45: whether the judge reads the four notes is checked with fixed audio in analysis.fixture.test.ts; the live chain here only has to finish with a result.
 await expect(page.getByTestId("midi-bass-result")).toContainText(/[0-4] \/ 4/,{timeout:15000});
 await expect.poll(async()=> (await readLibrary(page))?.songs[0].attempts.length).toBe(1);
 const keepBtn=page.getByTestId("midi-keep-take");
 await expect(keepBtn).toBeEnabled();await expect(keepBtn).toHaveText("録音を残す");
 await keepBtn.click();await expect(keepBtn).toBeDisabled();await expect(keepBtn).toHaveText("残しました");
 await view.getByRole("button",{name:"● もう一度",exact:true}).click();
 await expect(view).toHaveAttribute("data-stage-step","1");
 await page.keyboard.press("Escape");
 await expect(view).toHaveAttribute("data-stage-step","0");
 await expect(view).toContainText("途中で止めたため");
 expect((await readLibrary(page)).songs[0].attempts).toHaveLength(1);
 await page.locator('[data-nav="home"]').click();await expect(page.locator("body")).toContainText("Bass Practice");
});
