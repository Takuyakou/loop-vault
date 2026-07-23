use super::{
    errors::LlmError,
    local_provider::advisor_response_json_schema,
    provider::LlmProvider,
    retry::with_timeout_and_cancellation,
    types::{
        AdvisorRequest, AdvisorResponse, LlmProviderId, ProviderHealth, ProviderResult,
        ProviderUsage,
    },
};
use async_trait::async_trait;
use reqwest::{header::RETRY_AFTER, StatusCode, Url};
use serde_json::{json, Value};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const RESPONSES_URL: &str = "https://api.openai.com/v1/responses";
const MODELS_URL: &str = "https://api.openai.com/v1/models/";
const MAX_RESPONSE_BYTES: usize = 128 * 1024;

pub struct OpenAiProvider {
    client: reqwest::Client,
    model: String,
    api_key: String,
    timeout_seconds: u64,
}

impl OpenAiProvider {
    pub fn new(
        client: reqwest::Client,
        model: String,
        api_key: String,
        timeout_seconds: u64,
    ) -> Self {
        Self {
            client,
            model,
            api_key,
            timeout_seconds,
        }
    }

    async fn execute_response(
        &self,
        request: &AdvisorRequest,
        cancellation: CancellationToken,
    ) -> Result<(Value, u8), LlmError> {
        let body = openai_request_body(&self.model, request)?;
        let mut retries = 0u8;
        loop {
            if cancellation.is_cancelled() {
                return Err(LlmError::Cancelled);
            }
            let response = self
                .client
                .post(RESPONSES_URL)
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .await
                .map_err(map_openai_transport_error)?;
            let status = response.status();
            if status.is_success() {
                let bytes = response.bytes().await.map_err(map_openai_transport_error)?;
                if bytes.len() > MAX_RESPONSE_BYTES {
                    return Err(LlmError::ResponseTooLarge);
                }
                return serde_json::from_slice(&bytes)
                    .map(|value| (value, retries))
                    .map_err(|_| LlmError::InvalidStructuredOutput);
            }

            let error = classify_openai_status(status);
            if retries >= 2 || !matches!(error, LlmError::RateLimited | LlmError::Provider5xx) {
                return Err(error);
            }
            let retry_after = response
                .headers()
                .get(RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .map(|seconds| Duration::from_secs(seconds.min(10)))
                .unwrap_or_else(|| Duration::from_millis(500u64.saturating_mul(1u64 << retries)));
            retries += 1;
            tokio::select! {
                _ = cancellation.cancelled() => return Err(LlmError::Cancelled),
                _ = tokio::time::sleep(retry_after) => {}
            }
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn suggest_progression(
        &self,
        request: AdvisorRequest,
        cancellation: CancellationToken,
    ) -> Result<ProviderResult, LlmError> {
        if self.model.trim().is_empty() {
            return Err(LlmError::ProviderNotConfigured);
        }
        let timeout = Duration::from_secs(self.timeout_seconds.clamp(5, 120));
        let operation_cancellation = cancellation.clone();
        with_timeout_and_cancellation(timeout, cancellation, async {
            let (payload, retry_count) = self
                .execute_response(&request, operation_cancellation)
                .await?;
            let output = extract_openai_output(&payload)?;
            let response = serde_json::from_str::<AdvisorResponse>(&output)
                .map_err(|_| LlmError::InvalidStructuredOutput)?;
            Ok(ProviderResult {
                response,
                usage: usage_from_payload(&payload),
                retry_count,
            })
        })
        .await
    }

    async fn test_connection(&self) -> Result<ProviderHealth, LlmError> {
        if self.model.trim().is_empty() {
            return Err(LlmError::ProviderNotConfigured);
        }
        let mut url = Url::parse(MODELS_URL).map_err(|_| LlmError::Network)?;
        url.path_segments_mut()
            .map_err(|_| LlmError::Network)?
            .push(&self.model);
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.api_key)
            .timeout(Duration::from_secs(self.timeout_seconds.clamp(5, 120)))
            .send()
            .await
            .map_err(map_openai_transport_error)?;
        if !response.status().is_success() {
            return Err(classify_openai_status(response.status()));
        }
        Ok(ProviderHealth {
            provider: LlmProviderId::Openai,
            available: true,
            model: Some(self.model.clone()),
            message: None,
        })
    }
}

fn openai_request_body(model: &str, request: &AdvisorRequest) -> Result<Value, LlmError> {
    let input = serde_json::to_string(request).map_err(|_| LlmError::DomainValidationFailed)?;
    Ok(json!({
        "model": model,
        "store": false,
        "instructions": "You are Loop Vault Progression Advisor. Return exactly three distinct, complete 8-bar 4/4 proposals. Follow the supplied strategy and taxonomy constraints.",
        "input": input,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "loop_vault_progression_advisor",
                "strict": true,
                "schema": advisor_response_json_schema()
            }
        }
    }))
}

