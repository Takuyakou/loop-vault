import {expect,type Page} from '@playwright/test';
import {emptyStore} from '../../src/domain/chordDojo/store';
export interface MidiControl {connect:()=>Promise<void>;emit:(notes:number[],on?:boolean,spread?:number)=>void;disconnect:()=>Promise<void>;plug:()=>Promise<void>;unplug:()=>Promise<void>;pedal:(down:boolean)=>void;}
export async function openDojo(page:Page,mode='midi'){await expect.poll(async () => { try { await page.goto('/?p12='+mode); return true; } catch { console.log('GOTO-RETRY /?p12='+mode); return false; } }, { timeout: 30_000, message: 'the preview server is reachable' }).toBe(true);await page.locator('[data-nav="chord-dojo"]').click();await expect(page.getByTestId('dojo-home')).toBeVisible();if(mode==='midi')await page.evaluate(async()=>{await (window as typeof window&{__p12Midi:MidiControl}).__p12Midi.connect();});}
export async function play(page:Page,notes:number[],spread=30){await page.evaluate(({notes,spread})=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,true,spread),{notes,spread});await expect(page.locator('.dojo-result')).toContainText('合いました');await page.evaluate(notes=>(window as typeof window&{__p12Midi:MidiControl}).__p12Midi.emit(notes,false),notes);}
export async function next(page:Page){await page.getByRole('button',{name:'次へ（Enter）',exact:true}).click();}
export async function seed(page:Page,file:ReturnType<typeof emptyStore>){await page.addInitScript(file=>localStorage.setItem('loop-vault:chord-dojo-txt-jazz-v1:data',JSON.stringify(file)),file);}
/**
 * P23-21 (form C, the lead's instruction): `?p104=…` lands its progressions after the app loads, and the Chord
 * Dojo builds today's plan once, when it is opened. Wait for the fixture BEFORE opening the Dojo, or the plan is
 * made without it. `p104=theme` brings one progression (the Vault count in the left menu shows it).
 */
export async function waitForP104Fixture(page:Page,progressions=1){await expect(page.getByTestId('nav-vault-count')).toHaveText(String(progressions));}
/** P23-24 M2 (form A): the practice is three radios now, not a select. The expectations are unchanged. */
export async function chooseMasterPractice(page:Page,kind:'学習'|'復習'|'Mixed Test'){await page.getByRole('radiogroup',{name:'Masterの練習'}).getByRole('radio',{name:kind}).click();}
