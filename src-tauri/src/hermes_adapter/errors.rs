use std::fmt::{Display, Formatter};

#[derive(Debug, Clone)]
pub enum HermesAdapterError {
    HermesHomeNotFound,
    HermesRuntimeNotFound,
    CommandFailed(String),
}

impl Display for HermesAdapterError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::HermesHomeNotFound => write!(f, "Hermes home could not be resolved"),
            Self::HermesRuntimeNotFound => write!(f, "Hermes runtime could not be resolved"),
            Self::CommandFailed(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for HermesAdapterError {}
