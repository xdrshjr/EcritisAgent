# Spec 05: 旧代码移除与清理

## 概述

本文档列出迁移到 pi-agent 后需要完全移除的 LangGraph agent 相关代码，以及需要修改的引用代码。目标是彻底清理旧架构，不保留任何弃用代码。

## 需要删除的文件

### 后端 Python 文件

| 文件路径 | 说明 |
|---------|------|
| `backend/agent/auto_writer_agent.py` | AutoWriter LangGraph Agent（1,443行） |
| `backend/agent/document_agent.py` | DocumentModifier LangGraph Agent |
| `backend/agent/agent_router.py` | AgentRouter 路由器 |
| `backend/agent/writer_intent.py` | 写作意图分析模块 |
| `backend/agent/__init__.py` | Agent 包初始化（如果整个目录清空） |

**注意**：删除前需确认 `backend/agent/` 目录下没有其他非 LangGraph 文件。

### 后端域路由

| 文件路径 | 说明 |
|---------|------|
| `backend/domains/agent/routes.py` | Agent 域 Flask 路由（/api/agents, /api/agent-route, /api/auto-writer-agent, /api/agent-validation） |
| `backend/domains/agent/__init__.py` | Agent 域包初始化 |

**注意**：需确认 `backend/domains/agent/` 目录下没有其他文件需要保留。

### 前端 API 路由

| 文件路径 | 说明 |
|---------|------|
| `app/api/auto-writer/route.ts` | AutoWriter 代理路由 |
| `app/api/agent-route/route.ts` | Agent 路由代理（如存在） |
| `app/api/agent-validation/route.ts` | Agent 验证代理（如存在，需确认 AIDocValidation 是否依赖） |

**重要**：`agent-validation` 路由需要确认是否被 `AIDocValidationContainer` 使用。如果是，该路由应保留（它服务于文档验证功能，不属于本次迁移范围）。

## 需要修改的文件

### 后端

| 文件 | 修改内容 |
|------|---------|
| `backend/app.py` | 移除 agent 域蓝图注册：`app.register_blueprint(agent_bp)` |
| `backend/requirements.txt` | 如果 LangGraph/LangChain 仅用于 agent 功能，可以移除相关依赖 |

**关于 LangChain/LangGraph 依赖**：需要检查以下模块是否仍在使用：
- `langchain` — 可能被 chat 域使用（`llm_factory.py` 中的 `ChatOpenAI`、`ChatAnthropic`）
- `langgraph` — 仅用于 agent，可以移除
- `langchain-openai` — 可能被 `llm_factory.py` 使用
- `langchain-anthropic` — 可能被 `llm_factory.py` 使用

**结论**：`langgraph` 可以安全移除。`langchain`、`langchain-openai`、`langchain-anthropic` 需要检查 `llm_factory.py` 是否仍在使用它们（为 chat 域服务）。

### 前端组件

| 文件 | 修改内容 |
|------|---------|
| `components/AIAutoWriterContainer.tsx` | 替换 ChatDialog 为 DocAgentPanel（Spec 03 已详述） |
| `components/ChatDialog.tsx` | 移除 `agentVariant: 'auto-writer'` 相关代码 |

**ChatDialog.tsx 需要移除的内容**：

1. **Props 相关**：
   - 移除 `agentVariant` prop 及其类型定义
   - 移除 `getDocumentContent` prop
   - 移除 `updateDocumentContent` prop
   - 移除 `insertImageAfterSection` prop

2. **状态和逻辑**：
   - 移除 `isAutoWriterAgent` 判断逻辑
   - 移除 auto-writer 专用事件处理（`parameters`、`section_progress`、`network_search_status`、`article_draft`、`paragraph_summary`、`paragraph_image`）
   - 移除网络搜索开关（`enableNetworkSearch` 状态）
   - 移除 auto-writer 专用的 API URL 选择逻辑
   - 移除 auto-writer 专用的 UI 元素（网络搜索开关等）

3. **简化后**：
   - ChatDialog 只保留 `modal` 和 `embedded` 两种 variant
   - 不再有 `agentVariant` 概念
   - ChatDialog 回归为纯粹的 LLM 对话组件

### 前端 API 配置

| 文件 | 修改内容 |
|------|---------|
| `lib/apiConfig.ts` | 如果有 auto-writer 相关的 URL 构建函数，移除 |

### 主页面

| 文件 | 修改内容 |
|------|---------|
| `app/page.tsx` | 更新 AIAutoWriterContainer 的 props（如有变化） |

## 需要确认不受影响的文件

以下文件不应被本次迁移影响，但需要在清理时验证：

