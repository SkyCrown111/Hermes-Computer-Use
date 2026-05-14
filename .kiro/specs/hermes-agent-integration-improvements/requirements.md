# Requirements Document

## Introduction

Hermes Computer Use 是一个基于 Tauri 2 的桌面应用，为 Hermes Agent 提供图形化管理控制台。根据审核报告，当前实现完成度约 75%，存在关键功能缺失和架构问题。本需求文档定义了完善 Hermes Agent 集成所需的功能改进。

## Glossary

- **Hermes_Agent**: 基于 Python 的 AI Agent 运行时，提供聊天、工具调用、会话管理等核心功能
- **MCP_Server**: Model Context Protocol 服务器，提供工具和资源给 Agent 使用
- **Gateway**: Platform Gateway 进程，负责与外部平台（Discord、Slack 等）通信
- **Tauri_App**: 基于 Tauri 2 的桌面应用前端
- **Rust_Backend**: Tauri 应用的 Rust 后端，负责与 Hermes Agent 交互
- **WSL**: Windows Subsystem for Linux，用于在 Windows 上运行 Linux 环境
- **Config_File**: ~/.hermes/config.yaml 配置文件
- **Session**: Hermes Agent 的对话会话
- **Checkpoint**: 会话快照，用于保存和恢复会话状态
- **Skill**: Hermes Agent 的技能模块
- **Tool**: MCP 服务器提供的工具
- **Resource**: MCP 服务器提供的资源

---

## Requirements

### Requirement 1: MCP 服务器运行时控制

**User Story:** 作为用户，我希望能够启动、停止和监控 MCP 服务器，以便管理 Agent 可用的工具和资源。

#### Acceptance Criteria

1. WHEN 用户请求启动 MCP 服务器 THEN THE Rust_Backend SHALL 通过 WSL 启动服务器进程并返回进程 ID
2. WHEN 用户请求停止 MCP 服务器 THEN THE Rust_Backend SHALL 终止对应的服务器进程
3. WHEN 用户查询 MCP 服务器状态 THEN THE Rust_Backend SHALL 返回服务器的实时状态（运行中、已停止、错误）
4. WHEN MCP 服务器正在运行 THEN THE Rust_Backend SHALL 能够获取服务器提供的工具列表
5. WHEN MCP 服务器正在运行 THEN THE Rust_Backend SHALL 能够获取服务器提供的资源列表
6. WHEN 用户请求测试 MCP 连接 THEN THE Rust_Backend SHALL 尝试连接服务器并返回连接结果
7. WHEN MCP 服务器产生日志输出 THEN THE Rust_Backend SHALL 捕获并存储日志条目
8. WHEN MCP 服务器崩溃 THEN THE Rust_Backend SHALL 检测崩溃并根据配置决定是否自动重启
9. WHEN 用户查询 MCP 服务器日志 THEN THE Rust_Backend SHALL 返回最近的日志条目列表
10. WHEN MCP 服务器启动失败 THEN THE Rust_Backend SHALL 返回详细的错误信息

### Requirement 2: Gateway 进程管理

**User Story:** 作为用户，我希望能够控制 Gateway 进程的生命周期，以便管理与外部平台的连接。

#### Acceptance Criteria

1. WHEN 用户请求启动 Gateway THEN THE Rust_Backend SHALL 通过 WSL 执行 `hermes gateway start` 命令
2. WHEN 用户请求停止 Gateway THEN THE Rust_Backend SHALL 通过 WSL 执行 `hermes gateway stop` 命令
3. WHEN 用户请求重启 Gateway THEN THE Rust_Backend SHALL 先停止再启动 Gateway 进程
4. WHEN 用户查询 Gateway 状态 THEN THE Rust_Backend SHALL 返回 Gateway 的实时运行状态
5. WHEN Gateway 正在运行 THEN THE Rust_Backend SHALL 能够读取 gateway_state.json 获取平台连接状态
6. WHEN Gateway 产生日志输出 THEN THE Rust_Backend SHALL 捕获并存储日志条目
7. WHEN Gateway 崩溃 THEN THE Rust_Backend SHALL 检测崩溃并通知用户
8. WHEN 用户查询 Gateway 日志 THEN THE Rust_Backend SHALL 返回最近的日志条目列表
9. WHEN Gateway 启动失败 THEN THE Rust_Backend SHALL 返回详细的错误信息
10. WHEN Gateway 状态变化 THEN THE Rust_Backend SHALL 通过事件通知前端

### Requirement 3: 配置文件并发写入保护

**User Story:** 作为系统，我需要确保配置文件的并发写入安全，以防止数据损坏。

#### Acceptance Criteria

