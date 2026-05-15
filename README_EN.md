# Hermes Computer Use

<p align="center">
  <strong>Desktop Management Console for Hermes Agent</strong>
</p>

<p align="center">
  <a href="README_EN.md">English</a> | <a href="README.md">中文</a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-1.70+-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

[Hermes Computer Use](https://github.com/Crown-22/Hermes-Computer-Use) is a desktop management console for [Hermes Agent](https://github.com/hermes-agent/hermes), providing an elegant graphical interface to manage AI Agent sessions, skills, cron jobs, configurations, and more. Deeply optimized for a smooth, professional management experience.

## Features

### Core Modules

- **🏠 Dashboard** - System status overview, statistics, and quick actions at a glance
- **💬 Sessions Management** - View and manage AI conversation history with search, categorization, and quick switching
- **⚡ Skills Browser** - Browse and configure 300+ Hermes Skills with one-click enable/disable
- **⏰ Cron Jobs** - Create and manage scheduled tasks with visual scheduling configuration
- **🧠 Memory Module** - Manage long-term memory entries and view AI context memory status
- **🔌 Platform Configuration** - Configure Telegram, Discord, WeChat, QQ and other platform connections
- **📁 File Browser** - Browse files in working directory with quick search and preview
- **📊 System Monitor** - Real-time logs and performance metrics with multi-dimensional filtering
- **💬 Chat Interface** - Direct chat with Hermes Agent with command auto-completion

### Optimization Highlights

- **🎨 Modern UI Design** - Contemporary interface style with soft color palette, fatigue-free for extended use
- **⚡ Lightning Fast** - Tauri 2 native performance, fast startup, low resource usage, smooth operation
- **🔍 Smart Search** - Global search support, quickly locate sessions, skills, and configurations
- **📱 Multi-Platform Integration** - Unified management of 8+ communication platform Agent connections
- **🎯 Visual Monitoring** - Real-time health dashboard with performance metrics at a glance
- **🌙 Status Awareness** - Bottom status bar shows connection status, model info, and statistics in real-time

## Screenshots

### Dashboard

Intuitive display of core system metrics: total sessions, available skills, today's tasks, and token usage.

![Dashboard](./public/screenshots/首页.png)

### Sessions Management

Powerful session management with time-based grouping, search, and quick switching - easily manage hundreds of conversations.

![Sessions Management](./public/screenshots/会话页.png)

### System Monitor

Real-time system monitoring including gateway health, performance metrics, log viewing, and error rate statistics.

![System Monitor](./public/screenshots/监控页.png)

### Platform Configuration

Unified management of 8+ communication platform Agent connections: Telegram, Discord, Slack, WeChat, QQ, Feishu, and more.

![Platform Configuration](./public/screenshots/平台配置页.png)

## Installation

### Prerequisites

1. **Hermes Agent** - Must be installed and configured first
   ```bash
   pip install hermes-agent
   hermes config set model.api_key YOUR_API_KEY
   ```

2. **System Requirements**
   - Windows 10/11
   - macOS 10.15+
   - Ubuntu 22.04+

### Download

Download the installer for your platform from the [Releases](https://github.com/Crown-22/Hermes-Computer-Use/releases) page:

| Platform | Filename |
|----------|----------|
| Windows | `Hermes.Computer.Use_x.x.x_x64-setup.exe` |
| macOS | `Hermes.Computer.Use_x.x.x_universal.dmg` |
| Linux | `hermes-computer-use_x.x.x_amd64.deb` |

### First Run

1. Launch Hermes Computer Use
2. If Hermes Agent is not detected, a setup guide will appear
3. Follow the guide to complete configuration
4. Start using!

## Development

### Requirements

- **Node.js** >= 18
- **Rust** >= 1.70
- **Hermes Agent** installed

### Local Development

```bash
# Clone the repository
git clone https://github.com/Crown-22/Hermes-Computer-Use.git
cd Hermes-Computer-Use/hermes-app

# Install dependencies
npm install

# Start development mode (hot reload)
npm run tauri:dev
```

### Build for Production

```bash
npm run tauri:build
```

Build artifacts are located in `src-tauri/target/release/bundle/` directory.

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server only |
| `npm run tauri:dev` | Start Tauri dev mode (frontend + backend) |
| `npm run tauri:build` | Build for production |
| `npm run build` | Build frontend only |

## Tech Stack

### Frontend

| Technology | Version | Description |
|------------|---------|-------------|
| React | 19 | UI Framework |
| TypeScript | 5.8 | Type Safety |
| Vite | 7 | Build Tool |
| Tailwind CSS | 4 | Styling |
| Zustand | 5 | State Management |

### Backend

| Technology | Version | Description |
|------------|---------|-------------|
| Tauri | 2 | Cross-platform Desktop Framework |
| Rust | 1.70+ | Backend Logic |
| Serde | - | Serialization/Deserialization |

## Project Structure

```
hermes-app/
├── src/                      # Frontend source code
│   ├── components/           # Reusable UI components
│   │   ├── ui/              # Base UI component library
│   │   └── layout/          # Layout components
│   ├── pages/                # Page components
│   │   ├── Dashboard/       # Dashboard page
│   │   ├── Sessions/        # Sessions management
│   │   ├── Skills/          # Skills management
│   │   ├── CronJobs/        # Cron jobs
│   │   ├── Settings/        # System settings
│   │   ├── Monitor/         # System monitor
│   │   ├── Memory/          # Memory management
│   │   ├── Platforms/       # Platform configuration
│   │   ├── Gateway/         # Gateway management
│   │   ├── Files/           # File management
│   │   └── Chat/            # Chat interface
│   ├── stores/               # Zustand state management
│   ├── services/             # API service layer
│   ├── hooks/                # Custom React Hooks
│   ├── utils/                # Utility functions
│   └── types/                # TypeScript type definitions
├── src-tauri/                # Tauri backend source
│   ├── src/
│   │   ├── commands/        # Tauri command modules
│   │   ├── lib.rs           # Core library
│   │   └── main.rs          # Entry point
│   ├── Cargo.toml           # Rust dependencies
│   └── tauri.conf.json      # Tauri configuration
├── public/                   # Static assets
│   └── screenshots/         # App screenshots
├── package.json              # Node.js dependencies
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config
└── tailwind.config.js        # Tailwind CSS config
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Hermes Agent API URL
VITE_HERMES_API_URL=http://localhost:9119

# Other configurations...
```

### Tauri Configuration

Configure app information in `src-tauri/tauri.conf.json`:

```json
{
  "productName": "Hermes Computer Use",
  "version": "1.0.0",
  "identifier": "com.crown22.hermes-computer-use"
}
```

## Contributing

Contributions are welcome! Please check [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Guidelines

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation update
- `style:` Code style (no functionality change)
- `refactor:` Refactoring
- `perf:` Performance improvement
- `test:` Testing related
- `chore:` Build/tool related

## FAQ

### Q: Shows "Offline" after launch?

A: Please ensure Hermes Agent is properly installed and running. Check with:

```bash
hermes status
```

### Q: How to update to the latest version?

A: Download the latest installer from [Releases](https://github.com/Crown-22/Hermes-Computer-Use/releases) and install over the existing version.

### Q: Which AI models are supported?

A: All models supported by Hermes Agent, including OpenAI, Claude, Gemini, and Chinese LLMs.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- [Hermes Agent](https://github.com/hermes-agent/hermes) - Powerful AI Agent framework
- [Tauri](https://tauri.app/) - Modern desktop application framework
- [React](https://react.dev/) - Popular UI framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

## Contact

- **GitHub**: [Crown_22](https://github.com/Crown-22)
- **Issues**: [Submit Issues](https://github.com/Crown-22/Hermes-Computer-Use/issues)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Crown-22">Crown_22</a>
</p>
