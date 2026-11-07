import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openSyntheticBass, syntheticMicrophone, syntheticBassMidi } from "../../e2e/helpers/bass-ui";
const out=join(process.cwd(),"p89-generated",process.env.P89_SCREENS_NAME??"P13.1-01");
const results:{size:string;captured:string[];overflow:Record<string,number>}[]=[];
for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[960,1032],[768,640]])test(`P13.1 screens ${width}x${height}`,async({page,context})=>{
  await page.setViewportSize({width,height});mkdirSync(out,{recursive:true});
  const result={size:`${width}x${height}`,captured:[] as string[],overflow:{} as Record<string,number>};results.push(result);
  const shot=async(name:string,target=page)=>{
    await target.mouse.move(16,16);await target.evaluate(()=>document.fonts.ready);
    const overflow=await target.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
    result.overflow[name]=overflow;expect(overflow).toBe(0);
    await target.screenshot({path:join(out,`${name}@${width}x${height}.png`),animations:"disabled",fullPage:true});result.captured.push(name);
  };
  await syntheticMicrophone(page,true);await openSyntheticBass(page,true,2);await shot("listen-2-bars");
  await page.getByRole("radiogroup",{name:"区間の長さ",exact:true}).getByRole("radio",{name:"全部",exact:true}).click();
  await page.getByRole("button",{name:"弦とフレットを出す",exact:true}).click();await shot("all-fret-on");
  await page.getByRole("button",{name:"弦とフレットを出す",exact:true}).click();
  await page.getByRole("radiogroup",{name:"区間の長さ",exact:true}).getByRole("radio",{name:"2",exact:true}).click();
  await page.getByTestId("midi-bass-practice").getByRole("button",{name:"● 録って弾く（R）",exact:true}).click();
  await expect(page.getByTestId("record-compare").filter({visible:true})).toHaveAttribute("data-record-state","recording",{timeout:6000});await shot("recording");
  await expect(page.getByTestId("midi-bass-result")).toBeVisible({timeout:15000});if(width<1100) await page.getByTestId("midi-bass-result").scrollIntoViewIfNeeded();await shot("result");
  await page.getByRole("button",{name:"一覧へ",exact:true}).click();await shot("library-two");
  await page.getByRole("button",{name:"＋ MIDI を読み込む",exact:true}).click();
  await page.getByLabel("MIDIファイル",{exact:true}).setInputFiles({name:"public-synthetic.mid",mimeType:"audio/midi",buffer:syntheticBassMidi()});await shot("import");
  await page.getByRole("button",{name:"やめる",exact:true}).click();
  for(const mode of ["Degree Echo","Rhythm Echo","Bassline Echo","Root Motion Echo"]){await page.getByRole("tab",{name:mode,exact:true}).click();await shot(mode.replaceAll(" ","-"));}
  const empty=await context.newPage();await empty.setViewportSize({width,height});await openSyntheticBass(empty,true,0);await shot("library-empty",empty);await empty.close();
  writeFileSync(join(out,"manifest.json"),JSON.stringify({expected:55,captured:results.reduce((n,r)=>n+r.captured.length,0),results},null,2)+"\n");
});
