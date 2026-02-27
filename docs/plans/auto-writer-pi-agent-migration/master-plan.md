# Master Plan: AutoWriter Pi-Agent 迁移

## 项目概述

将 AIDocMaster 的文档自动写作功能从 LangGraph 架构迁移到 Pi-Agent 架构。当前系统使用 Flask 后端 + LangGraph 状态图实现 5 阶段固定流水线（意图分析→参数提取→大纲生成→分段写作→交付），迁移后将使用 Next.js 服务端 + `@mariozechner/pi-agent-core` 实现自主决策循环，并将原本分离的 AutoWriterAgent（创建文档）和 DocumentModifierAgent（修改文档）合并为统一的文档 Agent。

## 目标

1. **统一架构**：文档 Agent 与编码 Agent 共享相同的 pi-agent 基础设施（Agent 类、事件系统、SSE 流式传输）
2. **自主决策**：去除固定阶段流水线，让 Agent 自主规划和执行文档写作/修改流程
3. **合二为一**：将创建和修改文档的能力统一到一个 Agent 中
4. **Section 粒度操作**：文档编辑操作以 section（章节/段落）为单位，而非整个文档替换
5. **实时同步**：工具调用时实时同步到 TipTap 编辑器
6. **清理旧代码**：完全移除 LangGraph agent 相关代码和依赖

## 范围定义

### 包含（In Scope）

- **新建文档工具集**（5 个文档专用工具 + 编辑器通信机制）
  - `get_document` — 读取编辑器当前内容
  - `update_section` — 按 section 粒度更新文档内容
  - `insert_image` — 在指定位置插入图片
  - `search_web` — 搜索网络参考资料（Tavily）
  - `search_image` — 搜索图片素材（Unsplash）
- **新建 Next.js API 路由**（`/api/doc-agent-chat`）运行 pi-agent 循环
- **新建前端文档工具实现**（`lib/docAgentTools.ts`）
- **修改 AIAutoWriterContainer** — 右侧面板切换为 AgentExecutionTimeline 风格
- **新建文档 Agent 系统提示**（固定专业提示）
- **新建 LLM 适配器扩展**（复用 `agentLlmAdapter.ts`）
- **完全移除 LangGraph 相关代码**
  - `backend/agent/auto_writer_agent.py`
  - `backend/agent/document_agent.py`
  - `backend/agent/agent_router.py`
  - `backend/agent/writer_intent.py`
  - `backend/domains/agent/routes.py`（agent 路由）
  - 前端 `/api/auto-writer/route.ts`
  - 前端 `/api/agent-route/route.ts`（如存在）
  - ChatDialog 中 auto-writer 专用事件处理代码
- **对话历史支持**（保留完整历史，支持清除）
- **事件流映射**（文档工具的 SSE 事件 → 前端编辑器更新）

### 不包含（Out of Scope）

- 编码 Agent（pi-agent coding mode）的修改
- TipTap 编辑器核心功能的改动（保持现有编辑器能力）
- 文档导出功能的改动（Word 导出保持现状）
- 文档验证功能（AIDocValidationContainer 不受影响）
- MCP 工具集成
- 设置页面的改动
- 后端 Flask 其他 domain 的改动（chat、document、model 等）

## 高层架构

### 迁移前（当前）

```
用户输入 → ChatDialog(auto-writer) → POST /api/auto-writer → Flask /api/auto-writer-agent
                                                                     ↓
                                                          AutoWriterAgent (LangGraph)
                                                          5阶段固定流水线：
                                                          1. 意图分析 (LLM)
                                                          2. 参数提取 (LLM)
                                                          3. 大纲生成 (StateGraph)
                                                          4. 分段写作 (Streaming)
                                                          5. 最终交付
                                                                     ↓
                                                          SSE events → 前端 → TipTap
```

### 迁移后（目标）

```
用户输入 → ChatPanel (doc-agent mode) → POST /api/doc-agent-chat
                                              ↓
                                    Next.js API Route
                                    Pi-Agent 自主循环：
                                    ┌─────────────────────┐
                                    │ Agent.prompt(msg)    │
                                    │   ↓                  │
                                    │ LLM 思考 + 决策      │
                                    │   ↓                  │
                                    │ 工具调用 (可选)       │
                                    │   ├─ get_document    │
                                    │   ├─ update_section  │
                                    │   ├─ insert_image    │
                                    │   ├─ search_web      │
                                    │   └─ search_image    │
                                    │   ↓                  │
                                    │ 工具结果 → LLM       │
                                    │   ↓                  │
                                    │ 继续/完成             │
                                    └─────────────────────┘
                                              ↓
                                    SSE events → 前端
                                    ├─ content → 对话气泡
                                    ├─ tool_use → Timeline
                                    ├─ tool_result → Timeline
                                    └─ doc_update → TipTap 编辑器实时更新
```

### 工具与编辑器通信机制

```
Agent 工具调用 (update_section / insert_image)
    ↓
工具执行函数（服务端 Next.js）
    ├─ 验证参数
    ├─ 构建文档操作指令
    └─ 返回工具结果给 Agent
    ↓
同时：SSE event (type: 'doc_update') 发送到前端
    ↓
前端 ChatPanel 接收 doc_update 事件
    ↓
通过回调函数操作 TipTap 编辑器
    ├─ updateSection(index, html) → 编辑器更新对应 section
    └─ insertImage(index, url, desc) → 编辑器插入图片
```

