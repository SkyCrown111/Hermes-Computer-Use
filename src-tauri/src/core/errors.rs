//! Unified Error Types
//!
//! Centralized error handling for Hermes Agent integration.

use std::fmt;

/// Unified error type for Hermes operations
#[derive(Debug, Clone)]
pub enum HermesError {
    /// Database operation failed
    DatabaseError {
        code: &'static str,
        message: String,
        context: Option<String>,
    },
    
    /// File system operation failed
    FileSystemError {
        code: &'static str,
        message: String,
        path: Option<String>,
    },
    
    /// Network operation failed
    NetworkError {
        code: &'static str,
        message: String,
        url: Option<String>,
    },
    
    /// CLI command execution failed
    CliError {
        code: &'static str,
        message: String,
        command: Option<String>,
        exit_code: Option<i32>,
    },
    
    /// Configuration operation failed
    ConfigError {
        code: &'static str,
        message: String,
        key: Option<String>,
    },
    
    /// Process management failed
    ProcessError {
        code: &'static str,
        message: String,
        process_id: Option<String>,
    },
    
    /// Operation timed out
    TimeoutError {
        code: &'static str,
        message: String,
        duration_ms: Option<u64>,
    },
    
    /// Parsing failed (JSON, YAML, etc.)
    ParseError {
        code: &'static str,
        message: String,
        format: String,
        position: Option<String>,
    },
    
    /// Lock acquisition failed
    LockError {
        code: &'static str,
        message: String,
        resource: String,
    },
    
    /// Validation failed
    ValidationError {
        code: &'static str,
        message: String,
        field: Option<String>,
    },
    
    /// Resource not found
    NotFoundError {
        code: &'static str,
        message: String,
        resource_type: String,
        resource_id: String,
    },
    
    /// Permission denied
    PermissionError {
        code: &'static str,
        message: String,
        operation: String,
    },
    
    /// Generic error
    GenericError {
        code: &'static str,
        message: String,
    },
}

impl HermesError {
    /// Get error code
    pub fn code(&self) -> &'static str {
        match self {
            HermesError::DatabaseError { code, .. } => code,
            HermesError::FileSystemError { code, .. } => code,
            HermesError::NetworkError { code, .. } => code,
            HermesError::CliError { code, .. } => code,
            HermesError::ConfigError { code, .. } => code,
            HermesError::ProcessError { code, .. } => code,
            HermesError::TimeoutError { code, .. } => code,
            HermesError::ParseError { code, .. } => code,
            HermesError::LockError { code, .. } => code,
            HermesError::ValidationError { code, .. } => code,
            HermesError::NotFoundError { code, .. } => code,
            HermesError::PermissionError { code, .. } => code,
            HermesError::GenericError { code, .. } => code,
        }
    }

    /// Get error message
    pub fn message(&self) -> &str {
        match self {
            HermesError::DatabaseError { message, .. } => message,
            HermesError::FileSystemError { message, .. } => message,
            HermesError::NetworkError { message, .. } => message,
            HermesError::CliError { message, .. } => message,
            HermesError::ConfigError { message, .. } => message,
            HermesError::ProcessError { message, .. } => message,
            HermesError::TimeoutError { message, .. } => message,
            HermesError::ParseError { message, .. } => message,
            HermesError::LockError { message, .. } => message,
            HermesError::ValidationError { message, .. } => message,
            HermesError::NotFoundError { message, .. } => message,
            HermesError::PermissionError { message, .. } => message,
            HermesError::GenericError { message, .. } => message,
        }
    }

    /// Convert to user-friendly error message
    pub fn to_user_message(&self) -> String {
        match self {
            HermesError::DatabaseError { message, context, .. } => {
                if let Some(ctx) = context {
                    format!("数据库错误: {} ({})", message, ctx)
                } else {
                    format!("数据库错误: {}", message)
                }
            }
            HermesError::FileSystemError { message, path, .. } => {
                if let Some(p) = path {
                    format!("文件系统错误: {} (路径: {})", message, p)
                } else {
                    format!("文件系统错误: {}", message)
                }
            }
            HermesError::NetworkError { message, url, .. } => {
                if let Some(u) = url {
                    format!("网络错误: {} (URL: {})", message, u)
                } else {
                    format!("网络错误: {}", message)
                }
            }
            HermesError::CliError { message, command, exit_code, .. } => {
                let mut msg = format!("命令执行失败: {}", message);
                if let Some(cmd) = command {
                    msg.push_str(&format!(" (命令: {})", cmd));
                }
                if let Some(code) = exit_code {
                    msg.push_str(&format!(" (退出码: {})", code));
                }
                msg
            }
            HermesError::ConfigError { message, key, .. } => {
                if let Some(k) = key {
                    format!("配置错误: {} (键: {})", message, k)
                } else {
                    format!("配置错误: {}", message)
                }
            }
            HermesError::ProcessError { message, process_id, .. } => {
                if let Some(pid) = process_id {
                    format!("进程错误: {} (进程ID: {})", message, pid)
                } else {
                    format!("进程错误: {}", message)
                }
            }
            HermesError::TimeoutError { message, duration_ms, .. } => {
                if let Some(ms) = duration_ms {
                    format!("操作超时: {} (等待时间: {}ms)", message, ms)
                } else {
                    format!("操作超时: {}", message)
                }
            }
            HermesError::ParseError { message, format, position, .. } => {
                let mut msg = format!("解析错误: {} (格式: {})", message, format);
                if let Some(pos) = position {
                    msg.push_str(&format!(" (位置: {})", pos));
                }
                msg
            }
            HermesError::LockError { message, resource, .. } => {
                format!("锁获取失败: {} (资源: {})", message, resource)
            }
            HermesError::ValidationError { message, field, .. } => {
                if let Some(f) = field {
                    format!("验证失败: {} (字段: {})", message, f)
                } else {
                    format!("验证失败: {}", message)
                }
            }
            HermesError::NotFoundError { message, resource_type, resource_id, .. } => {
                format!("未找到{}: {} (ID: {})", resource_type, message, resource_id)
            }
            HermesError::PermissionError { message, operation, .. } => {
                format!("权限不足: {} (操作: {})", message, operation)
            }
            HermesError::GenericError { message, .. } => {
                format!("错误: {}", message)
            }
        }
    }
}

