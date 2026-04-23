# Contributing to Hermes Console

感谢你考虑为 Hermes Console 做贡献！

## 开发环境设置

### 前置要求

1. **Node.js** >= 18
2. **Rust** >= 1.70 (用于 Tauri 后端)
3. **Hermes Agent** 已安装并配置

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/Crown-22/hermes-console.git
cd hermes-console

# 安装前端依赖
npm install

# 启动开发模式
npm run tauri:dev
```

## 项目结构

```
hermes-app/
├── src/                    # 前端 React 代码
│   ├── components/         # 可复用 UI 组件
│   ├── pages/              # 页面组件
│   ├── stores/             # Zustand 状态管理
│   ├── services/           # API 服务层
│   └── types/              # TypeScript 类型定义
├── src-tauri/              # Tauri Rust 后端
│   └── src/commands/       # Tauri 命令模块
└── public/                 # 静态资源
```

## 开发指南

### 代码风格

- 使用 TypeScript 编写前端代码
- 使用 ESLint 和 Prettier 格式化代码
- Rust 代码遵循标准 Rust 风格

### 提交信息

请使用清晰的提交信息：

- `feat: 添加新功能`
- `fix: 修复 bug`
- `docs: 文档更新`
- `refactor: 代码重构`
- `style: 代码格式调整`

### 分支策略

- `main` - 稳定发布版本
- `develop` - 开发分支
- `feature/*` - 新功能分支
- `fix/*` - Bug 修复分支

## Pull Request 流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 问题反馈

如果你发现 bug 或有功能建议，请创建 Issue 并描述：

- 问题的详细描述
- 复现步骤
- 期望的行为
- 实际的行为
- 系统环境信息

## 许可证

本项目采用 MIT 许可证。贡献的代码将以相同许可证发布。
