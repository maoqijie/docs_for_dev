# Docs For Dev

<div align="center">

**智能化文档开发与 AI 对话桌面应用**

基于 Tauri 2 + Rust + React 构建的跨平台开发助手

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/yourusername/docs-for-dev)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)

</div>

## 📖 项目简介

Docs For Dev 是一款专为开发者打造的跨平台桌面应用，集成了 AI 对话能力与文档自动化工作流。通过调用 `codex` CLI 工具,实现智能化的文档开发、代码生成和任务自动执行。

### 🎯 核心特性

#### 🔄 双模式工作流
- **文档开发模式**: 专注于结构化文档撰写、开发步骤规划与自动化执行
  - 智能完成检测,自动判断任务是否完成
  - 循环执行机制,支持多轮迭代优化
  - 系统通知提醒,任务完成即时反馈

- **通用聊天模式**: 保持自然对话体验,适用于日常技术问答与代码讨论
  - 自由交互,无自动化流程干扰
  - 适合快速问答、代码调试等场景

#### 💬 智能会话管理
- **多会话并行**: 支持创建、重命名、删除多个独立会话
- **持久化存储**: 基于 SQLite 的本地数据库,会话与消息永久保存
- **会话分组**: 根据工作模式自动归类,清晰管理不同类型的对话
- **层级关系**: 支持根会话与子会话管理,自动化任务产生的会话自动关联

#### 🤖 文档自动化引擎
- **智能循环执行**: 自动迭代执行文档任务,无需人工干预
- **完成信号检测**: 自定义关键词识别任务完成状态
- **灵活配置**:
  - 自定义任务提示词
  - 设置下一步执行指令
  - 配置最大循环次数或无限循环
  - 选择是否每轮创建新会话
- **实时通知**: 任务完成时发送系统通知,及时掌握执行进度

#### 📄 文档管理
- **批量文档注入**: 一键选择多个 Markdown 文件,自动附加到对话上下文
- **工作目录绑定**: 指定项目根目录,自动识别相关文档
- **文件预览**: 查看已选择文档的大小、路径等信息

#### 🎨 现代化用户界面
- **无障碍设计**: 基于 Radix UI 的高质量组件库
- **流畅动画**: Framer Motion 提供丝滑的交互体验
- **暗色主题**: 默认暗色模式,护眼且专业
- **Markdown 渲染**: 完整支持 GFM 扩展语法
- **代码高亮**: 自动识别代码块并进行语法高亮
- **响应式布局**: 适配不同屏幕尺寸,灵活调整窗口大小

#### ⚙️ 灵活配置
- **多模型支持**: 支持 GPT-5、Codex 等多种 AI 模型
- **思考深度调节**: 可选 quick/normal/deep 三种推理模式
- **提示词模板**: 自定义常用提示词,提高工作效率
- **环境变量配置**: 支持通过环境变量自定义 API Key、Endpoint 等

## 🛠️ 技术栈

### 前端技术
- **核心框架**: React 19 + TypeScript 5.9
- **构建工具**: Vite 7
- **样式方案**: Tailwind CSS 3 + Autoprefixer
- **UI 组件**:
  - Radix UI（Avatar, ScrollArea, Select, Separator, Slot）
  - 自定义组件基于 class-variance-authority
- **动画库**: Framer Motion 12
- **Markdown**:
  - react-markdown 10
  - remark-gfm 4（GFM 扩展支持）
- **代码高亮**: react-syntax-highlighter 16
- **图标库**: Lucide React
- **工具库**:
  - clsx（条件类名）
  - tailwind-merge（类名合并）
  - date-fns（时间处理）

### 后端技术
- **应用框架**: Tauri 2.0
- **语言**: Rust 2021 Edition
- **异步运行时**: Tokio（full 特性）
- **数据库**:
  - rusqlite 0.31（bundled 特性）
  - SQLite 本地存储
- **HTTP 客户端**: reqwest 0.11（json + stream 特性）
- **序列化**:
  - serde（derive 特性）
  - serde_json
- **Tauri 插件**:
  - tauri-plugin-shell（进程管理）
  - tauri-plugin-notification（系统通知）
  - tauri-plugin-dialog（文件对话框）
- **工具库**:
  - uuid（v4 + serde）
  - chrono（serde 特性）
  - anyhow（错误处理）
  - futures（异步流）
  - dirs（系统目录）

### 构建优化
- **前端**:
  - TypeScript 类型检查
  - ESLint 代码规范
  - Vite 生产构建优化
