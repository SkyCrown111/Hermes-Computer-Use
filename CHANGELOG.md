# Changelog

All notable changes to Hermes Computer Use will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-04-23

### Fixed
- Fixed JSON tool outputs appearing in message content (cronjob, browser, etc.)
- Fixed thinking/reasoning blocks disappearing when reopening sessions
- Fixed session list not updating/sorting correctly after sending messages
- Fixed tool calls not displaying in history sessions
- Fixed tool success status showing as separate cards instead of inline
- Fixed empty messages showing avatar without content
- Fixed grouped messages not properly aligning without avatar
- Removed timestamp display from messages for cleaner UI

### Improved
- Tool execution status now shows on the right side of tool items
- Session list refreshes in real-time when messages are sent
- New sessions appear immediately in the session list
- Better JSON parsing for tool outputs with nested structures

## [0.1.0] - 2025-04-22

### Added
- Initial release of Hermes Console
- Dashboard with system status and quick actions
- Sessions management (view, search, delete)
- Skills browser and management
- Cron jobs scheduling and management
- Memory module management
- Platform connections configuration
- File browser for working directory
- System monitor with logs and metrics
- Settings and preferences pages
- Chat interface with streaming support
- Multi-language support (Chinese/English)
- Dark/Light theme support
- Auto-start Hermes Gateway on launch

### Features
- **Dashboard**: Overview of sessions, skills, tasks, and system status
- **Sessions**: Browse and manage AI conversation history
- **Skills**: View and manage Hermes Agent skills
- **Cron Jobs**: Schedule and manage automated tasks
- **Memory**: Manage long-term memory entries
- **Platforms**: Configure Telegram, Discord, and other platforms
- **Files**: Browse files in working directory
- **Monitor**: Real-time system monitoring and logs
- **Chat**: Direct chat interface with Hermes Agent

### Technical
- Built with Tauri 2.0 + React 19 + TypeScript
- State management with Zustand 5
- Styling with Tailwind CSS 4
- Rust backend for native performance
