use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::Receiver,
        Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use tauri::{AppHandle, Emitter};

use super::types::{unix_time_ms, RawLiveMidiEvent, RawLiveMidiEventBatch};

pub const LIVE_MIDI_BATCH_EVENT: &str = "live-midi-event-batch";

pub fn spawn_batch_worker(
    app: AppHandle,
    connection_id: String,
    receiver: Receiver<RawLiveMidiEvent>,
    stop: Arc<AtomicBool>,
) -> JoinHandle<()> {
    thread::spawn(move || loop {
        let mut events = Vec::new();
        match receiver.recv_timeout(Duration::from_millis(10)) {
            Ok(event) => events.push(event),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        while let Ok(event) = receiver.try_recv() {
            events.push(event);
        }

        if !events.is_empty() {
            let _ = app.emit(
                LIVE_MIDI_BATCH_EVENT,
                RawLiveMidiEventBatch {
                    connection_id: connection_id.clone(),
                    emitted_at_ms: unix_time_ms(),
                    events,
                },
            );
        }

        if stop.load(Ordering::Acquire) && receiver.try_recv().is_err() {
            break;
        }
    })
}