- **后端**:
  - Rust Release 模式优化（opt-level = "z"）
  - LTO（链接时优化）
  - Strip 符号表（减小体积）
  - 单代码生成单元（codegen-units = 1）

## 📂 项目结构

```
docs-for-dev/
├── Backend/
│   └── src-tauri/                  # Tauri 后端（Rust）
│       ├── src/
│       │   ├── api/
│       │   │   ├── client.rs       # Codex CLI 客户端封装
│       │   │   └── mod.rs          # API 模块导出
│       │   ├── db/
│       │   │   ├── manager.rs      # 数据库管理器
│       │   │   ├── models.rs       # 数据模型定义
│       │   │   └── mod.rs          # DB 模块导出
│       │   ├── commands.rs         # Tauri 命令处理
│       │   ├── prompt_templates.rs # 提示词模板管理
│       │   ├── lib.rs              # 库入口
│       │   └── main.rs             # 应用入口
│       ├── icons/                  # 应用图标
│       ├── Cargo.toml              # Rust 依赖配置
│       └── tauri.conf.json         # Tauri 应用配置
│
├── UI/                             # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                 # 基础 UI 组件
│   │   │   │   ├── button.tsx      # 按钮组件
│   │   │   │   ├── input.tsx       # 输入框组件
│   │   │   │   ├── textarea.tsx    # 文本域组件
│   │   │   │   ├── card.tsx        # 卡片组件
│   │   │   │   ├── avatar.tsx      # 头像组件
│   │   │   │   ├── separator.tsx   # 分隔线组件
│   │   │   │   ├── scroll-area.tsx # 滚动区域组件
│   │   │   │   └── select.tsx      # 下拉选择组件
│   │   │   ├── ChatPanel.tsx       # 聊天面板（核心组件）
│   │   │   ├── MessageList.tsx     # 消息列表
│   │   │   ├── InputBox.tsx        # 输入框（支持文档注入）
│   │   │   ├── Sidebar.tsx         # 侧边栏（会话管理）
│   │   │   ├── TemplateEditor.tsx  # 模板编辑器
│   │   │   └── ThemeProvider.tsx   # 主题提供者
│   │   ├── lib/
│   │   │   ├── api.ts              # Tauri API 封装
│   │   │   ├── tauri.ts            # Tauri 工具函数
│   │   │   └── utils.ts            # 通用工具函数
│   │   ├── App.tsx                 # 应用主组件
│   │   ├── main.tsx                # 应用入口
│   │   └── index.css               # 全局样式
│   ├── package.json                # npm 依赖配置
│   ├── vite.config.ts              # Vite 构建配置
│   ├── tailwind.config.js          # Tailwind CSS 配置
│   ├── tsconfig.json               # TypeScript 配置
│   └── eslint.config.js            # ESLint 配置
│
└── README.md                       # 项目文档
```

## 🚀 快速开始

### 环境要求

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18.0.0 | 前端开发与构建 |
| npm | >= 9.0.0 | 包管理器 |
| Rust | 稳定版（latest） | 后端编译 |
| Cargo | 与 Rust 同版本 | Rust 包管理 |
| Tauri CLI | ^2.0.0 | Tauri 应用构建工具 |
| **codex CLI** | 已安装并在 PATH 中 | **核心依赖（必需）** |

### 安装 Tauri CLI

```bash
cargo install tauri-cli --version ^2
```

### 安装前端依赖

```bash
cd UI
npm install
```

### 安装 codex CLI

请参考 codex 官方文档安装 `codex` 命令行工具，确保可以在终端中直接运行：

```bash
# 验证安装
codex --version
```

### 配置环境变量

创建 `.env` 文件或设置系统环境变量：

```bash
# API 配置
export CODEX_API_KEY="your-api-key-here"
export CODEX_API_ENDPOINT="https://api.openai.com/v1/chat/completions"
export CODEX_MODEL="gpt-5.2"
```

## 🔨 开发模式

### 1. 启动前端开发服务器

```bash
cd UI
npm run dev -- --host
```

前端将运行在 `http://localhost:5173`

### 2. 启动 Tauri 应用

在**新终端**中运行：

```bash
cd Backend/src-tauri
cargo tauri dev
```

应用将自动打开窗口，并连接到前端开发服务器。

热重载：
- **前端更改**: Vite 自动热更新
- **Rust 代码更改**: Cargo 自动重新编译并重启

## 📦 生产构建

### 1. 构建前端静态资源

```bash
cd UI
npm run build
```

构建产物输出到 `UI/dist` 目录。

