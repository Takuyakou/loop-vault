pub mod commands;
pub mod errors;
pub mod keychain;
pub mod local_provider;
pub mod openai_provider;
pub mod provider;
pub mod retry;
pub mod types;

use std::{collections::HashMap, sync::Mutex};
use tokio_util::sync::CancellationToken;

pub struct LlmState {
    cancellations: Mutex<HashMap<String, CancellationToken>>,
    pub client: reqwest::Client,
}

impl Default for LlmState {
    fn default() -> Self {
        Self {
            cancellations: Mutex::new(HashMap::new()),
            client: reqwest::Client::new(),
        }
    }
}

impl LlmState {
    pub fn begin_request(&self, request_id: String) -> CancellationToken {
        let token = CancellationToken::new();
        self.cancellations
            .lock()
            .expect("LLM cancellation state poisoned")
            .insert(request_id, token.clone());
        token
    }

    pub fn finish_request(&self, request_id: &str) {
        self.cancellations
            .lock()
            .expect("LLM cancellation state poisoned")
            .remove(request_id);
    }

    pub fn cancel_request(&self, request_id: &str) -> bool {
        let token = self
            .cancellations
            .lock()
            .expect("LLM cancellation state poisoned")
            .remove(request_id);

        if let Some(token) = token {
            token.cancel();
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_is_scoped_to_request_id() {
        let state = LlmState::default();
        let first = state.begin_request("first".to_owned());
        let second = state.begin_request("second".to_owned());

        assert!(state.cancel_request("first"));
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
        assert!(!state.cancel_request("missing"));
    }

    #[test]
    fn finishing_a_request_removes_its_cancellation_token() {
        let state = LlmState::default();
        let token = state.begin_request("request".to_owned());

        state.finish_request("request");

        assert!(!state.cancel_request("request"));
        assert!(!token.is_cancelled());
    }
}