1. WHEN 任何进程尝试写入 Config_File THEN THE Rust_Backend SHALL 先获取文件锁
2. WHEN 文件锁已被其他进程持有 THEN THE Rust_Backend SHALL 等待锁释放或超时
3. WHEN 配置写入完成 THEN THE Rust_Backend SHALL 释放文件锁
4. WHEN 配置写入前 THEN THE Rust_Backend SHALL 创建配置文件备份
5. WHEN 配置写入失败 THEN THE Rust_Backend SHALL 从备份恢复配置文件
6. WHEN 配置写入前 THEN THE Rust_Backend SHALL 验证 YAML 格式的正确性
7. WHEN YAML 格式验证失败 THEN THE Rust_Backend SHALL 拒绝写入并返回错误
8. WHEN 配置文件不存在 THEN THE Rust_Backend SHALL 创建默认配置文件
9. WHEN 配置文件损坏 THEN THE Rust_Backend SHALL 尝试从备份恢复
10. WHEN 配置写入超时 THEN THE Rust_Backend SHALL 返回超时错误并释放资源

### Requirement 4: Checkpoint 功能实现

**User Story:** 作为用户，我希望能够创建和恢复会话快照，以便保存重要的对话状态。

#### Acceptance Criteria

1. WHEN 用户请求创建 Checkpoint THEN THE Rust_Backend SHALL 调用 Hermes Agent 创建会话快照
2. WHEN Checkpoint 创建成功 THEN THE Rust_Backend SHALL 返回快照 ID 和元数据
3. WHEN 用户请求恢复 Checkpoint THEN THE Rust_Backend SHALL 调用 Hermes Agent 恢复会话状态
4. WHEN 用户请求列出 Checkpoints THEN THE Rust_Backend SHALL 返回所有快照的列表和元数据
5. WHEN 用户请求删除 Checkpoint THEN THE Rust_Backend SHALL 删除对应的快照文件
6. WHEN Checkpoint 创建时 THEN THE Rust_Backend SHALL 记录快照的时间戳、描述和大小
7. WHEN Checkpoint 恢复失败 THEN THE Rust_Backend SHALL 返回详细的错误信息
8. WHEN Checkpoint 文件损坏 THEN THE Rust_Backend SHALL 检测并报告损坏
9. WHEN 用户查询 Checkpoint 详情 THEN THE Rust_Backend SHALL 返回快照的完整元数据
10. WHEN Checkpoint 存储空间不足 THEN THE Rust_Backend SHALL 返回存储空间不足错误

### Requirement 5: Skills 执行功能

**User Story:** 作为用户，我希望能够直接执行技能并查看结果，而不必通过聊天界面。

#### Acceptance Criteria

1. WHEN 用户请求执行 Skill THEN THE Rust_Backend SHALL 通过 WSL 调用 `hermes skills run <skill_name>` 命令
2. WHEN Skill 需要参数 THEN THE Rust_Backend SHALL 将参数传递给 Skill 执行命令
3. WHEN Skill 执行完成 THEN THE Rust_Backend SHALL 返回执行结果和输出
4. WHEN Skill 执行失败 THEN THE Rust_Backend SHALL 返回详细的错误信息
5. WHEN Skill 执行过程中 THEN THE Rust_Backend SHALL 捕获标准输出和标准错误
6. WHEN 用户请求测试 Skill THEN THE Rust_Backend SHALL 以 dry-run 模式执行 Skill
7. WHEN Skill 执行超时 THEN THE Rust_Backend SHALL 终止执行并返回超时错误
8. WHEN Skill 执行时 THEN THE Rust_Backend SHALL 记录执行日志
9. WHEN 用户查询 Skill 执行历史 THEN THE Rust_Backend SHALL 返回最近的执行记录
10. WHEN Skill 执行产生文件输出 THEN THE Rust_Backend SHALL 返回输出文件的路径

### Requirement 6: 实时日志流

**User Story:** 作为用户，我希望能够实时查看 Hermes Agent 的日志输出，以便调试和监控。

#### Acceptance Criteria

1. WHEN 用户请求查看实时日志 THEN THE Rust_Backend SHALL 使用 `tail -f` 监控日志文件
2. WHEN 日志文件有新内容 THEN THE Rust_Backend SHALL 通过事件推送到前端
3. WHEN 用户设置日志过滤器 THEN THE Rust_Backend SHALL 只推送匹配的日志条目
4. WHEN 用户按级别过滤日志 THEN THE Rust_Backend SHALL 只返回指定级别的日志
5. WHEN 用户按模块过滤日志 THEN THE Rust_Backend SHALL 只返回指定模块的日志
6. WHEN 用户按关键词搜索日志 THEN THE Rust_Backend SHALL 返回包含关键词的日志条目
7. WHEN 用户请求导出日志 THEN THE Rust_Backend SHALL 将日志保存到指定文件
8. WHEN 日志文件不存在 THEN THE Rust_Backend SHALL 返回文件不存在错误
9. WHEN 日志流连接断开 THEN THE Rust_Backend SHALL 尝试重新连接
10. WHEN 用户停止查看日志 THEN THE Rust_Backend SHALL 停止监控日志文件并释放资源

