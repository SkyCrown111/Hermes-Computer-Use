# Hermes Computer Use

<p align="center">
  <strong>Hermes Agent 桌面管理控制台</strong>
</p>

<p align="center">
  <a href="README_EN.md">English</a> | <a href="README.md">中文</a>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="#开发">开发</a> •
  <a href="#贡献">贡献</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-1.70+-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

Hermes Computer Use 是 [Hermes Agent](https://github.com/hermes-agent/hermes) 的桌面管理控制台应用，提供图形化界面来管理 AI Agent 的会话、技能、定时任务、配置等功能。

## 功能特性

- **仪表盘** - 系统状态概览、统计数据、快捷操作
- **会话管理** - 查看和管理 AI 对话历史记录
- **技能管理** - 浏览和配置 Hermes Skills
- **定时任务** - 创建和管理 Cron Jobs
- **记忆管理** - 管理长期记忆条目
- **平台配置** - 配置 Telegram、Discord 等平台连接
- **文件浏览** - 浏览工作目录文件
- **系统监控** - 实时监控日志和性能指标
- **聊天界面** - 直接与 Hermes Agent 对话

## 截图

> 截图将在首次发布后添加

## 安装

### 前置要求

1. **Hermes Agent** - 必须先安装并配置 Hermes Agent
   ```bash
   pip install hermes-agent
   hermes config set model.api_key YOUR_API_KEY
   ```

2. **系统要求**
   - Windows 10/11
   - macOS 10.15+
   - Ubuntu 22.04+

### 下载安装

从 [Releases](https://github.com/Crown-22/Hermes-Computer-Use/releases) 页面下载对应平台的安装包：

- **Windows**: `Hermes.Computer.Use_x.x.x_x64-setup.exe`
- **macOS**: `Hermes.Computer.Use_x.x.x_universal.dmg`
- **Linux**: `hermes-computer-use_x.x.x_amd64.deb`

### 首次运行

1. 启动 Hermes Console
2. 如果未检测到 Hermes Agent，会显示引导界面
3. 按照引导完成配置
4. 开始使用！

## 开发

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- Hermes Agent 已安装

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/Crown-22/Hermes-Computer-Use.git
cd Hermes-Computer-Use/hermes-app

# 安装依赖
npm install

# 启动开发模式
npm run tauri:dev
```

### 构建生产版本

```bash
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/` 目录。

## 技术栈

### 前端
- **React 19** - UI 框架
- **TypeScript 5.8** - 类型安全
- **Vite 7** - 构建工具
- **Tailwind CSS 4** - 样式框架
- **Zustand 5** - 状态管理

### 后端
- **Tauri 2** - 跨平台桌面应用框架
- **Rust** - 后端逻辑实现
- **Serde** - 序列化/反序列化

## 项目结构

```
hermes-app/
├── src/                      # 前端源码
│   ├── components/           # 可复用 UI 组件
│   ├── pages/                # 页面组件
│   │   ├── Dashboard/        # 首页仪表盘
│   │   ├── Sessions/         # 会话管理
│   │   ├── Skills/           # 技能管理
│   │   ├── CronJobs/         # 定时任务
│   │   ├── Settings/         # 系统设置
│   │   ├── Monitor/          # 系统监控
│   │   ├── Memory/           # 记忆管理
│   │   ├── Platforms/        # 平台配置
│   │   └── Files/            # 文件管理
│   ├── stores/               # Zustand 状态管理
│   ├── services/             # API 服务层
│   └── types/                # TypeScript 类型定义
├── src-tauri/                # Tauri 后端源码
│   └── src/commands/         # Tauri 命令模块
└── public/                   # 静态资源
```

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

### 开发指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目采用 [MIT License](LICENSE) 许可证。

## 致谢

- [Hermes Agent](https://github.com/hermes-agent/hermes) - 强大的 AI Agent 框架
- [Tauri](https://tauri.app/) - 现代化的桌面应用框架
- [React](https://react.dev/) - 流行的 UI 框架

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Crown-22">Crown_22</a>
</p>
