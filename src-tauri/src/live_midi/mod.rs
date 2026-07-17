pub mod commands;
mod connection;
mod device_service;
mod event_batch;
mod types;

use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use connection::ActiveLiveMidiConnection;
use tauri::AppHandle;
use types::LiveMidiDevice;

#[derive(Default)]
pub struct LiveMidiState {
    active: Mutex<Option<ActiveLiveMidiConnection>>,
    next_connection_id: AtomicU64,
}

impl LiveMidiState {
    fn open(&self, app: AppHandle, device: LiveMidiDevice) -> Result<String, String> {
        self.close();
        let sequence = self.next_connection_id.fetch_add(1, Ordering::Relaxed) + 1;
        let connection_id = format!("live-midi-{sequence}");
        let connection = ActiveLiveMidiConnection::open(app, &device, connection_id.clone())?;
        let mut active = self
            .active
            .lock()
            .map_err(|_| "MIDI接続状態を取得できませんでした。")?;
        *active = Some(connection);
        Ok(connection_id)
    }

    fn close(&self) {
        if let Ok(mut active) = self.active.lock() {
            active.take();
        }
    }
}
