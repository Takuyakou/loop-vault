use super::{
    errors::LlmError,
    provider::LlmProvider,
    retry::{with_retry, with_timeout_and_cancellation, RetryPolicy},
    types::{
        AdvisorRequest, AdvisorResponse, LlmProviderId, ProviderHealth, ProviderResult,
        ProviderUsage,
    },
};
use async_trait::async_trait;
use reqwest::{Response, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const MAX_LOCAL_ERROR_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalLlmSettings {
    pub base_url: String,
    pub model: String,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModel {
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
    prompt_eval_count: Option<u64>,
    eval_count: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OllamaMessage {
    content: String,
}

pub struct LocalLlmProvider {
    client: reqwest::Client,
    settings: LocalLlmSettings,
}

impl LocalLlmProvider {
    pub fn new(client: reqwest::Client, settings: LocalLlmSettings) -> Self {
        Self { client, settings }
    }

    async fn chat(
        &self,
        messages: Value,
        schema: Value,
        cancellation: CancellationToken,
    ) -> Result<(OllamaChatResponse, u8), LlmError> {
        let endpoint = normalize_local_base_url(&self.settings.base_url)?
            .join("api/chat")
            .map_err(|_| LlmError::ProviderNotConfigured)?;
        let body = local_chat_body(&self.settings.model, messages, schema);
        let client = self.client.clone();
        let (response, retries) = with_retry(
            RetryPolicy::local(),
            cancellation,
            move |_| {
                let client = client.clone();
                let endpoint = endpoint.clone();
                let body = body.clone();
                async move {
                    let response = client
                        .post(endpoint)
                        .json(&body)
                        .send()
                        .await
                        .map_err(map_local_transport_error)?;
                    if !response.status().is_success() {
                        return Err(classify_local_http_error(response).await);
                    }
                    response
                        .json::<OllamaChatResponse>()
                        .await
                        .map_err(|_| LlmError::InvalidStructuredOutput)
                }
            },
            |error| matches!(error, LlmError::LocalServerUnavailable),
        )
        .await?;
        Ok((response, retries))
    }
}

#[async_trait]
impl LlmProvider for LocalLlmProvider {
    async fn suggest_progression(
        &self,
        request: AdvisorRequest,
        cancellation: CancellationToken,
    ) -> Result<ProviderResult, LlmError> {
        if self.settings.model.trim().is_empty() {
            return Err(LlmError::ProviderNotConfigured);
        }
        let request_json =
            serde_json::to_string(&request).map_err(|_| LlmError::DomainValidationFailed)?;
        let compatibility_schema = local_advisor_compatibility_json_schema(&request);
        let messages = json!([
            {"role": "system", "content": advisor_system_prompt()},
            {"role": "user", "content": request_json}
        ]);
        let timeout = Duration::from_secs(self.settings.timeout_seconds.clamp(5, 120));
        let operation_cancellation = cancellation.clone();
        with_timeout_and_cancellation(timeout, cancellation, async {
            let (first, first_retries) = self
                .chat(
                    messages,
                    compatibility_schema.clone(),
                    operation_cancellation.clone(),
                )
                .await?;
            let mut retry_count = first_retries;
            let parsed = parse_advisor_content(&first.message.content);
            let (response, usage) = match parsed {
                Ok(response) => (response, usage_from_ollama(&first)),
                Err(_) => {
                    let repair_messages = json!([
                        {"role": "system", "content": advisor_repair_prompt()},
                        {"role": "user", "content": format!("Repair this invalid response:\n{}", first.message.content)}
                    ]);
                    let (repaired, repair_retries) = self
                        .chat(
                            repair_messages,
                            compatibility_schema,
                            operation_cancellation,
                        )
                        .await?;
                    retry_count = retry_count.saturating_add(repair_retries).saturating_add(1);
                    (parse_advisor_content(&repaired.message.content)?, usage_from_ollama(&repaired))
                }
            };
            Ok(ProviderResult { response, usage, retry_count })
        }).await
    }

    async fn test_connection(&self) -> Result<ProviderHealth, LlmError> {
        let models = list_models(
            &self.client,
            &self.settings.base_url,
            self.settings.timeout_seconds,
        )
        .await?;
        if !models.iter().any(|model| model.name == self.settings.model) {
            return Err(LlmError::ModelUnavailable);
        }
        Ok(ProviderHealth {
            provider: LlmProviderId::Local,
            available: true,
            model: Some(self.settings.model.clone()),
            message: None,
        })
    }
}

fn usage_from_ollama(response: &OllamaChatResponse) -> Option<ProviderUsage> {
    let total_tokens = match (response.prompt_eval_count, response.eval_count) {
        (Some(input), Some(output)) => Some(input + output),
        _ => None,
    };
    if response.prompt_eval_count.is_none() && response.eval_count.is_none() {
        return None;
    }
    Some(ProviderUsage {
        input_tokens: response.prompt_eval_count,
        output_tokens: response.eval_count,
        total_tokens,
    })
}

fn local_chat_body(model: &str, messages: Value, schema: Value) -> Value {
    json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "format": schema,
        "think": false,
        "options": { "temperature": 0.2 }
    })
}

fn parse_advisor_content(content: &str) -> Result<AdvisorResponse, LlmError> {
    if content.len() > 128 * 1024 {
        return Err(LlmError::ResponseTooLarge);
    }
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(LlmError::EmptyResponse);
    }
    if let Ok(response) = serde_json::from_str::<AdvisorResponse>(trimmed) {
        return Ok(response);
    }
    let start = trimmed.find('{').ok_or(LlmError::InvalidStructuredOutput)?;
    let end = trimmed
        .rfind('}')
        .ok_or(LlmError::InvalidStructuredOutput)?;
    if end < start {
        return Err(LlmError::InvalidStructuredOutput);
    }
    serde_json::from_str(&trimmed[start..=end]).map_err(|_| LlmError::InvalidStructuredOutput)
}

