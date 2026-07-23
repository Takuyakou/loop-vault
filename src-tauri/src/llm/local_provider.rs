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
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

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
        cancellation: CancellationToken,
    ) -> Result<(OllamaChatResponse, u8), LlmError> {
        let endpoint = normalize_local_base_url(&self.settings.base_url)?
            .join("api/chat")
            .map_err(|_| LlmError::ProviderNotConfigured)?;
        let body = json!({
            "model": self.settings.model,
            "messages": messages,
            "stream": false,
            "format": advisor_response_json_schema(),
            "options": { "temperature": 0.2 }
        });
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
                    if response.status().as_u16() == 404 {
                        return Err(LlmError::ModelUnavailable);
                    }
                    if response.status().is_server_error() {
                        return Err(LlmError::Provider5xx);
                    }
                    if !response.status().is_success() {
                        return Err(LlmError::LocalServerUnavailable);
                    }
                    response
                        .json::<OllamaChatResponse>()
                        .await
                        .map_err(|_| LlmError::InvalidStructuredOutput)
                }
            },
            |error| {
                matches!(
                    error,
                    LlmError::Network | LlmError::LocalServerUnavailable | LlmError::Provider5xx
                )
            },
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
        let messages = json!([
            {"role": "system", "content": advisor_system_prompt()},
            {"role": "user", "content": request_json}
        ]);
        let timeout = Duration::from_secs(self.settings.timeout_seconds.clamp(5, 120));
        let operation_cancellation = cancellation.clone();
        with_timeout_and_cancellation(timeout, cancellation, async {
            let (first, first_retries) = self.chat(messages, operation_cancellation.clone()).await?;
            let mut retry_count = first_retries;
            let parsed = parse_advisor_content(&first.message.content);
            let (response, usage) = match parsed {
                Ok(response) => (response, usage_from_ollama(&first)),
                Err(_) => {
                    let repair_messages = json!([
                        {"role": "system", "content": "Return only JSON matching the supplied schema. Do not add prose or markdown."},
                        {"role": "user", "content": format!("Repair this invalid response:\n{}", first.message.content)}
                    ]);
                    let (repaired, repair_retries) = self.chat(repair_messages, operation_cancellation).await?;
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
    "You are Loop Vault Progression Advisor. Return exactly three distinct 8-bar 4/4 chord progressions. Use the strategies close_development, contrast, and experimental exactly once each. Cover every beat without overlaps. Use only taxonomy IDs present in the request. Return JSON only."
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
        return Err(if response.status().is_server_error() {
            LlmError::Provider5xx
        } else {
            LlmError::LocalServerUnavailable
        });
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
    } else if error.is_connect() {
        LlmError::LocalServerUnavailable
    } else {
        LlmError::Network
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