| 文件 | 为什么需要确认 |
|------|---------------|
| `components/AIDocValidationContainer.tsx` | 文档验证功能独立，不使用 LangGraph agent |
| `components/AIChatContainer.tsx` | 普通聊天功能独立 |
| `backend/domains/chat/routes.py` | 聊天域不依赖 agent |
| `backend/domains/document/routes.py` | 文档解析域不依赖 agent |
| `backend/llm_factory.py` | 可能仍被其他域使用 |
| `lib/agentTools.ts` | 编码 Agent 工具，不受影响 |
| `lib/agentEventMapper.ts` | 编码 Agent 事件映射，不受影响 |
| `lib/agentStreamParser.ts` | 编码 Agent 流解析，不受影响 |
| `app/api/agent-chat/route.ts` | 编码 Agent API 路由，不受影响 |

## 清理顺序

为安全起见，按以下顺序执行清理：

### 阶段 1：新代码就绪

在开始清理之前，确保所有新代码已实现并可用：
- [ ] `lib/docAgentTools.ts` — 文档工具创建函数
- [ ] `lib/docSectionParser.ts` — Section 解析器
- [ ] `lib/docAgentPrompt.ts` — 系统提示
- [ ] `lib/docAgentStreamParser.ts` — SSE 流解析器
- [ ] `lib/docEditorOperations.ts` — 编辑器操作函数
- [ ] `app/api/doc-agent-chat/route.ts` — API 路由
- [ ] `components/DocAgentPanel.tsx` — 前端面板组件
- [ ] `components/DocUpdateBlockDisplay.tsx` — 文档更新块组件

### 阶段 2：前端切换

- [ ] 修改 `AIAutoWriterContainer.tsx`：用 DocAgentPanel 替换 ChatDialog
- [ ] 修改 `ChatDialog.tsx`：移除 auto-writer 相关代码
- [ ] 修改 `app/page.tsx`：更新 props（如需要）

### 阶段 3：前端路由清理

- [ ] 删除 `app/api/auto-writer/route.ts`
- [ ] 删除 `app/api/agent-route/route.ts`（如存在）

### 阶段 4：后端清理

- [ ] 删除 `backend/agent/auto_writer_agent.py`
- [ ] 删除 `backend/agent/document_agent.py`
- [ ] 删除 `backend/agent/agent_router.py`
- [ ] 删除 `backend/agent/writer_intent.py`
- [ ] 删除 `backend/domains/agent/routes.py`
- [ ] 修改 `backend/app.py`：移除 agent 蓝图注册
- [ ] 检查并清理不再使用的 Python 依赖

### 阶段 5：验证

- [ ] 确认文档写作功能通过 pi-agent 正常工作
- [ ] 确认文档验证功能不受影响
- [ ] 确认普通聊天功能不受影响
- [ ] 确认编码 Agent 模式不受影响
- [ ] 确认无引用残留（搜索旧模块名确认无导入）

## 代码引用扫描清单

在删除前，搜索以下关键词确保没有遗漏引用：

```
搜索关键词列表：
- "auto_writer_agent" / "AutoWriterAgent"
- "document_agent" / "DocumentAgent" / "DocumentModifierAgent"
- "agent_router" / "AgentRouter"
- "writer_intent" / "analyze_intent" / "IntentResult"
- "agentVariant" / "auto-writer" (在前端代码中)
- "auto-writer-agent" (API 端点路径)
- "agent-route" (API 端点路径)
- "WriterParameters" / "WriterState"
- "build_outline" / "extract_writer_parameters"
- "article_draft" / "section_progress" / "paragraph_summary" / "paragraph_image"
- "network_search_status"
- "enableNetworkSearch" / "enableImageGeneration"
```

## 影响评估

### 功能影响

| 功能 | 影响 | 说明 |
|------|------|------|
| AI 自动写作 | 替换 | LangGraph → Pi-Agent |
| 文档修改 | 合并 | 独立 Agent → 统一 Agent |
| Agent 路由 | 移除 | 不再需要 |
| 文档验证 | 无影响 | 独立功能 |
| AI 聊天 | 微影响 | ChatDialog 移除 auto-writer 变体 |
| 编码 Agent | 无影响 | 完全独立 |
| 设置页面 | 无影响 | 模型配置通用 |

### 依赖影响

| 依赖 | 是否可移除 | 说明 |
|------|-----------|------|
| `langgraph` | ✅ 可以 | 仅 agent 使用 |
| `langchain` | ❌ 保留 | llm_factory.py 使用 |
| `langchain-openai` | ❓ 需确认 | 可能被 llm_factory 使用 |
| `langchain-anthropic` | ❓ 需确认 | 可能被 llm_factory 使用 |

## 文件变动总结

| 操作 | 文件数 |
|------|--------|
| 新增 | 8 个文件 |
| 修改 | 3-5 个文件 |
| 删除 | 6-8 个文件 |