### 2. 构建桌面应用

```bash
cd Backend/src-tauri
cargo tauri build
```

### 构建产物位置

构建完成后，安装包位于 `Backend/src-tauri/target/release/bundle/`：

#### Linux
- **AppImage**: `codex-chat_1.1.0_amd64.AppImage`（便携版）
- **Deb**: `codex-chat_1.1.0_amd64.deb`（Debian/Ubuntu）

#### Windows
- **MSI**: `Codex Chat_1.1.0_x64_en-US.msi`

#### macOS
- **DMG**: `Codex Chat_1.1.0_x64.dmg`
- **App**: `Codex Chat.app`

## ⚙️ 配置说明

### 数据存储路径

应用数据存储在系统用户数据目录：

- **Linux**: `~/.local/share/codex-chat/database.db`
- **Windows**: `%APPDATA%\codex-chat\database.db`
- **macOS**: `~/Library/Application Support/codex-chat/database.db`

### Tauri 配置文件

编辑 `Backend/src-tauri/tauri.conf.json` 可修改：

```json
{
  "productName": "Codex Chat",           // 应用名称
  "identifier": "com.example.codex-chat", // Bundle ID
  "version": "1.1.0",                     // 版本号
  "build": {
    "frontendDist": "../../UI/dist",      // 前端构建产物路径
    "devUrl": "http://localhost:5173"     // 开发服务器地址
  },
  "bundle": {
    "targets": [                          // 打包目标平台
      "app", "appimage", "deb", "msi", "dmg"
    ]
  },
  "app": {
    "windows": [{
      "title": "Codex Chat",              // 窗口标题
      "width": 960,                       // 默认宽度
      "height": 640,                      // 默认高度
      "resizable": true                   // 可调整大小
    }]
  }
}
```

### 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CODEX_API_KEY` | 无（必需） | API 访问密钥 |
| `CODEX_API_ENDPOINT` | `https://api.openai.com/v1/chat/completions` | API 端点地址 |
| `CODEX_MODEL` | `gpt-5.2` | 默认模型名称 |

## 📚 使用指南

### 首次启动：模式选择

首次启动应用时，会显示模式选择界面：

#### 🔷 文档开发模式（推荐）
- **适用场景**:
  - 结构化文档撰写
  - 开发任务规划与执行
  - 需要自动化迭代的复杂任务
- **特性**:
  - 智能完成检测
  - 自动循环执行
  - 系统通知提醒

#### 🔶 通用聊天模式
- **适用场景**:
  - 日常技术问答
  - 代码调试与咨询
  - 自由交互对话
- **特性**:
  - 无自动化流程
  - 专注对话体验

### 会话管理

#### 新建会话
- 点击侧边栏顶部的 **➕ 新建会话** 按钮
- 文档开发模式默认标题："新任务"
- 通用模式默认标题："新对话"

#### 切换会话
- 点击侧边栏的会话卡片
- 当前激活会话会高亮显示

#### 重命名会话
1. 悬停在会话卡片上
2. 双击会话标题
3. 输入新名称并回车

#### 删除会话
1. 悬停在会话卡片上
2. 点击右侧的删除图标 🗑️
3. 确认删除（会同时删除所有消息）

### 文档自动化（文档开发模式）

#### 配置自动化任务

1. 点击输入框上方的 **🪄 自动化配置** 按钮
2. 在弹出的配置面板中设置：

**基础配置**:
- **任务提示**: 每轮循环执行的指令（例如："继续优化文档结构"）
- **完成信号**: 检测任务完成的关键词（例如："完成"、"done"、"FINISHED"）
- **下一步**: 完成后的后续指令（例如："生成总结报告"）

**循环控制**:
- **最大循环次数**:
  - 设置为 `0` 表示无限循环
  - 设置具体数字防止无限执行（例如 `10`）
- **无限循环模式**: 勾选后忽略最大次数限制

**会话策略**:
- **自动重启会话**: 每轮循环前清空会话历史
- **每轮创建新会话**: 为每轮任务创建独立会话（便于回溯）

**通知设置**:
- **通知文本**: 自定义任务完成时的通知内容

#### 启动自动化

1. 配置完成后，点击 **▶️ 启动自动化** 按钮
2. 自动化引擎开始执行：
   - 发送任务提示
   - 等待 AI 响应
   - 检测完成信号
   - 未完成则继续下一轮
   - 完成后发送系统通知

#### 停止自动化

- 点击 **⏹️ 停止自动化** 按钮
- 当前轮次执行完成后停止

