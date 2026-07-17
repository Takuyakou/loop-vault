use midir::MidiInput;

use super::types::LiveMidiDevice;

pub fn list_devices() -> Result<Vec<LiveMidiDevice>, String> {
    let input = MidiInput::new("Loop Vault Live MIDI discovery")
        .map_err(|error| format!("MIDI入力を初期化できませんでした: {error}"))?;

    input
        .ports()
        .iter()
        .enumerate()
        .map(|(index, port)| {
            let name = input
                .port_name(port)
                .map_err(|error| format!("MIDIデバイス名を取得できませんでした: {error}"))?;
            Ok(LiveMidiDevice {
                backend_id: format!("midir:{index}:{name}"),
                name,
                index,
            })
        })
        .collect()
}