fn extract_openai_output(payload: &Value) -> Result<String, LlmError> {
    let mut text = String::new();
    for item in payload
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        for content in item
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            match content.get("type").and_then(Value::as_str) {
                Some("refusal") => return Err(LlmError::Refused),
                Some("output_text") => {
                    if let Some(fragment) = content.get("text").and_then(Value::as_str) {
                        text.push_str(fragment);
                    }
                }
                _ => {}
            }
        }
    }
    if text.trim().is_empty() {
        Err(LlmError::EmptyResponse)
    } else {
        Ok(text)
    }
}

fn usage_from_payload(payload: &Value) -> Option<ProviderUsage> {
    let usage = payload.get("usage")?;
    Some(ProviderUsage {
        input_tokens: usage.get("input_tokens").and_then(Value::as_u64),
        output_tokens: usage.get("output_tokens").and_then(Value::as_u64),
        total_tokens: usage.get("total_tokens").and_then(Value::as_u64),
    })
}

fn classify_openai_status(status: StatusCode) -> LlmError {
    match status.as_u16() {
        401 | 403 => LlmError::AuthenticationFailed,
        404 => LlmError::ModelUnavailable,
        429 => LlmError::RateLimited,
        500..=599 => LlmError::Provider5xx,
        _ => LlmError::Network,
    }
}

fn map_openai_transport_error(error: reqwest::Error) -> LlmError {
    if error.is_timeout() {
        LlmError::Timeout
    } else {
        LlmError::Network
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::types::{AdvisorOutputContract, AdvisorProgression, AdvisorStrategy};

    fn request() -> AdvisorRequest {
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
                manual_tag_ids: vec![],
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
    fn requests_strict_structured_output_without_storage() {
        let body = openai_request_body("gpt-test", &request()).unwrap();
        assert_eq!(body["store"], false);
        assert_eq!(body["text"]["format"]["type"], "json_schema");
        assert_eq!(body["text"]["format"]["strict"], true);
        assert_eq!(
            body["text"]["format"]["schema"]["additionalProperties"],
            false
        );
        assert_eq!(
            body["text"]["format"]["schema"]["properties"]["schemaVersion"]["const"],
            1
        );
        assert!(body.get("api_key").is_none());
    }

    #[test]
    fn extracts_text_usage_and_refusal_without_exposing_raw_content() {
        let payload = json!({"output":[{"content":[{"type":"output_text","text":r#"{"schemaVersion":1}"#}]}],"usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30}});
        assert_eq!(
            extract_openai_output(&payload).unwrap(),
            "{\"schemaVersion\":1}"
        );
        assert_eq!(usage_from_payload(&payload).unwrap().total_tokens, Some(30));
        assert_eq!(
            extract_openai_output(
                &json!({"output":[{"content":[{"type":"refusal","refusal":"no"}]}]})
            ),
            Err(LlmError::Refused)
        );
    }

    #[test]
    fn classifies_retryable_and_terminal_statuses() {
        assert_eq!(
            classify_openai_status(StatusCode::TOO_MANY_REQUESTS),
            LlmError::RateLimited
        );
        assert_eq!(
            classify_openai_status(StatusCode::BAD_GATEWAY),
            LlmError::Provider5xx
        );
        assert_eq!(
            classify_openai_status(StatusCode::UNAUTHORIZED),
            LlmError::AuthenticationFailed
        );
    }
}