### 文档注入

#### 选择工作目录

1. 点击输入框上方的 **📂 选择工作目录** 按钮
2. 在文件对话框中选择项目根目录
3. 目录路径会显示在按钮旁边

#### 批量选择文档

1. 点击 **📄 选择文档** 按钮
2. 在文件对话框中多选 `.md` 文件（支持 Ctrl/Cmd + 点击）
3. 已选择的文档会显示在文档列表中：
   - 文件名
   - 相对路径
   - 文件大小

#### 发送附带文档的消息

- 文档内容会自动附加到下一条消息
- 发送后文档列表清空（可重新选择）

#### 移除单个文档

- 点击文档列表中的 **✕** 按钮

### 模型与思考深度

#### 选择模型

点击右上角的模型下拉菜单：
- `gpt-5.2`（默认）
- `gpt-5.2-codex`
- `gpt-5.3-codex`
- `gpt-5.2-pro`

#### 选择思考深度

点击思考深度下拉菜单：
- **Quick**: 快速响应，适合简单问题
- **Normal**: 标准推理，平衡速度与质量
- **Deep**: 深度思考，适合复杂问题

### 提示词模板

1. 点击侧边栏底部的 **📝 模板** 按钮
2. 在模板编辑器中管理常用提示词
3. 点击模板可快速插入到输入框

## 🔧 开发指南

### 前端开发

#### 添加新组件

```bash
cd UI/src/components
touch MyComponent.tsx
```

示例组件：

```typescript
import { FC } from 'react';

interface MyComponentProps {
  title: string;
}

export const MyComponent: FC<MyComponentProps> = ({ title }) => {
  return (
    <div className="p-4 rounded-lg bg-card">
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
};
```

#### 调用 Tauri 命令

在 `UI/src/lib/api.ts` 中添加 API 函数：

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface MyData {
  id: string;
  value: string;
}

export async function getMyData(): Promise<MyData> {
  return await invoke<MyData>('get_my_data');
}
```

在组件中使用：

```typescript
import { useEffect, useState } from 'react';
import { getMyData, type MyData } from '../lib/api';

export function MyComponent() {
  const [data, setData] = useState<MyData | null>(null);

  useEffect(() => {
    getMyData().then(setData).catch(console.error);
  }, []);

  return <div>{data?.value}</div>;
}
```

#### 样式规范

- **优先使用 Tailwind 实用类**:
  ```tsx
  <div className="flex items-center gap-2 p-4 rounded-lg bg-card">
  ```

- **条件类名使用 `clsx` 或 `cn`**:
  ```tsx
  import { cn } from '../lib/utils';

  <button className={cn(
    "px-4 py-2 rounded",
    isActive && "bg-primary text-white",
    !isActive && "bg-muted"
  )}>
  ```

- **遵循 Radix UI 无障碍规范**:
  ```tsx
  <Button aria-label="关闭对话框">关闭</Button>
  ```

### 后端开发

#### 添加 Tauri 命令

1. 在 `Backend/src-tauri/src/commands.rs` 中定义命令：

```rust
use tauri::State;
use crate::db::manager::DbManager;

#[tauri::command]
pub async fn get_my_data(
    db: State<'_, DbManager>
) -> Result<MyData, String> {
    // 实现业务逻辑
    let data = db.query_my_data()
        .map_err(|e| e.to_string())?;

    Ok(data)
}

#[derive(serde::Serialize)]
pub struct MyData {
    pub id: String,
    pub value: String,
}
```

2. 在 `Backend/src-tauri/src/lib.rs` 中注册命令：

```rust
use commands::get_my_data;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_my_data,  // 添加新命令
            // ... 其他命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 数据库操作

使用 `DbManager` 进行 SQLite 操作：

```rust
use crate::db::manager::DbManager;
use crate::db::models::Session;

impl DbManager {
    pub fn create_my_table(&self) -> Result<()> {
        let conn = self.get_connection()?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS my_table (
                id TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        Ok(())
    }

    pub fn insert_data(&self, id: &str, value: &str) -> Result<()> {
        let conn = self.get_connection()?;

        conn.execute(
            "INSERT INTO my_table (id, value, created_at) VALUES (?1, ?2, ?3)",
            params![id, value, chrono::Utc::now().to_rfc3339()],
        )?;

        Ok(())
    }
}
```

#### 错误处理

使用 `anyhow` 进行错误处理：

```rust
use anyhow::{Context, Result};

pub fn my_function() -> Result<String> {
    let data = std::fs::read_to_string("file.txt")
        .context("读取文件失败")?;

    Ok(data)
}
```

