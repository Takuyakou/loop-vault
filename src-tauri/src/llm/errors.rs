use serde::Serialize;
use std::fmt;

/// Errors the credential-store commands can report.
///
/// The AI advisor request pipeline was removed in v3.2.0; only the keychain
/// status/delete commands remain, so the error set is limited to what they use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmError {
    ApiKeyMissing,
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
            Self::ApiKeyMissing => (
                "api_key_missing",
                "The OpenAI API key is not registered.",
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
        let value = serde_json::to_value(LlmError::ApiKeyMissing).unwrap();

        assert_eq!(value["code"], "api_key_missing");
        assert_eq!(value["retryable"], false);
        assert!(value.get("rawResponse").is_none());
    }
}
