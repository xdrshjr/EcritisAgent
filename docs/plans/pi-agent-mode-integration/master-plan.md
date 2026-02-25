# Master Plan: Pi Agent 模式集成

## 1. 项目概述与目标

将 [pi-mono](https://github.com/badlogic/pi-mono) 项目的编码 Agent 能力集成到 AIDocMaster (EcritisAgent) 中，使用户在 AI Chat 界面中可以通过开关切换到 Agent 模式，获得完整的编码 Agent 能力（文件读写、bash 执行、代码搜索等），实现类似 Claude Code 的交互体验。

### 核心目标

1. **无缝集成**：在现有 Chat 界面中添加 Agent 模式开关，用户无需离开当前对话即可使用编码 Agent
2. **复用配置**：Agent 模式使用本项目已有的 LLM 配置体系（ConfigLoader + modelConfig），无需单独配置
3. **完整工具集**：集成 pi-coding-agent 的全部工具（文件读写、bash、搜索、glob、diff 等）
4. **实时反馈**：工具调用过程内联在消息流中展示，提供实时流式响应

## 2. 范围定义

### 纳入范围 (In Scope)

- 安装并集成 `@mariozechner/pi-agent-core` 和 `@mariozechner/pi-ai` npm 包
- 从 `@mariozechner/pi-coding-agent` 提取或引用编码工具集
- 在 ChatInput 上方添加 Agent 模式切换开关
- 创建 Next.js API Route 运行 Agent 循环（SSE 流式响应）
- 编写 LLM 配置适配器：本项目 modelConfig → pi-ai Provider 格式
- Agent 工具调用结果在消息流中内联展示
- 工作目录设置：Settings 页 + 对话中快速弹窗 + 系统文件夹选择器
- Agent 模式与现有 MCP 工具、网络搜索、Advanced Mode 共存但独立
- Agent 状态仅在当前会话内保持

### 排除范围 (Out of Scope)

- 不替换现有的 LangGraph 多 Agent 系统（AutoWriter、DocumentModifier）
- 不引入 pi-mono 的 TUI、Web UI、Slack Bot 等包
- 不引入 pi-ai 的 Provider 配置系统（复用本项目配置）
- 不实现 Agent 状态的跨会话持久化
- 不实现安全沙箱或权限控制（开发者自用场景）
- 不实现 pi-pods (vLLM) 相关功能

## 3. 高层架构

```
用户界面 (React)
├── ChatInput 上方: Agent 模式开关 + 工作目录显示/设置按钮
├── 消息流: 内联展示 Agent 思考、工具调用、执行结果
└── 设置页: Agent 工作目录配置

    ↓ HTTP POST (SSE streaming)

Next.js API Route: /api/agent-chat
├── 接收用户消息 + Agent 模式标志 + 工作目录
├── LLM 适配器: modelConfig → pi-ai StreamOptions
├── 初始化 pi-agent Agent 实例
├── 注册 pi-coding-agent 工具集
├── 运行 Agent Loop
└── 将 AgentEvent 流转换为 SSE data 帧 → 前端

    ↓ 工具调用

文件系统 / Shell (用户指定的工作目录)
├── 文件读写工具
├── Bash 执行工具
├── 代码搜索工具 (grep/glob)
└── Diff 工具
```

### 数据流详解

```
1. 用户消息 → ChatPanel.handleSendMessage()
2. 检测 agentMode 开关状态
3. if agentMode:
   → POST /api/agent-chat { message, workDir, modelId, history }
   → API Route 创建 pi-agent Agent 实例
   → Agent.prompt(message) 启动循环
   → Agent 事件流 → SSE 帧:
     - message_start  → data: {"type":"agent_thinking","content":"..."}
     - tool_execution → data: {"type":"tool_use","name":"...","input":"..."}
     - tool_result    → data: {"type":"tool_result","content":"..."}
     - message_end    → data: {"type":"content","content":"..."}
     - agent_end      → data: {"type":"complete"}
   → 前端解析 SSE → 更新消息流 UI
4. else:
   → 走现有 /api/chat 流程 (不变)
```

## 4. 关键设计决策

### D1: 运行在 Next.js API Route

**理由**：pi-agent 和 pi-coding-agent 都是 TypeScript 包，运行在 Node.js 环境中是最自然的选择。Next.js API Route 已有 SSE 流式响应的基础设施（参考现有 `/api/chat/route.ts`）。

**权衡**：Web 部署模式下，Agent 的文件/shell 操作受限于服务器环境；Electron 模式下则可以完整访问本地文件系统。

### D2: LLM 配置适配器模式

**理由**：本项目已有完善的多类型模型配置系统（standard/codingPlan/custom），pi-ai 也有自己的 Provider 系统。通过适配器桥接，避免引入第二套配置 UI。

**实现**：创建 `agentLlmAdapter.ts`，将本项目的 `call_config` 格式转换为 pi-ai 的 `StreamOptions` 格式。

### D3: 工具集直接引用 pi-coding-agent

**理由**：pi-coding-agent 的工具已经过充分测试。直接引用其工具定义和执行逻辑，避免重复实现。

**风险**：pi-coding-agent 可能有 CLI 专属的依赖（如 terminal 交互），需要适配为 headless 模式。

### D4: Agent 模式与现有功能独立共存

**理由**：Agent 模式有自己完整的工具链（文件、bash、搜索），不需要 MCP 工具和网络搜索。但不隐藏这些控件，避免用户困惑，保持界面一致性。

### D5: 工作目录双入口设置

**理由**：用户需要灵活切换工作目录。Settings 页提供持久化配置，对话中的快速按钮提供便捷切换，系统文件夹选择器提供友好的目录选择体验。

## 5. 依赖项与假设

### 新增依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `@mariozechner/pi-agent-core` | ^0.55.0 | Agent 运行时核心 |
| `@mariozechner/pi-ai` | ^0.55.0 | 统一 LLM API |
| `@mariozechner/pi-coding-agent` | ^0.55.0 | 编码工具集 |

### 关键假设

1. pi-mono 的 npm 包已发布到 npm registry 且可正常安装
2. pi-coding-agent 的工具可以在 headless（非 CLI/非 TUI）模式下运行
3. Next.js API Route 支持长连接 SSE（与现有 `/api/chat` 一致）
4. Electron 环境下，Next.js 服务端进程可以访问本地文件系统
5. 本项目的 modelConfig 可以提供 pi-ai 所需的全部 LLM 配置信息

## 6. 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| pi-coding-agent 工具有 CLI 硬依赖 | 中 | 高 | 检查源码，必要时 fork 或提取工具逻辑 |
| pi-ai LLM 适配器映射不完整 | 低 | 中 | 逐个 Provider 测试，补充映射 |
| Agent 长时间运行导致 API Route 超时 | 中 | 中 | 设置较长超时、实现心跳机制 |
| npm 包版本不兼容 | 低 | 中 | 锁定版本号，逐步升级 |
| Electron 和 Web 模式的文件系统权限差异 | 中 | 低 | Web 模式下提示限制，Electron 模式完整支持 |

## 7. 规划文档目录

| 文件 | 内容 |
|------|------|
| `specs/01-npm-packages-and-llm-adapter.md` | npm 依赖安装、LLM 配置适配器设计 |
| `specs/02-agent-api-route.md` | Next.js API Route 设计：Agent 循环、SSE 流、工具注册 |
| `specs/03-frontend-agent-toggle.md` | 前端 UI：Agent 开关、工作目录选择、消息流展示 |
| `specs/04-workspace-settings.md` | 工作目录设置：Settings 页配置、快速弹窗、系统文件夹选择器 |
| `specs/05-tool-display-and-streaming.md` | 工具调用展示：内联消息组件、流式更新、状态指示 |
| `specs/06-integration-and-testing.md` | 集成测试、端到端验证、Electron 兼容性 |