### Requirement 7: 统一的 Hermes CLI 调用层

**User Story:** 作为开发者，我希望有统一的 Hermes CLI 调用接口，以便简化代码维护和提高一致性。

#### Acceptance Criteria

1. THE Rust_Backend SHALL 提供统一的 `hermes_cli` 模块用于所有 CLI 调用
2. WHEN 调用 Hermes CLI 命令 THEN THE hermes_cli 模块 SHALL 处理 WSL 命令执行
3. WHEN CLI 命令失败 THEN THE hermes_cli 模块 SHALL 返回统一格式的错误信息
4. WHEN CLI 命令执行 THEN THE hermes_cli 模块 SHALL 记录命令和参数到日志
5. WHEN CLI 命令超时 THEN THE hermes_cli 模块 SHALL 终止命令并返回超时错误
6. THE hermes_cli 模块 SHALL 提供会话管理相关的 CLI 调用接口
7. THE hermes_cli 模块 SHALL 提供技能管理相关的 CLI 调用接口
8. THE hermes_cli 模块 SHALL 提供配置管理相关的 CLI 调用接口
9. THE hermes_cli 模块 SHALL 提供 MCP 管理相关的 CLI 调用接口
10. THE hermes_cli 模块 SHALL 提供 Gateway 管理相关的 CLI 调用接口

### Requirement 8: 性能优化

**User Story:** 作为用户，我希望应用响应速度快，以便获得流畅的使用体验。

#### Acceptance Criteria

1. WHEN 清洗会话消息 THEN THE Rust_Backend SHALL 使用正则表达式优化清洗逻辑
2. WHEN 获取系统指标 THEN THE Rust_Backend SHALL 缓存指标数据避免重复计算
3. WHEN 系统指标缓存过期 THEN THE Rust_Backend SHALL 异步更新缓存
4. WHEN 查询数据库 THEN THE Rust_Backend SHALL 使用连接池提高性能
5. WHEN 读取大文件 THEN THE Rust_Backend SHALL 使用流式读取避免内存溢出
6. WHEN 处理大量数据 THEN THE Rust_Backend SHALL 使用分页返回结果
7. WHEN 执行耗时操作 THEN THE Rust_Backend SHALL 使用异步任务避免阻塞
8. WHEN 缓存数据过期 THEN THE Rust_Backend SHALL 自动清理过期缓存
9. WHEN 系统资源不足 THEN THE Rust_Backend SHALL 限制并发操作数量
10. WHEN 性能指标异常 THEN THE Rust_Backend SHALL 记录性能日志

### Requirement 9: 错误处理增强

**User Story:** 作为用户，我希望在操作失败时能够获得清晰的错误信息，以便了解问题原因。

#### Acceptance Criteria

1. THE Rust_Backend SHALL 定义统一的错误类型枚举
2. WHEN 操作失败 THEN THE Rust_Backend SHALL 返回详细的错误信息和错误代码
3. WHEN 网络操作失败 THEN THE Rust_Backend SHALL 自动重试最多 3 次
4. WHEN 文件操作失败 THEN THE Rust_Backend SHALL 区分文件不存在和读取失败
5. WHEN 数据库操作失败 THEN THE Rust_Backend SHALL 返回 SQL 错误详情
6. WHEN CLI 命令失败 THEN THE Rust_Backend SHALL 返回命令输出和退出码
7. WHEN 解析 JSON 失败 THEN THE Rust_Backend SHALL 返回解析错误位置
8. WHEN 解析 YAML 失败 THEN THE Rust_Backend SHALL 返回解析错误行号
9. WHEN 操作超时 THEN THE Rust_Backend SHALL 返回超时错误和已等待时间
10. WHEN 错误发生 THEN THE Rust_Backend SHALL 记录错误堆栈到日志文件

---

## Notes

- 所有与 Hermes Agent 的交互都应通过 WSL 进行
- 配置文件路径为 `~/.hermes/config.yaml`
- MCP 服务器配置存储在 `config.yaml` 的 `mcp.servers` 部分
- Gateway 状态文件路径为 `~/.hermes/gateway_state.json`
- Checkpoint 存储路径为 `~/.hermes/checkpoints/`
- 所有文件操作都应使用文件锁保护
- 所有 CLI 调用都应处理 WSL 不可用的情况
- 所有错误都应提供用户友好的错误信息
