use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread::JoinHandle,
    time::Instant,
};

use midir::{Ignore, MidiInput, MidiInputConnection};
use tauri::AppHandle;

use super::{
    event_batch::spawn_batch_worker,
    types::{unix_time_ms, LiveMidiDevice, RawLiveMidiEvent},
};

pub struct ActiveLiveMidiConnection {
    connection: Option<MidiInputConnection<()>>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl ActiveLiveMidiConnection {
    pub fn open(
        app: AppHandle,
        device: &LiveMidiDevice,
        connection_id: String,
    ) -> Result<Self, String> {
        let mut input = MidiInput::new("Loop Vault Live MIDI")
            .map_err(|error| format!("MIDI入力を初期化できませんでした: {error}"))?;
        input.ignore(Ignore::None);
        let ports = input.ports();
        let port = ports
            .get(device.index)
            .ok_or_else(|| "選択したMIDIデバイスが見つかりません。".to_string())?;
        let actual_name = input
            .port_name(port)
            .map_err(|error| format!("MIDIデバイス名を取得できませんでした: {error}"))?;
        if actual_name != device.name {
            return Err("MIDIデバイス一覧が変わりました。もう一度選択してください。".to_string());
        }

        let (sender, receiver) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let worker = spawn_batch_worker(app, connection_id.clone(), receiver, stop.clone());
        let started_at = Instant::now();
        let connection = input
            .connect(
                port,
                "Loop Vault Live MIDI input",
                move |_midir_timestamp, message, _| {
                    if let Some(event) =
                        normalize_message(
                            started_at.elapsed().as_secs_f64() * 1000.0,
                            unix_time_ms(),
                            message,
                        )
                    {
                        let _ = sender.send(event);
                    }
                },
                (),
            )
            .map_err(|error| format!("MIDIデバイスを開けませんでした: {error}"))?;

        Ok(Self {
            connection: Some(connection),
            stop,
            worker: Some(worker),
        })
    }
}

impl Drop for ActiveLiveMidiConnection {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        self.connection.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn normalize_message(
    timestamp_ms: f64,
    received_at_ms: f64,
    message: &[u8],
) -> Option<RawLiveMidiEvent> {
    let status_byte = *message.first()?;
    if !(0x80..=0xef).contains(&status_byte) {
        return None;
    }

    Some(RawLiveMidiEvent {
        timestamp_ms,
        received_at_ms,
        status: status_byte & 0xf0,
        channel: status_byte & 0x0f,
        data1: message.get(1).copied().unwrap_or(0),
        data2: message.get(2).copied().unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::normalize_message;

    #[test]
    fn normalizes_channel_messages_and_ignores_system_messages() {
        let event = normalize_message(12.5, 1_000.0, &[0x92, 60, 100]).expect("note event");
        assert_eq!(event.status, 0x90);
        assert_eq!(event.channel, 2);
        assert_eq!(event.data1, 60);
        assert_eq!(event.data2, 100);
        assert_eq!(event.received_at_ms, 1_000.0);
        assert!(normalize_message(0.0, 1_001.0, &[0xf8]).is_none());
    }
}
