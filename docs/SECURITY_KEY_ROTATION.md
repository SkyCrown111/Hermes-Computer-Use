# 密钥泄露补救说明（P0）

Git 历史中曾误提交 `src-tauri/~/.hermes/config.yaml`（含 `model.api_key` 与 `API_SERVER_KEY`）。  
本地仓库已用 `git filter-branch` 从全部提交中移除该文件。

## 密钥轮换

**状态：已完成**（维护者已轮换 `model.api_key` 与 `API_SERVER_KEY` 并更新本机 `~/.hermes/config.yaml`。）

若在其他环境克隆过旧仓库，请确认该环境配置也已更新为新密钥，勿复用旧值。

## 同步远程仓库（维护者）

本地 `main` 历史已重写。更新 GitHub 远程需**强制推送**（与协作者提前沟通）：

```bash
git push origin --force --all
git push origin --force --tags
```

协作者请重新 `clone`，或 `git fetch origin && git reset --hard origin/main`。

## 验证

```powershell
pwsh ./scripts/verify-no-hermes-config-in-git.ps1
```

`git log main -- "src-tauri/~/.hermes/config.yaml"` 应无输出。