impl fmt::Display for HermesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code(), self.message())
    }
}

impl std::error::Error for HermesError {}

// Conversion from common error types

impl From<std::io::Error> for HermesError {
    fn from(err: std::io::Error) -> Self {
        HermesError::FileSystemError {
            code: "FS_IO_ERROR",
            message: err.to_string(),
            path: None,
        }
    }
}

impl From<serde_json::Error> for HermesError {
    fn from(err: serde_json::Error) -> Self {
        HermesError::ParseError {
            code: "PARSE_JSON_ERROR",
            message: err.to_string(),
            format: "JSON".to_string(),
            position: Some(format!("line {}, column {}", err.line(), err.column())),
        }
    }
}

impl From<serde_yaml::Error> for HermesError {
    fn from(err: serde_yaml::Error) -> Self {
        let position = if let Some(loc) = err.location() {
            Some(format!("line {}, column {}", loc.line(), loc.column()))
        } else {
            None
        };
        
        HermesError::ParseError {
            code: "PARSE_YAML_ERROR",
            message: err.to_string(),
            format: "YAML".to_string(),
            position,
        }
    }
}

impl From<tokio::time::error::Elapsed> for HermesError {
    fn from(err: tokio::time::error::Elapsed) -> Self {
        HermesError::TimeoutError {
            code: "TIMEOUT",
            message: err.to_string(),
            duration_ms: None,
        }
    }
}

// Convert HermesError to String for Tauri commands
impl From<HermesError> for String {
    fn from(err: HermesError) -> Self {
        err.to_user_message()
    }
}

// Helper functions for creating common errors

impl HermesError {
    pub fn database(message: impl Into<String>) -> Self {
        HermesError::DatabaseError {
            code: "DB_ERROR",
            message: message.into(),
            context: None,
        }
    }

    pub fn file_not_found(path: impl Into<String>) -> Self {
        HermesError::FileSystemError {
            code: "FILE_NOT_FOUND",
            message: "File not found".to_string(),
            path: Some(path.into()),
        }
    }

    pub fn cli_failed(command: impl Into<String>, exit_code: i32) -> Self {
        HermesError::CliError {
            code: "CLI_FAILED",
            message: "Command execution failed".to_string(),
            command: Some(command.into()),
            exit_code: Some(exit_code),
        }
    }

    pub fn config_invalid(key: impl Into<String>, message: impl Into<String>) -> Self {
        HermesError::ConfigError {
            code: "CONFIG_INVALID",
            message: message.into(),
            key: Some(key.into()),
        }
    }

    pub fn process_not_found(process_id: impl Into<String>) -> Self {
        HermesError::ProcessError {
            code: "PROCESS_NOT_FOUND",
            message: "Process not found".to_string(),
            process_id: Some(process_id.into()),
        }
    }

    pub fn timeout(message: impl Into<String>, duration_ms: u64) -> Self {
        HermesError::TimeoutError {
            code: "TIMEOUT",
            message: message.into(),
            duration_ms: Some(duration_ms),
        }
    }

    pub fn not_found(resource_type: impl Into<String>, resource_id: impl Into<String>) -> Self {
        HermesError::NotFoundError {
            code: "NOT_FOUND",
            message: "Resource not found".to_string(),
            resource_type: resource_type.into(),
            resource_id: resource_id.into(),
        }
    }

    pub fn validation(field: impl Into<String>, message: impl Into<String>) -> Self {
        HermesError::ValidationError {
            code: "VALIDATION_ERROR",
            message: message.into(),
            field: Some(field.into()),
        }
    }
}

/// Result type alias using HermesError
pub type Result<T> = std::result::Result<T, HermesError>;
