use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmProviderId {
    Local,
    Openai,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AdvisorStrategy {
    CloseDevelopment,
    Contrast,
    Experimental,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorChordEvent {
    pub bar: u8,
    pub start_beat: f32,
    pub duration_beats: f32,
    pub chord: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorReferenceContext {
    pub title: Option<String>,
    pub key: Option<String>,
    pub mode: Option<String>,
    pub roman_numerals: Vec<String>,
    pub chord_labels: Vec<String>,
    pub tag_ids: Vec<String>,
    pub verified: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorProgression {
    pub title: Option<String>,
    pub key: Option<String>,
    pub mode: Option<String>,
    pub bpm: Option<f32>,
    pub bars: u16,
    pub time_signature: String,
    pub events: Vec<AdvisorChordEvent>,
    pub roman_numerals: Option<Vec<String>>,
    pub manual_tag_ids: Vec<String>,
    pub derived_tag_ids: Vec<String>,
    pub origin: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorOutputContract {
    pub proposal_count: u8,
    pub bars_per_proposal: u8,
    pub strategies: [AdvisorStrategy; 3],
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorRequest {
    pub schema_version: u8,
    pub progression: AdvisorProgression,
    pub instruction: Option<String>,
    pub output: AdvisorOutputContract,
    pub context: Option<Vec<AdvisorReferenceContext>>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorSuggestion {
    pub id: String,
    pub strategy: AdvisorStrategy,
    pub label: String,
    pub intent: String,
    pub key: Option<String>,
    pub mode: Option<String>,
    pub bars: u8,
    pub time_signature: String,
    pub events: Vec<AdvisorChordEvent>,
    pub suggested_tag_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvisorResponse {
    pub schema_version: u8,
    pub analysis: String,
    pub suggestions: Vec<AdvisorSuggestion>,
    pub suggested_tag_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderHealth {
    pub provider: LlmProviderId,
    pub available: bool,
    pub model: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn suggestion(id: &str, strategy: &str) -> serde_json::Value {
        serde_json::json!({
            "id": id,
            "strategy": strategy,
            "label": id,
            "intent": "intent",
            "key": "C",
            "mode": "major",
            "bars": 8,
            "timeSignature": "4/4",
            "events": [{"bar": 1, "startBeat": 1, "durationBeats": 4, "chord": "Cmaj7"}],
            "suggestedTagIds": []
        })
    }

    fn valid_response_json() -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 1,
            "analysis": "A concise analysis",
            "suggestions": [
                suggestion("close", "close_development"),
                suggestion("contrast", "contrast"),
                suggestion("experimental", "experimental")
            ],
            "suggestedTagIds": []
        })
    }

    #[test]
    fn deserializes_the_public_response_contract() {
        let response: AdvisorResponse = serde_json::from_value(valid_response_json()).unwrap();

        assert_eq!(response.schema_version, 1);
        assert_eq!(response.suggestions.len(), 3);
        assert_eq!(
            response.suggestions[0].strategy,
            AdvisorStrategy::CloseDevelopment
        );
    }

    #[test]
    fn rejects_unknown_response_fields() {
        let mut value = valid_response_json();
        value["secret"] = serde_json::json!("must not pass");

        assert!(serde_json::from_value::<AdvisorResponse>(value).is_err());
    }
}