## 关键设计决策

### 1. Pi-Agent vs LangGraph

**决策**：采用 Pi-Agent 自主循环替代 LangGraph 固定阶段

**理由**：
- 与编码 Agent 统一技术栈，降低维护成本
- 自主决策更灵活，无需预定义阶段
- 合并创建/修改能力后，固定阶段不再适用
- Pi-Agent 的工具调用模型天然支持 Section 级别操作

### 2. Section 粒度 vs 整文档替换

**决策**：所有编辑操作基于 Section 粒度

**理由**：
- 用户手动编辑不会被覆盖（只更新对应 section）
- 实时同步体验更好（逐步构建文档，而非一次性替换）
- 更适合修改场景（只修改需要改的 section）
- 减少网络传输和编辑器渲染开销

**Section 定义**：以 `<h2>` 标签分隔的文档块，每个 section 包含一个 h2 标题和其后的内容段落。文档标题 `<h1>` 作为特殊 section（index=0）。

### 3. 运行在 Next.js 服务端

**决策**：文档 Agent 运行在 Next.js API Route 中，不经过 Flask

**理由**：
- 与编码 Agent 架构一致
- 减少一层代理，降低延迟
- 直接使用 TypeScript 实现工具函数
- 无需 Python 依赖

**例外**：search_web 和 search_image 工具如果需要调用已有的 Flask 端点（Tavily、Unsplash），可以从 Next.js 发起请求到 Flask，或直接在 Next.js 中调用第三方 API。

### 4. 文档工具作为"虚拟工具"

**决策**：文档工具（get_document、update_section、insert_image）是与前端编辑器通信的"虚拟工具"，不操作文件系统

**理由**：
- 文档 Agent 操作的是 TipTap 编辑器的内存内容，不是磁盘文件
- 工具执行结果通过 SSE 事件通知前端更新编辑器
- 与编码 Agent 的文件系统工具有本质区别

**实现方式**：
- `get_document`：前端在发送请求时将编辑器内容附带在请求体中，工具直接读取
- `update_section`：工具返回结果后，通过 SSE `doc_update` 事件通知前端
- `insert_image`：同上，通过 `doc_update` 事件通知前端插入图片

### 5. 对话历史管理

**决策**：保留完整对话历史，支持手动清除

**理由**：
- 文档写作是多轮迭代的过程，历史上下文很重要
- 用户可能先让 Agent 创建大纲，再分段写作，再修改
- 清除功能用于重新开始

### 6. 移除 AgentRouter

**决策**：完全移除 AgentRouter 路由器

**理由**：
- 创建和修改合并为统一 Agent 后，不再需要路由
- Agent 自主理解用户意图（创建 vs 修改），无需预先路由

### 7. 去除参数提取步骤

**决策**：不再有显式的写作参数提取阶段

**理由**：
- Agent 通过 system prompt 中的写作规范自行理解用户意图
- 减少不必要的 LLM 调用
- 更自然的对话体验

## 依赖与前提

### 技术依赖
- `@mariozechner/pi-agent-core` — Agent 核心循环
- `@mariozechner/pi-ai` — LLM 接口适配
- TipTap v3 编辑器 — 文档编辑能力（已有）
- Tavily API — 网络搜索（现有 Flask 端点或直接调用）
- Unsplash API — 图片搜索（现有 Flask 端点或直接调用）

### 前提条件
- 现有 pi-agent 编码模式正常运行
- TipTap 编辑器支持按 section 操作（需验证/扩展 `insertImageAfterSection` 等方法）
- 搜索服务配置（Tavily API key、Unsplash API key）可从后端读取

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Pi-Agent 工具注册机制不支持自定义虚拟工具 | 低 | 高 | 研究 pi-agent-core 工具注册 API，必要时包装 |
| Section 粒度操作与 TipTap 编辑器现有 API 不完全匹配 | 中 | 中 | 扩展 WordEditorPanel ref 方法，增加 section 级别操作 |
| 搜索/图片服务的 API Key 获取需要访问 Flask 后端 | 中 | 低 | 通过 Next.js API 代理 Flask 端点，或直接读取配置文件 |
| 一次性移除旧代码可能遗漏依赖 | 低 | 中 | 迁移前完整扫描旧代码的引用链 |
| 对话历史过长导致 token 溢出 | 中 | 中 | 在 system prompt 中设置合理的上下文窗口策略 |
| 文档内容通过请求体传递可能过大 | 低 | 低 | 限制文档大小或使用分片传输 |

## 规划文档目录

| 文件 | 内容 |
|------|------|
| `specs/01-document-agent-tools.md` | 文档 Agent 工具集详细设计：5 个工具的接口、参数、行为 |
| `specs/02-api-route-and-agent-loop.md` | Next.js API 路由设计、Agent 循环配置、SSE 事件流 |
| `specs/03-frontend-ui-integration.md` | 前端 UI 改造：AIAutoWriterContainer、ChatPanel 集成、编辑器同步 |
| `specs/04-system-prompt-and-llm.md` | 系统提示设计、LLM 适配、对话历史管理 |
| `specs/05-legacy-cleanup.md` | 旧代码移除清单、依赖清理、测试验证 |
