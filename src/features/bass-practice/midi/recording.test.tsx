// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { RecordCompareSection, type MidiRecordingCommands } from "../recording/ui/RecordCompareSection";
import { RecordingSessionController } from "../recording/application/recordingSessionController";
import { FakeRecordingCapability, FakeCaptureDeviceRepository, FakePracticeRecorder, InMemoryRecordingTakeRepository } from "../recording/application/fakes";
import { setRecordChannel } from "../recording/application/recordChannelStore";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();localStorage.clear();});
for(const cancel of [false,true]) test(cancel?"MIDI cancel never invokes analysis":"MIDI completion invokes analysis once, only after auto-stop, without keeping audio",async()=>{
 vi.useFakeTimers();setRecordChannel("mono-sum");const recorder=new FakePracticeRecorder(),takes=new InMemoryRecordingTakeRepository();const controller=new RecordingSessionController({capability:FakeRecordingCapability.available(),devices:new FakeCaptureDeviceRepository(),recorder,takes},"mono-sum");const completed=vi.fn(),canceled=vi.fn(),commands:{current:MidiRecordingCommands|null}={current:null};const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<RecordCompareSection mode="midi-bassline" enabledOverride controller={controller} isTypeSupported={()=>true} countInMs={1000} midiRecording={{durationMs:2000,commands,startOffsetMs:()=>100,onCompleted:completed,onCanceled:canceled}} />));
 await act(async()=>{commands.current?.start();await Promise.resolve();});expect(controller.getState().status).toBe("counting-in");expect(completed).not.toHaveBeenCalled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(controller.getState().status).toBe("recording");
 if(cancel)await act(async()=>commands.current?.stop());
 await act(async()=>{await vi.advanceTimersByTimeAsync(2099);});expect(completed).not.toHaveBeenCalled();await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(completed).toHaveBeenCalledTimes(cancel?0:1);expect(await takes.list()).toEqual([]);expect(recorder.active).toBe(false);await act(async()=>root.unmount());
});
test("unmount during count-in cancels every delayed start",async()=>{vi.useFakeTimers();setRecordChannel("mono-sum");const recorder=new FakePracticeRecorder();const controller=new RecordingSessionController({capability:FakeRecordingCapability.available(),devices:new FakeCaptureDeviceRepository(),recorder,takes:new InMemoryRecordingTakeRepository()},"mono-sum");const commands:{current:MidiRecordingCommands|null}={current:null};const completed=vi.fn();const host=document.createElement("div"),root=createRoot(host);await act(async()=>root.render(<RecordCompareSection mode="midi-bassline" enabledOverride controller={controller} countInMs={1000} midiRecording={{durationMs:2000,commands,onCompleted:completed,onCanceled:()=>undefined}} />));await act(async()=>{commands.current?.start();await Promise.resolve();});await act(async()=>root.unmount());await vi.advanceTimersByTimeAsync(4000);expect(recorder.startCount).toBe(0);expect(completed).not.toHaveBeenCalled();expect(commands.current).toBeNull();});
