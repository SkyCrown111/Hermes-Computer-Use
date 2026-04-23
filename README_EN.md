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

Hermes Computer Use is a desktop management console for [Hermes Agent](https://github.com/hermes-agent/hermes), providing a graphical interface to manage AI Agent sessions, skills, cron jobs, configurations, and more.

## Features

- **Dashboard** - System status overview, statistics, and quick actions
- **Sessions Management** - View and manage AI conversation history
- **Skills Browser** - Browse and configure Hermes Skills
- **Cron Jobs** - Create and manage scheduled tasks
- **Memory Module** - Manage long-term memory entries
- **Platform Configuration** - Configure Telegram, Discord, and other platform connections
- **File Browser** - Browse files in working directory
- **System Monitor** - Real-time logs and performance metrics
- **Chat Interface** - Direct chat with Hermes Agent

## Screenshots

> Screenshots will be added after first release

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

- **Windows**: `Hermes.Computer.Use_x.x.x_x64-setup.exe`
- **macOS**: `Hermes.Computer.Use_x.x.x_universal.dmg`
- **Linux**: `hermes-computer-use_x.x.x_amd64.deb`

### First Run

1. Launch Hermes Computer Use
2. If Hermes Agent is not detected, a setup guide will appear
3. Follow the guide to complete configuration
4. Start using!

## Development

### Requirements

- Node.js >= 18
- Rust >= 1.70
- Hermes Agent installed

### Local Development

```bash
# Clone the repository
git clone https://github.com/Crown-22/Hermes-Computer-Use.git
cd Hermes-Computer-Use/hermes-app

# Install dependencies
npm install

# Start development mode
npm run tauri:dev
```

### Build for Production

```bash
npm run tauri:build
```

Build artifacts are located in `src-tauri/target/release/bundle/`.

## Tech Stack

### Frontend
- **React 19** - UI Framework
- **TypeScript 5.8** - Type Safety
- **Vite 7** - Build Tool
- **Tailwind CSS 4** - Styling
- **Zustand 5** - State Management

### Backend
- **Tauri 2** - Cross-platform Desktop Framework
- **Rust** - Backend Logic
- **Serde** - Serialization/Deserialization

## Project Structure

```
hermes-app/
├── src/                      # Frontend source code
│   ├── components/           # Reusable UI components
│   ├── pages/                # Page components
│   │   ├── Dashboard/        # Dashboard page
│   │   ├── Sessions/         # Sessions management
│   │   ├── Skills/           # Skills management
│   │   ├── CronJobs/         # Cron jobs
│   │   ├── Settings/         # System settings
│   │   ├── Monitor/          # System monitor
│   │   ├── Memory/           # Memory management
│   │   ├── Platforms/        # Platform configuration
│   │   └── Files/            # File browser
│   ├── stores/               # Zustand state management
│   ├── services/             # API service layer
│   └── types/                # TypeScript type definitions
├── src-tauri/                # Tauri backend source
│   └── src/commands/         # Tauri command modules
└── public/                   # Static assets
```

## Contributing

Contributions are welcome! Please check [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Guidelines

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- [Hermes Agent](https://github.com/hermes-agent/hermes) - Powerful AI Agent framework
- [Tauri](https://tauri.app/) - Modern desktop application framework
- [React](https://react.dev/) - Popular UI framework

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Crown-22">Crown_22</a>
</p>
