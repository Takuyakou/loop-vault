use serde::{Deserialize, Serialize};

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
    pub status: u8,
    pub channel: u8,
    pub data1: u8,
    pub data2: u8,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawLiveMidiEventBatch {
    pub connection_id: String,
    pub events: Vec<RawLiveMidiEvent>,
}
