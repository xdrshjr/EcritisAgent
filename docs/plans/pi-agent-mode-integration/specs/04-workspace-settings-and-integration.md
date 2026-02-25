# Spec 04: 工作目录设置与集成测试

## 1. 概述

本 spec 覆盖两个方面：Settings 页面中的 Agent 工作目录持久化配置，以及整体集成测试验证。

## 2. Settings 页 Agent 配置

### 2.1 设置面板位置

在 SettingsContainer 的侧边栏导航中添加 "Agent" 设置项，位于现有设置项之后：

```
设置侧边栏:
  ├── 模型配置
  ├── MCP 服务
  ├── 搜索服务
  ├── 图像服务
  ├── 显示设置
  └── Agent 设置    ← 新增
```

### 2.2 Agent 设置面板: AgentSettingsPanel

```
┌──────── Agent 设置 ────────────────────┐
│                                         │
│  默认工作目录                            │
│  ┌──────────────────────────────┐ [📁]  │
│  │ /path/to/default/project    │       │
│  └──────────────────────────────┘       │
│  Agent 模式开启时默认使用此目录            │
│                                         │
│  最近使用的目录                           │
│  ┌─────────────────────────────────┐    │
│  │ /path/to/project-a        [✗]  │    │
│  │ /path/to/project-b        [✗]  │    │
│  │ /path/to/project-c        [✗]  │    │
│  └─────────────────────────────────┘    │
│  [清除所有历史]                          │
│                                         │
│                    [保存]               │
└─────────────────────────────────────────┘
```

### 2.3 配置存储

Agent 配置存储在 localStorage 中：

```
存储键:
  aidocmaster.agentWorkDir      → string (默认工作目录)
  aidocmaster.agentRecentDirs   → string[] (最近使用的目录列表，最多 10 个)
```

### 2.4 配置管理函数

```
// lib/agentConfig.ts

function loadAgentConfig(): AgentConfig
  从 localStorage 读取 agentWorkDir 和 agentRecentDirs
  返回 { workDir, recentDirs }

function saveAgentWorkDir(path: string): void
  保存到 localStorage
  同时添加到 recentDirs（去重，最多 10 个）

function loadRecentDirs(): string[]
  从 localStorage 读取，返回最近使用的目录列表

function removeRecentDir(path: string): void
  从 recentDirs 中移除指定目录

function clearRecentDirs(): void
  清空 recentDirs

// 事件通知
const AGENT_CONFIG_UPDATED_EVENT = 'aidocmaster_agent_config_updated'
```

### 2.5 目录验证

```
// 在 API Route 端验证（Node.js 环境）
async function validateWorkDir(dirPath: string): Promise<boolean>
  检查路径是否存在 (fs.access)
  检查是否为目录 (fs.stat)
  检查是否可读 (fs.access R_OK)
  返回验证结果

// 前端验证接口
GET /api/agent-chat/validate-dir?path=/path/to/dir
  → { valid: boolean, error?: string }
```

## 3. Electron 兼容性

### 3.1 文件系统访问

```
环境差异:
  Electron:
    - 完整文件系统访问权限
    - 原生文件夹选择对话框
    - 所有工具功能完整可用

  Web (开发模式 / 生产模式):
    - Next.js 服务端可访问本地文件系统
    - 文件夹选择使用 File System Access API (有限浏览器支持)
    - 或手动输入路径
    - 所有工具功能通过 API Route 在服务端执行，完整可用
```

### 3.2 Electron preload 扩展

```
// electron/preload.js 新增接口
electronAPI:
  selectDirectory() → Promise<string | null>
    调用 Electron dialog.showOpenDialog
    返回用户选择的目录路径或 null

// types/electron.d.ts 类型定义更新
interface ElectronAPI {
  ...existing,
  selectDirectory: () => Promise<string | null>;
}
```

## 4. 集成测试计划

### 4.1 单元测试

| 测试文件 | 覆盖内容 |
|---------|---------|
| `lib/__tests__/agentLlmAdapter.test.ts` | LLM 配置转换 |
| `lib/__tests__/agentConfig.test.ts` | Agent 配置存储/加载 |
| `lib/__tests__/agentStreamParser.test.ts` | SSE 流解析 |
| `components/__tests__/AgentToggle.test.tsx` | 开关切换行为 |
| `components/__tests__/AgentToolCallDisplay.test.tsx` | 工具展示渲染 |

### 4.2 集成测试