fn advisor_system_prompt() -> &'static str {
    "You are Loop Vault Progression Advisor. Return exactly three distinct 8-bar 4/4 chord progressions. Use the strategies close_development, contrast, and experimental exactly once each. Cover every beat without overlaps. Use only taxonomy IDs present in the request. Chord labels must use A-G roots with optional # or b, optional slash bass, and only these suffixes: m, dim, aug, maj7, m7, 7, m7b5, dim7, maj9, m9, 9, m11, 13, sus2, sus4, 7sus4, add9, 6, m6, 6/9. Optional tensions are b9, #9, 11, #11, b13, and 13. Do not use parentheses, alt, omit, or no3 notation. Return JSON only."
}

fn advisor_repair_prompt() -> &'static str {
    "Return only corrected JSON matching the supplied schema. Use common chord labels supported by Loop Vault. Do not use parentheses, alt, omit, or no3 notation. Do not add prose or markdown."
}

pub fn advisor_response_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["schemaVersion", "analysis", "suggestions", "suggestedTagIds"],
        "properties": {
            "schemaVersion": {"type": "integer", "const": 1},
            "analysis": {"type": "string", "maxLength": 2000},
            "suggestedTagIds": {"type": "array", "items": {"type": "string"}},
            "suggestions": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id", "strategy", "label", "intent", "key", "mode", "bars", "timeSignature", "events", "suggestedTagIds"],
                    "properties": {
                        "id": {"type": "string"},
                        "strategy": {"type": "string", "enum": ["close_development", "contrast", "experimental"]},
                        "label": {"type": "string", "maxLength": 80},
                        "intent": {"type": "string", "maxLength": 500},
                        "key": {"type": ["string", "null"]},
                        "mode": {"type": ["string", "null"]},
                        "bars": {"type": "integer", "const": 8},
                        "timeSignature": {"type": "string", "const": "4/4"},
                        "suggestedTagIds": {"type": "array", "items": {"type": "string"}},
                        "events": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["bar", "startBeat", "durationBeats", "chord"],
                                "properties": {
                                    "bar": {"type": "integer", "minimum": 1, "maximum": 8},
                                    "startBeat": {"type": "number"},
                                    "durationBeats": {"type": "number"},
                                    "chord": {"type": "string"}
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn local_advisor_compatibility_json_schema(request: &AdvisorRequest) -> Value {
    let mut schema: Value =
        serde_json::from_str(include_str!("local_advisor_compatibility_schema.json"))
            .expect("bundled local advisor compatibility schema must be valid JSON");
    let mut allowed_tag_ids = request.progression.manual_tag_ids.clone();
    allowed_tag_ids.extend(request.progression.derived_tag_ids.iter().cloned());
    for reference in request.context.iter().flatten() {
        allowed_tag_ids.extend(reference.tag_ids.iter().cloned());
    }
    allowed_tag_ids.sort();
    allowed_tag_ids.dedup();

    let tag_array_schema = if allowed_tag_ids.is_empty() {
        json!({
            "type": "array",
            "maxItems": 0,
            "items": { "type": "string" }
        })
    } else {
        json!({
            "type": "array",
            "maxItems": allowed_tag_ids.len().min(24),
            "items": { "type": "string", "enum": allowed_tag_ids }
        })
    };
    schema["properties"]["suggestedTagIds"] = tag_array_schema.clone();
    schema["properties"]["suggestions"]["items"]["properties"]["suggestedTagIds"] =
        tag_array_schema;
    schema
}

pub fn normalize_local_base_url(value: &str) -> Result<Url, LlmError> {
    let mut url = Url::parse(value.trim()).map_err(|_| LlmError::ProviderNotConfigured)?;
    let local_host = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if !local_host || !matches!(url.scheme(), "http" | "https") {
        return Err(LlmError::ProviderNotConfigured);
    }
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

pub async fn list_models(
    client: &reqwest::Client,
    base_url: &str,
    timeout_seconds: u64,
) -> Result<Vec<LocalLlmModel>, LlmError> {
    let endpoint = normalize_local_base_url(base_url)?
        .join("api/tags")
        .map_err(|_| LlmError::ProviderNotConfigured)?;
    let response = client
        .get(endpoint)
        .timeout(Duration::from_secs(timeout_seconds.clamp(1, 120)))
        .send()
        .await
        .map_err(map_local_transport_error)?;

    if !response.status().is_success() {
        return Err(classify_local_http_error(response).await);
    }

    let payload = response
        .json::<OllamaTagsResponse>()
        .await
        .map_err(|_| LlmError::InvalidStructuredOutput)?;
    let mut models = payload
        .models
        .into_iter()
        .map(|model| LocalLlmModel { name: model.name })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.name.cmp(&right.name));
    models.dedup_by(|left, right| left.name == right.name);
    Ok(models)
}

pub(crate) fn map_local_transport_error(error: reqwest::Error) -> LlmError {
    if error.is_timeout() {
        LlmError::Timeout
    } else {
        LlmError::LocalServerUnavailable
    }
}

async fn classify_local_http_error(response: Response) -> LlmError {
    let status = response.status();
    let body = if status == StatusCode::BAD_REQUEST {
        read_bounded_error_body(response).await
    } else {
        Vec::new()
    };
    classify_local_status(status, &body)
}

fn classify_local_status(status: StatusCode, body: &[u8]) -> LlmError {
    match status {
        StatusCode::NOT_FOUND => LlmError::ModelNotFound,
        StatusCode::BAD_REQUEST if contains_grammar_parse_failure(body) => {
            LlmError::StructuredOutputUnsupported
        }
        StatusCode::BAD_REQUEST => LlmError::ProviderBadRequest,
        status if status.is_server_error() => LlmError::LocalServerUnavailable,
        _ => LlmError::ProviderBadRequest,
    }
}

async fn read_bounded_error_body(mut response: Response) -> Vec<u8> {
    let mut body = Vec::new();
    while body.len() < MAX_LOCAL_ERROR_BYTES {
        let Ok(Some(chunk)) = response.chunk().await else {
            break;
        };
        let remaining = MAX_LOCAL_ERROR_BYTES - body.len();
        body.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
        if chunk.len() >= remaining {
            break;
        }
    }
    body
}

fn contains_grammar_parse_failure(body: &[u8]) -> bool {
    if body.is_empty() {
        return false;
    }
    let Ok(value) = serde_json::from_slice::<Value>(body) else {
        return false;
    };
    value_contains_grammar_failure(&value, 0)
}

fn value_contains_grammar_failure(value: &Value, depth: u8) -> bool {
    if depth > 3 {
        return false;
    }
    match value {
        Value::String(message) => {
            let normalized = message.to_ascii_lowercase();
            if normalized.contains("failed to parse grammar")
                || (normalized.contains("failed to initialize samplers")
                    && normalized.contains("grammar"))
            {
                return true;
            }
            serde_json::from_str::<Value>(message)
                .ok()
                .is_some_and(|nested| value_contains_grammar_failure(&nested, depth + 1))
        }
        Value::Array(values) => values
            .iter()
            .any(|item| value_contains_grammar_failure(item, depth + 1)),
        Value::Object(values) => values
            .values()
            .any(|item| value_contains_grammar_failure(item, depth + 1)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::types::{AdvisorOutputContract, AdvisorProgression, AdvisorStrategy};

    fn request_with_tags(tag_ids: Vec<String>) -> AdvisorRequest {
        AdvisorRequest {
            schema_version: 1,
            progression: AdvisorProgression {
                title: None,
                key: None,
                mode: None,
                bpm: None,
                bars: 1,
                time_signature: "4/4".to_owned(),
                events: vec![],
                roman_numerals: None,
                manual_tag_ids: tag_ids,
                derived_tag_ids: vec![],
                origin: None,
            },
            instruction: None,
            output: AdvisorOutputContract {
                proposal_count: 3,
                bars_per_proposal: 8,
                strategies: [
                    AdvisorStrategy::CloseDevelopment,
                    AdvisorStrategy::Contrast,
                    AdvisorStrategy::Experimental,
                ],
            },
            context: None,
        }
    }

    #[test]
    fn accepts_only_loopback_local_provider_urls() {
        assert!(normalize_local_base_url("http://127.0.0.1:11434").is_ok());
        assert!(normalize_local_base_url("http://localhost:11434/path?secret=1").is_ok());
        assert_eq!(
            normalize_local_base_url("https://example.com").unwrap_err(),
            LlmError::ProviderNotConfigured
        );
    }

    #[test]
    fn extracts_structured_json_from_markdown_or_leading_prose() {
        let response =
            json!({"schemaVersion":1,"analysis":"ok","suggestions":[],"suggestedTagIds":[]})
                .to_string();
        assert!(parse_advisor_content(&format!("```json\n{response}\n```")).is_ok());
        assert!(parse_advisor_content(&format!("Here is the result: {response}")).is_ok());
    }

    #[test]
    fn recognizes_direct_and_nested_ollama_grammar_errors() {
        let direct = br#"{"error":"Failed to initialize samplers: failed to parse grammar"}"#;
        let nested = br#"{"error":"{\"error\":{\"message\":\"Failed to initialize samplers: failed to parse grammar\"}}"}"#;

        assert!(contains_grammar_parse_failure(direct));
        assert!(contains_grammar_parse_failure(nested));
        assert!(!contains_grammar_parse_failure(
            br#"{"error":"model is missing"}"#
        ));
        assert!(!contains_grammar_parse_failure(b"not-json"));
    }

    #[test]
    fn local_schema_limits_tags_to_ids_present_in_the_request() {
        let schema = local_advisor_compatibility_json_schema(&request_with_tags(vec![
            "mood.dreamy".to_owned(),
            "use.variation".to_owned(),
        ]));
        let top_level = &schema["properties"]["suggestedTagIds"];
        let suggestion =
            &schema["properties"]["suggestions"]["items"]["properties"]["suggestedTagIds"];

        assert_eq!(
            top_level["items"]["enum"],
            json!(["mood.dreamy", "use.variation"])
        );
        assert_eq!(suggestion, top_level);
        assert!(schema.get("additionalProperties").is_none());
    }

    #[test]
    fn local_schema_requires_empty_tag_arrays_when_no_tags_are_available() {
        let schema = local_advisor_compatibility_json_schema(&request_with_tags(vec![]));
        assert_eq!(schema["properties"]["suggestedTagIds"]["maxItems"], 0);
    }

    #[test]
    fn local_chat_disables_thinking_after_quality_comparison() {
        let body = local_chat_body("model", json!([]), json!({"type": "object"}));
        assert_eq!(body["think"], false);
        assert_eq!(body["stream"], false);
    }

    #[test]
    fn local_prompt_limits_chords_to_the_supported_notation() {
        assert!(advisor_system_prompt().contains("Do not use parentheses, alt, omit, or no3"));
        assert!(advisor_repair_prompt().contains("Do not use parentheses, alt, omit, or no3"));
    }

    #[test]
    fn classifies_local_http_statuses_without_retrying_bad_requests() {
        let grammar = br#"{"error":"Failed to initialize samplers: failed to parse grammar"}"#;
        assert_eq!(
            classify_local_status(StatusCode::BAD_REQUEST, grammar),
            LlmError::StructuredOutputUnsupported
        );
        assert_eq!(
            classify_local_status(StatusCode::BAD_REQUEST, br#"{"error":"bad option"}"#),
            LlmError::ProviderBadRequest
        );
        assert_eq!(
            classify_local_status(StatusCode::NOT_FOUND, b""),
            LlmError::ModelNotFound
        );
        assert_eq!(
            classify_local_status(StatusCode::INTERNAL_SERVER_ERROR, b""),
            LlmError::LocalServerUnavailable
        );
    }
}