在 Tauri 命令中转换错误：

```rust
#[tauri::command]
pub async fn my_command() -> Result<String, String> {
    my_function().map_err(|e| e.to_string())
}
```

## 🐛 故障排查

### 常见问题

#### 1. `codex` 命令未找到

**错误信息**:
```
Command not found: codex
Error executing codex: No such file or directory
```

**解决方法**:

```bash
# 1. 确认 codex 是否已安装
which codex
codex --version

# 2. 如果未安装，请安装 codex CLI

# 3. 确保 codex 在 PATH 中
echo $PATH

# 4. 如果不在 PATH 中，添加到 shell 配置文件（~/.bashrc 或 ~/.zshrc）
export PATH="$PATH:/path/to/codex"
source ~/.bashrc  # 或 source ~/.zshrc
```

#### 2. Tauri 开发模式无法加载前端

**错误信息**:
```
Failed to load http://localhost:5173
Connection refused
```

**解决方法**:

1. **确保前端开发服务器正在运行**:
   ```bash
   cd UI
   npm run dev -- --host
   ```

2. **检查端口是否被占用**:
   ```bash
   # Linux/macOS
   lsof -i :5173

   # Windows
   netstat -ano | findstr :5173
   ```

3. **验证 `tauri.conf.json` 配置**:
   ```json
   {
     "build": {
       "devUrl": "http://localhost:5173"  // 确保端口一致
     }
   }
   ```

4. **清除缓存并重启**:
   ```bash
   # 清除前端缓存
   cd UI
   rm -rf node_modules/.vite

   # 重新启动
   npm run dev -- --host
   ```

#### 3. 数据库权限错误

**错误信息**:
```
Permission denied: database.db
Unable to open database file
```

**解决方法**:

```bash
# 1. 找到数据库文件位置
# Linux: ~/.local/share/codex-chat/database.db
# macOS: ~/Library/Application Support/codex-chat/database.db
# Windows: %APPDATA%\codex-chat\database.db

# 2. 删除旧数据库（会丢失所有会话数据！）
rm ~/.local/share/codex-chat/database.db  # Linux
rm ~/Library/Application\ Support/codex-chat/database.db  # macOS

# 3. 检查目录权限
ls -la ~/.local/share/codex-chat/

# 4. 修复权限（如果需要）
chmod 755 ~/.local/share/codex-chat/
chmod 644 ~/.local/share/codex-chat/database.db

# 5. 重启应用，将自动重建数据库
```

#### 4. API 调用失败

**错误信息**:
```
API key not configured
Failed to call API: 401 Unauthorized
Connection timeout
```

**解决方法**:

1. **检查环境变量**:
   ```bash
   echo $CODEX_API_KEY
   echo $CODEX_API_ENDPOINT
   echo $CODEX_MODEL
   ```

2. **设置环境变量**（临时）:
   ```bash
   export CODEX_API_KEY="sk-your-api-key-here"
   export CODEX_API_ENDPOINT="https://api.openai.com/v1/chat/completions"
   export CODEX_MODEL="gpt-5.2"
   ```

3. **永久设置**（添加到 shell 配置）:
   ```bash
   # 编辑 ~/.bashrc 或 ~/.zshrc
   echo 'export CODEX_API_KEY="sk-your-api-key-here"' >> ~/.bashrc
   source ~/.bashrc
   ```

4. **验证 API Key 有效性**:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $CODEX_API_KEY"
   ```

5. **检查网络连接**:
   ```bash
   ping api.openai.com
   curl -I https://api.openai.com
   ```

#### 5. Rust 编译错误

**错误信息**:
```
error: linking with `cc` failed
could not compile `codex-chat`
```

**解决方法**:

```bash
# 1. 更新 Rust 工具链
rustup update stable

# 2. 清除构建缓存
cd Backend/src-tauri
cargo clean

# 3. 重新构建
cargo build

# 4. 如果是依赖问题，尝试更新 Cargo.lock
cargo update

# 5. 检查系统依赖（Linux）
# Ubuntu/Debian
sudo apt-get install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel \
    openssl-devel \
    curl \
    wget \
    file \
    libappindicator-gtk3-devel \
    librsvg2-devel

# Arch
sudo pacman -S webkit2gtk \
    base-devel \
    curl \
    wget \
    file \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg
```

#### 6. 前端构建错误

**错误信息**:
```
Module not found
TypeScript error
Vite build failed
```

**解决方法**:

```bash
# 1. 删除 node_modules 和 lock 文件
cd UI
rm -rf node_modules package-lock.json

# 2. 重新安装依赖
npm install

# 3. 清除 TypeScript 缓存
rm -rf tsconfig.tsbuildinfo

# 4. 清除 Vite 缓存
rm -rf node_modules/.vite

# 5. 重新构建
npm run build
```

#### 7. Linux GTK 初始化失败（X11 客户端数达上限）

**错误信息**:
```
Maximum number of clients reached
Failed to initialize gtk backend!
Failed to initialize GTK
```

**原因说明**:

当前 `DISPLAY` 对应的 X11 会话连接数已达到上限，导致 Tauri 无法初始化 GTK。

**解决方法**:

1. **关闭部分图形程序后重试**（浏览器、IDE、聊天工具等）:
   ```bash
   # 查看 X11 连接占用前 20 的进程
   lsof -U /tmp/.X11-unix/X${DISPLAY#:} 2>/dev/null \
     | awk 'NR>1 {print $1, $2}' \
     | sort | uniq -c | sort -nr | head -20
   ```

2. **检查显示连接是否可用**:
   ```bash
   xdpyinfo -display "$DISPLAY"
   ```

3. **必要时重启图形会话**:
   - 注销当前桌面会话后重新登录
   - 或重启系统以释放异常占用连接

4. **使用启动脚本快速诊断**:
   - `./start_dev.sh` 会在启动 Tauri 前自动检测显示环境
   - 若 X11 客户端数量超过软阈值（默认 240），会提前中止，避免编译后才失败
   - 可通过 `X11_CLIENT_SOFT_LIMIT=300 ./start_dev.sh` 临时调整阈值
   - 若命中此问题，会直接给出可读错误并打印高占用进程

### 调试技巧

#### 前端调试

1. **启用浏览器开发者工具**:
   - 在 Tauri 窗口中按 `F12` 或 `Ctrl+Shift+I`
   - 查看控制台、网络请求、React 组件树

2. **查看 Vite 日志**:
   ```bash
   cd UI
   npm run dev -- --debug
   ```

3. **启用 React DevTools**:
   - 安装浏览器扩展
   - 在 Tauri 窗口中使用

#### 后端调试

1. **查看 Rust 日志**:
   ```bash
   # 设置日志级别
   export RUST_LOG=debug

   # 启动应用
   cargo tauri dev
   ```

2. **使用 `println!` 调试**:
   ```rust
   println!("Debug: {:?}", variable);
   eprintln!("Error: {}", error);
   ```

3. **使用 Rust 调试器**:
   ```bash
   # 使用 lldb（macOS/Linux）
   cargo build
   lldb target/debug/codex-chat

   # 使用 gdb（Linux）
   gdb target/debug/codex-chat
   ```

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出新功能建议！

### 贡献流程

1. **Fork 本仓库**
2. **创建特性分支**:
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **提交更改**:
   ```bash
   git commit -m 'feat: add some amazing feature'
   ```
4. **推送到分支**:
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **提交 Pull Request**

### 代码规范

#### 前端代码
- 遵循 ESLint 规则（`npm run lint`）
- 使用 TypeScript 严格模式
- 组件命名使用 PascalCase
- 文件名使用 PascalCase（组件）或 camelCase（工具函数）

#### 后端代码
- 遵循 Rust 官方风格指南
- 使用 `cargo fmt` 格式化代码
- 使用 `cargo clippy` 检查代码质量

#### 提交信息
遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 新增功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整（不影响功能）
refactor: 重构代码
test: 测试相关
chore: 构建工具或辅助工具的变动
```

示例：
```
feat: 添加文档批量导出功能
fix: 修复会话删除后界面未更新的问题
docs: 更新 README 中的环境配置说明
```

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

感谢以下开源项目：

- [Tauri](https://tauri.app/) - 轻量级跨平台应用框架
- [React](https://react.dev/) - 现代化 UI 框架
- [Radix UI](https://www.radix-ui.com/) - 无障碍组件库
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架
- [Framer Motion](https://www.framer.com/motion/) - 流畅的动画库
- [Vite](https://vitejs.dev/) - 极速前端构建工具
- [Tokio](https://tokio.rs/) - 异步运行时
- [rusqlite](https://github.com/rusqlite/rusqlite) - SQLite Rust 绑定


---

<div align="center">

**[⬆️ 回到顶部](#docs-for-dev)**

Made with ❤️ by the Docs For Dev Team

</div>
