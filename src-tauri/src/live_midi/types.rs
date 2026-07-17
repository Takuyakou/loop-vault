use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMidiDevice {
    pub backend_id: String,
    pub name: String,
    pub index: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawLiveMidiEvent {
    pub timestamp_ms: f64,
    pub received_at_ms: f64,
    pub status: u8,
    pub channel: u8,
    pub data1: u8,
    pub data2: u8,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawLiveMidiEventBatch {
    pub connection_id: String,
    pub emitted_at_ms: f64,
    pub events: Vec<RawLiveMidiEvent>,
}

pub fn unix_time_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or_default()
}