```
测试场景 1: 基本 Agent 对话
  1. 开启 Agent 模式
  2. 设置工作目录
  3. 发送 "列出当前目录文件"
  4. 验证: Agent 调用 list_directory 工具
  5. 验证: 工具结果正确展示在消息流中
  6. 验证: Agent 文本回复正确展示

测试场景 2: 文件编辑
  1. Agent 模式下发送 "读取 package.json"
  2. 验证: read_file 工具被调用
  3. 验证: 文件内容正确展示
  4. 发送 "修改 description 字段"
  5. 验证: edit_file 工具被调用
  6. 验证: 修改结果正确展示

测试场景 3: Shell 命令执行
  1. 发送 "执行 npm test"
  2. 验证: execute_command 工具被调用
  3. 验证: 命令输出正确展示
  4. 验证: 长时间运行命令的流式输出

测试场景 4: 模式切换
  1. 在普通模式下发送消息 → 走 /api/chat
  2. 切换到 Agent 模式 → 走 /api/agent-chat
  3. 切换回普通模式 → 走 /api/chat
  4. 验证: 消息历史不丢失

测试场景 5: 错误处理
  1. 设置无效的工作目录
  2. 验证: 错误提示正确显示
  3. API Key 无效时
  4. 验证: 错误通过 SSE 传递并显示
```

### 4.3 手动验证清单

- [ ] Electron 环境下文件夹选择器正常工作
- [ ] Web 环境下路径输入正常工作
- [ ] Agent 工具可正确读写用户指定目录中的文件
- [ ] 长时间运行的命令不会导致 API Route 超时
- [ ] 停止按钮可正确中断 Agent 执行
- [ ] 切换对话时 Agent 状态正确重置
- [ ] Settings 页保存的工作目录在重启后正确加载
- [ ] 多个并发 Agent 会话不会互相干扰

## 5. 部署注意事项

### 5.1 Electron 打包

```
新增需要打包的文件:
  - node_modules/@mariozechner/pi-agent-core/
  - node_modules/@mariozechner/pi-ai/
  - node_modules/@mariozechner/pi-coding-agent/
  - 以及它们的依赖

electron-builder.json 可能需要调整:
  - 确保上述包包含在 asar 中
  - 如果有 native 依赖需要排除 asar
```

### 5.2 安全考虑

虽然选择了"不加限制"，但以下最佳实践应保留：

```
- 工具执行的路径解析应规范化（防止 ../.. 路径穿越）
- Shell 命令超时限制（防止无限运行）
- 文件读取大小限制（防止读取超大文件导致内存溢出）
- API Route 连接超时（防止僵尸连接）
```

## 6. 文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `components/AgentSettingsPanel.tsx` | 新建 | Agent 设置面板 |
| `components/SettingsContainer.tsx` | 修改 | 添加 Agent 设置导航项 |
| `lib/agentConfig.ts` | 新建 | Agent 配置管理 |
| `app/api/agent-chat/validate-dir/route.ts` | 新建 | 目录验证 API |
| `electron/preload.js` | 修改 | 添加 selectDirectory |
| `electron/main.js` | 修改 | 添加 select-directory handler |
| `types/electron.d.ts` | 修改 | 添加 selectDirectory 类型 |

## 7. 全部新增文件汇总（跨所有 spec）

| 文件路径 | 来源 spec |
|---------|----------|
| `lib/agentLlmAdapter.ts` | Spec 01 |
| `lib/agentConfig.ts` | Spec 04 |
| `lib/agentStreamParser.ts` | Spec 03 |
| `lib/agentTools.ts` | Spec 02 |
| `lib/agentEventMapper.ts` | Spec 02 |
| `app/api/agent-chat/route.ts` | Spec 02 |
| `app/api/agent-chat/validate-dir/route.ts` | Spec 04 |
| `components/AgentToggle.tsx` | Spec 03 |
| `components/AgentWorkDirBar.tsx` | Spec 03 |
| `components/AgentWorkDirDialog.tsx` | Spec 03 |
| `components/AgentToolCallDisplay.tsx` | Spec 03 |
| `components/AgentThinkingIndicator.tsx` | Spec 03 |
| `components/AgentSettingsPanel.tsx` | Spec 04 |

## 8. 全部修改文件汇总（跨所有 spec）

| 文件路径 | 修改内容 |
|---------|---------|
| `package.json` | 添加 pi-mono 依赖 |
| `components/ChatPanel.tsx` | Agent 模式状态 + 消息处理 |
| `components/ChatInput.tsx` | Agent 开关 + 目录栏 |
| `components/ChatMessage.tsx` | Agent 工具调用渲染 |
| `components/SettingsContainer.tsx` | Agent 设置导航项 |
| `lib/i18n/dictionaries.ts` | Agent 翻译文案 |
| `electron/preload.js` | selectDirectory IPC |
| `electron/main.js` | select-directory handler |
| `types/electron.d.ts` | selectDirectory 类型 |
