use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmError {
    ProviderNotConfigured,
    ApiKeyMissing,
    LocalServerUnavailable,
    ModelUnavailable,
    AuthenticationFailed,
    RateLimited,
    Timeout,
    Cancelled,
    Network,
    Provider5xx,
    Refused,
    EmptyResponse,
    InvalidStructuredOutput,
    DomainValidationFailed,
    ResponseTooLarge,
    SecretStoreUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmErrorPayload {
    pub code: &'static str,
    pub message: &'static str,
    pub retryable: bool,
}

impl LlmError {
    pub fn payload(self) -> LlmErrorPayload {
        let (code, message, retryable) = match self {
            Self::ProviderNotConfigured => (
                "provider_not_configured",
                "The selected AI provider is not configured.",
                false,
            ),
            Self::ApiKeyMissing => (
                "api_key_missing",
                "The OpenAI API key is not registered.",
                false,
            ),
            Self::LocalServerUnavailable => (
                "local_server_unavailable",
                "The local LLM server could not be reached.",
                true,
            ),
            Self::ModelUnavailable => (
                "model_unavailable",
                "The selected model is not available.",
                false,
            ),
            Self::AuthenticationFailed => (
                "authentication_failed",
                "The provider rejected the credentials.",
                false,
            ),
            Self::RateLimited => ("rate_limited", "The provider rate limit was reached.", true),
            Self::Timeout => ("timeout", "The AI request timed out.", true),
            Self::Cancelled => ("cancelled", "The AI request was cancelled.", false),
            Self::Network => ("network_error", "A network error occurred.", true),
            Self::Provider5xx => (
                "provider_5xx",
                "The AI provider returned a server error.",
                true,
            ),
            Self::Refused => ("refused", "The AI provider refused this request.", false),
            Self::EmptyResponse => (
                "empty_response",
                "The AI provider returned an empty response.",
                false,
            ),
            Self::InvalidStructuredOutput => (
                "invalid_structured_output",
                "The AI provider returned invalid structured output.",
                false,
            ),
            Self::DomainValidationFailed => (
                "domain_validation_failed",
                "The generated progression did not pass validation.",
                false,
            ),
            Self::ResponseTooLarge => (
                "response_too_large",
                "The AI provider response exceeded the allowed size.",
                false,
            ),
            Self::SecretStoreUnavailable => (
                "secret_store_unavailable",
                "The operating system credential store is unavailable.",
                false,
            ),
        };

        LlmErrorPayload {
            code,
            message,
            retryable,
        }
    }
}

impl fmt::Display for LlmError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.payload().message)
    }
}

impl std::error::Error for LlmError {}

impl Serialize for LlmError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.payload().serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialized_errors_do_not_expose_provider_details() {
        let value = serde_json::to_value(LlmError::AuthenticationFailed).unwrap();

        assert_eq!(value["code"], "authentication_failed");
        assert_eq!(value["retryable"], false);
        assert!(value.get("rawResponse").is_none());
    }
}
