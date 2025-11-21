# Codex Chat 桌面端

跨平台桌面应用，基于 **Tauri 2 + Rust** 和 **React + Vite**，通过 `codex` CLI 提供多会话 AI 对话与文档开发自动化能力。

## 功能亮点
- 双模式：文档开发模式（结构化输出、自动循环）与通用聊天模式可切换
- 多会话管理：新建、重命名、删除，消息与会话持久化到本地 SQLite
- 模型与思考深度选择：支持切换多种 Codex/GPT 模型及思考力度
- 文档辅助与自动化：可选择本地文档注入提示，未检测到完成标记时自动继续迭代并通知
- Tauri 原生能力：调用本地 `codex exec --json`，支持流式返回与系统通知

## 目录结构
- `Backend/src-tauri/`：Tauri 2 后端（Rust），封装会话/消息命令，调用 `codex` CLI，SQLite 数据存储
- `UI/`：前端（React 19 + Vite 7 + Tailwind + Radix UI + Framer Motion），提供聊天与文档自动化界面

## 环境要求
- Rust 稳定版（含 `cargo`）
- Node.js ≥ 18 与 npm
- Tauri CLI 2.x：`cargo install tauri-cli --version ^2`
- 已安装并可在 PATH 中调用的 `codex` CLI（用于 `codex exec --json`）

## 配置
后端默认读取以下环境变量：
- `CODEX_API_KEY`：Codex/OpenAI API key
- `CODEX_API_ENDPOINT`：API 地址，默认 `https://api.openai.com/v1/chat/completions`
- `CODEX_MODEL`：默认模型名，默认 `gpt-5.1-codex-max`

本地数据存储在系统用户数据目录下的 `codex-chat/database.db`，如 Linux 通常位于 `~/.local/share/codex-chat/`。

## 开发与调试
1) 安装前端依赖
```bash
cd UI
npm install
```
2) 启动前端开发服务器（供 Tauri devUrl 使用）
```bash
npm run dev -- --host
```
3) 启动 Tauri 后端
```bash
cd ../Backend/src-tauri
cargo tauri dev
```

## 构建发布
1) 构建前端产物
```bash
cd UI
npm run build
```
2) 构建桌面应用（使用上一步生成的 `UI/dist`）
```bash
cd ../Backend/src-tauri
cargo tauri build
```

## 故障排查
- 确认 `codex` 可在终端直接运行，且网络与 API key 有效，否则聊天调用会失败
- 若 Tauri 开发时无法加载前端，请确保前端 dev server 正在运行且端口与 `tauri.conf.json` 中的 `devUrl` 一致
- 数据库存储路径可在首次启动后检查，必要时删除以重置会话数据
